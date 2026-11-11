// Resolucion de precios de los productos publicados (modelo Product).
//
// Upbuy es la fuente de verdad: el precio de venta vive en `products.price` y
// NUNCA se recalcula a partir del precio del proveedor. `cost` y `markup` solo
// sirven para sugerir un precio por defecto cuando el administrador todavia no
// ha fijado uno.
//
// Antes esto se resolvia con las tablas price_variants/product_prices (tarifa
// global por talla). Ese modelo no encaja con un catalogo de dropshipping, que
// tiene precios por producto, por eso se retiro.
const { Product } = require("../DataBase/models/index.js");
const HttpError = require("../Utils/HttpError.js");

const PRODUCT_TYPES = ["product"];
const ARTICLE_TIPOS = ["basico", "oversize"];
const COMBO_TIPO = "unico";

const toPlain = (row) => (row?.toJSON ? row.toJSON() : row);

const articleTipo = (product) => (product?.oversize ? "oversize" : "basico");

// Precio sugerido a partir del costo del proveedor y el markup del producto.
const suggestedPrice = (cost, markup) => {
  const base = Number(cost) || 0;
  const pct = Number.isFinite(Number(markup)) ? Number(markup) : 30;
  return Math.round(base * (1 + pct / 100));
};

// Resuelve el precio de un producto.
// Orden: precio fijo del admin -> precio sugerido por costo+markup -> error.
const resolvePrice = async ({ productId, tipo, kind = "unit", transaction }) => {
  const product = await Product.findByPk(productId, {
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });

  if (!product) {
    throw new HttpError(404, "El producto ya no existe");
  }

  const fixed = Number(product.price) || 0;
  const cost = Number(product.cost) || 0;

  let precio = fixed;
  let source = "product";

  if (precio <= 0 && cost > 0) {
    precio = suggestedPrice(cost, product.markup);
    source = "computed";
  }

  if (!Number.isFinite(precio) || precio <= 0) {
    throw new HttpError(409, "El producto no tiene un precio configurado");
  }

  return {
    precio,
    precioAnterior: product.compareAtPrice ? Number(product.compareAtPrice) : null,
    source,
    productId: product.id,
    productType: "product",
    tipo,
    kind,
    activo: product.active,
  };
};

const normalizarDescuentoPorcentaje = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 100) return 0;
  return parsed;
};

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

const buildPriceSnapshot = (price, productType, tipo, kind) => ({
  source: price.source,
  productType,
  tipo,
  kind,
  precio: Number(price.precio),
  precioAnterior: price.precioAnterior ?? null,
  capturedAt: new Date().toISOString(),
});

// Agrega el precio resuelto (con descuento) a un producto, para las vistas de
// admin/catalogo. No se usa en el checkout (alli buildOrderLines arma la linea).
const decorateProduct = async (product, transaction) => {
  const plain = toPlain(product);
  const tipo = product.combo ? COMBO_TIPO : articleTipo(product);
  const price = await resolvePrice({
    productId: product.id,
    tipo,
    transaction,
  });

  const descuentoPorcentaje = normalizarDescuentoPorcentaje(
    plain.descuentoPorcentaje,
  );
  const resultado = aplicarDescuento(price.precio, descuentoPorcentaje);

  return {
    ...plain,
    precio: resultado.precioFinal,
    precioAnterior:
      resultado.descuentoPorcentaje > 0 ? resultado.precioOriginal : null,
    precioOriginal: resultado.precioOriginal || null,
    descuentoPorcentaje: resultado.descuentoPorcentaje,
    descuentoUnitario: resultado.descuentoUnitario,
    price,
  };
};

module.exports = {
  PRODUCT_TYPES,
  ARTICLE_TIPOS,
  COMBO_TIPO,
  articleTipo,
  suggestedPrice,
  resolvePrice,
  normalizarDescuentoPorcentaje,
  aplicarDescuento,
  decorateProduct,
  // Alias historico.
  decorateArticle: decorateProduct,
  buildPriceSnapshot,
};
