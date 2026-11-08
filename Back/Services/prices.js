const { Op } = require("sequelize");
const {
  PriceVariant,
  ProductPrice,
} = require("../DataBase/models/index.js");

const PRODUCT_TYPES = ["articulo", "dtf"];
const ARTICLE_TIPOS = ["basico", "oversize"];

const toPlain = (row) => (row?.toJSON ? row.toJSON() : row);

const normalizePrevious = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const articleTipo = (articulo) =>
  articulo?.oversize ? "oversize" : "basico";

// tipo que usa un combo: no depende de la talla
const COMBO_TIPO = "unico";

// Resuelve el precio de un producto. La excepcion activa gana sobre la
// tarifa global. Devuelve null si no hay ninguna fila valida.
const resolvePrice = async ({
  productType,
  productId,
  tipo,
  kind = "unit",
  transaction,
}) => {
  const [global, override] = await Promise.all([
    PriceVariant.findOne({
      where: { productType, tipo, activo: true },
      transaction,
    }),
    ProductPrice.findOne({
      where: {
        productType,
        productId,
        tipo,
        kind,
        activo: true,
      },
      transaction,
    }),
  ]);

  const source = override || global;

  if (!source) return null;

  const precio = Number(source.precio);
  if (!Number.isFinite(precio) || precio <= 0) return null;

  return {
    ...toPlain(source),
    precio,
    precioAnterior: normalizePrevious(source.precioAnterior),
    source: override ? "product" : "global",
    priceVariantId: global?.id || null,
    productPriceId: override?.id || null,
  };
};

const getGlobalPriceMap = async (productType, transaction) => {
  const rows = await PriceVariant.findAll({
    where: { productType, activo: true },
    transaction,
  });

  return new Map(rows.map((row) => [row.tipo, row]));
};

const getOverrides = async (productType, productIds, transaction) => {
  if (!productIds.length) return [];

  const rows = await ProductPrice.findAll({
    where: {
      productType,
      productId: { [Op.in]: productIds },
      activo: true,
    },
    transaction,
  });

  return rows.map(toPlain);
};

const findOverride = (overrides, productId, tipo, kind) =>
  overrides.find(
    (row) =>
      row.productId === productId &&
      row.tipo === tipo &&
      row.kind === kind,
  ) || null;

const buildPriceFields = (price, source) => ({
  precio: Number(price?.precio) || null,
  precioAnterior: normalizePrevious(price?.precioAnterior),
  priceSource: source,
});

// Normaliza el porcentaje de descuento individual del articulo.
// null/undefined/0 = sin descuento. Valores invalidos se tratan como 0
// (la escritura ya valida en el modelo/controlador; aqui se defiende el
// calculo para no romper listados si llega basura).
const normalizarDescuentoPorcentaje = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 100) return 0;
  return parsed;
};

// Unica fuente de verdad del calculo de descuento individual por articulo.
// Recibe el precio efectivo ya resuelto (global/excepcion/combo) y el
// porcentaje, y devuelve el precio final a cobrar junto con el desglose.
// El porcentaje se aplica UNA sola vez, en el backend.
const aplicarDescuento = (precioBase, descuentoPorcentaje) => {
  const pct = normalizarDescuentoPorcentaje(descuentoPorcentaje);
  const precioOriginal =
    Number.isFinite(Number(precioBase)) && Number(precioBase) > 0
      ? Math.round(Number(precioBase))
      : 0;

  if (pct === 0) {
    return {
      precioOriginal,
      precioFinal: precioOriginal,
      descuentoPorcentaje: 0,
      descuentoUnitario: 0,
    };
  }

  const precioFinal = Math.round((precioOriginal * (100 - pct)) / 100);

  return {
    precioOriginal,
    precioFinal,
    descuentoPorcentaje: pct,
    descuentoUnitario: Math.max(precioOriginal - precioFinal, 0),
  };
};

// Agrega los precios resueltos a una lista de articulos. Hace 2 consultas
// en total, no una por producto.
const decorateArticles = async (articulos, transaction) => {
  const list = (articulos || []).map(toPlain);
  if (list.length === 0) return [];

  const [globalMap, overrides] = await Promise.all([
    getGlobalPriceMap("articulo", transaction),
    getOverrides(
      "articulo",
      list.map((articulo) => articulo.id),
      transaction,
    ),
  ]);

  return list.map((articulo) => {
    const tipo = articleTipo(articulo);
    const global = globalMap.get(tipo);

    const unitOverride = findOverride(
      overrides,
      articulo.id,
      tipo,
      "unit",
    );
    const comboOverride = findOverride(
      overrides,
      articulo.id,
      COMBO_TIPO,
      "combo",
    );

    const unitPrice = unitOverride || global;
    const effective = articulo.combo ? comboOverride : unitPrice;

    const unitFields = buildPriceFields(
      unitPrice,
      unitOverride ? "product" : global ? "global" : null,
    );
    const effectiveSource = articulo.combo
      ? comboOverride
        ? "product"
        : null
      : unitOverride
        ? "product"
        : global
          ? "global"
          : null;
    const effectiveFields = buildPriceFields(effective, effectiveSource);

    // Descuento individual por articulo: se aplica sobre el precio efectivo
    // ya resuelto (global o excepcion). Los combos quedan excluidos por
    // decision de negocio, aunque traiga el campo marcado.
    const descuentoPorcentaje = articulo.combo
      ? 0
      : normalizarDescuentoPorcentaje(articulo.descuentoPorcentaje);
    const resultado = aplicarDescuento(
      effectiveFields.precio,
      descuentoPorcentaje,
    );

    return {
      ...articulo,
      ...effectiveFields,
      // `precio` pasa a ser el precio final con descuento (es lo que cobra
      // carrito/checkout). `precioAnterior` muestra el precio original
      // tachado cuando hay descuento activo.
      precio: resultado.precioFinal || effectiveFields.precio,
      precioAnterior:
        resultado.descuentoPorcentaje > 0
          ? resultado.precioOriginal
          : effectiveFields.precioAnterior,
      precioOriginal: resultado.precioOriginal || null,
      descuentoPorcentaje: resultado.descuentoPorcentaje,
      descuentoUnitario: resultado.descuentoUnitario,
      // Precio de la tarifa unitaria, por si la UI necesita mostrarlo
      // aunque el articulo sea combo.
      precioUnitario: unitFields.precio,
      precioUnitarioAnterior: unitFields.precioAnterior,
      precioCombo: comboOverride
        ? Number(comboOverride.precio) || null
        : null,
      precioAnteriorCombo: normalizePrevious(
        comboOverride?.precioAnterior,
      ),
      tieneCombo: Boolean(articulo.combo && comboOverride),
    };
  });
};

const decorateArticle = async (articulo, transaction) => {
  const [decorated] = await decorateArticles([articulo], transaction);
  return decorated;
};

// Agrega priceVariants (compatibilidad con el frontend actual) y los campos
// precio/precioAnterior a una lista de DTF.
const decorateDtfs = async (dtfs, transaction) => {
  const list = (dtfs || []).map(toPlain);
  if (list.length === 0) return [];

  const [globalMap, overrides] = await Promise.all([
    getGlobalPriceMap("dtf", transaction),
    getOverrides(
      "dtf",
      list.map((dtf) => dtf.id),
      transaction,
    ),
  ]);

  return list.map((dtf) => {
    const priceVariants = ARTICLE_TIPOS.map((tipo) => {
      const override = findOverride(
        overrides,
        dtf.id,
        tipo,
        "unit",
      );
      const global = globalMap.get(tipo);
      const source = override || global;

      return {
        id: source?.id || `${dtf.id}:${tipo}`,
        tipo,
        precio: Number(source?.precio) || null,
        precioAnterior: normalizePrevious(source?.precioAnterior),
        activo: source ? source.activo !== false : false,
        source: override ? "product" : global ? "global" : null,
        productPriceId: override?.id || null,
        priceVariantId: global?.id || null,
      };
    });

    const basico = priceVariants.find((variant) => variant.tipo === "basico");

    return {
      ...dtf,
      priceVariants,
      precio: basico?.precio || null,
      precioAnterior: basico?.precioAnterior || null,
      priceSource: basico?.source || null,
    };
  });
};

const decorateDtf = async (dtf, transaction) => {
  const [decorated] = await decorateDtfs([dtf], transaction);
  return decorated;
};

module.exports = {
  PRODUCT_TYPES,
  ARTICLE_TIPOS,
  COMBO_TIPO,
  articleTipo,
  normalizePrevious,
  normalizarDescuentoPorcentaje,
  aplicarDescuento,
  resolvePrice,
  decorateArticles,
  decorateArticle,
  decorateDtfs,
  decorateDtf,
  getGlobalPriceMap,
  getOverrides,
};
