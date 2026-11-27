// Mapeo de pedidos de UpBuy a variantes de MasterShop.
//
// Responsabilidad unica: dado un `order_items` (producto local + talla), decir
// que `id_product` + `id_variant` de MasterShop le corresponden, o explicar
// por que no se puede resolver.
//
// Piezas:
//   - `mastershop.attributes.js` (puro): normaliza nombres/valores y decide
//     entre una variante, varias (ambiguo) o ninguna.
//   - `mastershop_attr_alias` (tabla): excepciones que el codigo no adivina.
//   - `supplier_product_variations`: las variantes reales, guardadas por el
//     normalizador de la Fase 1.
//
// Regla de negocio (aprobada en la Fase 0): si la variante no es unica, el
// pedido NO se crea a medias; queda para revision manual. Nunca se elige "la
// primera" variante.
const {
  Product,
  Supplier,
  SupplierProduct,
  SupplierProductVariation,
  Order,
  OrderItem,
} = require("../DataBase/models/index.js");
const { SUPPLIER_SLUG } = require("../DataBase/models/enums.js");
const {
  normalizeAttributeName,
  normalizeAttributeValue,
  unknownAttributeKeys,
  resolveVariation,
} = require("../integrations/suppliers/mastershop/mastershop.attributes.js");

// ---------------------------------------------------------------------------
// Alias (excepciones)
// ---------------------------------------------------------------------------

const ALIAS_TTL_MS = 60 * 1000;
let aliasCache = { at: 0, maps: { attribute: new Map(), value: new Map() } };

const loadAliasMaps = async ({ force = false } = {}) => {
  if (!force && Date.now() - aliasCache.at < ALIAS_TTL_MS) {
    return aliasCache.maps;
  }

  // Import diferido: el modelo solo existe cuando el esquema esta aplicado.
  const { MastershopAttrAlias } = require("../DataBase/models/index.js");
  const maps = { attribute: new Map(), value: new Map() };

  try {
    const rows = await MastershopAttrAlias.findAll();
    for (const row of rows) {
      const bucket = maps[row.kind];
      if (!bucket) continue;
      const source =
        row.kind === "value"
          ? normalizeAttributeValue(row.source)
          : normalizeAttributeName(row.source);
      if (source) bucket.set(source, row.target);
    }
  } catch {
    // La tabla puede no existir todavia (base sin migrar). El mapeo normal
    // sigue funcionando: los alias son un extra, no un requisito.
  }

  aliasCache = { at: Date.now(), maps };
  return maps;
};

const clearAliasCache = () => {
  aliasCache = { at: 0, maps: { attribute: new Map(), value: new Map() } };
};

// Aplica los alias a un objeto de atributos ya normalizado.
// El alias de valor se compara con la clave canonica y devuelve el `target`
// tal cual lo escribio el administrador.
const applyValueAliases = (attributes, valueAliases) => {
  if (!attributes || valueAliases.size === 0) return attributes || {};
  const result = {};
  for (const [key, value] of Object.entries(attributes)) {
    const normalized = normalizeAttributeValue(value);
    result[key] = valueAliases.get(normalized) ?? value;
  }
  return result;
};

// ---------------------------------------------------------------------------
// Resolucion de un item
// ---------------------------------------------------------------------------

const toVariationShape = (row) => ({
  externalId: String(row.externalId),
  sku: row.sku || null,
  attributes: row.attributes || {},
  available: Boolean(row.available),
  isDefault: false,
  isEnabled: true,
  quantity: Number(row.quantity) || 0,
  rawData: row.rawData || {},
});

// Busca el producto del proveedor y comprueba que sea de MasterShop.
const loadMastershopProduct = async (product) => {
  if (!product?.supplierProductId) {
    return { ok: false, reason: "sin_producto_proveedor" };
  }

  const supplierProduct = await SupplierProduct.findByPk(
    product.supplierProductId,
  );
  if (!supplierProduct) {
    return { ok: false, reason: "producto_proveedor_inexistente" };
  }

  const supplier = await Supplier.findByPk(supplierProduct.supplierId);
  if (!supplier || supplier.slug !== SUPPLIER_SLUG.MASTERSHOP) {
    return { ok: false, reason: "proveedor_no_mastershop" };
  }

  const idProduct = Number(supplierProduct.externalId);
  if (!Number.isInteger(idProduct) || idProduct <= 0) {
    return { ok: false, reason: "id_product_invalido" };
  }

  return { ok: true, supplierProduct, idProduct };
};

// Resuelve UN item. No escribe nada.
//
// Devuelve:
//   { ok: true,  idProduct, idVariant, sku, attributes, variation }
//   { ok: false, reason, idProduct?, candidates? }
//
// `reason`:
//   sin_producto_proveedor | producto_proveedor_inexistente |
//   proveedor_no_mastershop | id_product_invalido |
//   sin_variaciones | no_encontrado | ambiguo | sin_stock
const resolveOrderItem = async ({ orderItem, product = null } = {}) => {
  if (!orderItem) {
    return { ok: false, reason: "sin_item" };
  }

  const localProduct =
    product || (orderItem.productId
      ? await Product.findByPk(orderItem.productId)
      : null);

  if (!localProduct) {
    return { ok: false, reason: "sin_producto_local" };
  }

  const base = await loadMastershopProduct(localProduct);
  if (!base.ok) return base;

  const rows = await SupplierProductVariation.findAll({
    where: { supplierProductId: base.supplierProduct.id },
    order: [["externalId", "ASC"]],
  });

  const aliases = await loadAliasMaps();
  const variations = rows.map(toVariationShape).map((variation) => ({
    ...variation,
    attributes: applyValueAliases(variation.attributes, aliases.value),
  }));

  // Producto sin variaciones vendibles: se crea con `id_product` y sin
  // `id_variant` (MasterShop lo admite cuando no hay variantes). No es un
  // error de mapeo: es un accesorio o un producto de variante unica.
  if (variations.length === 0) {
    return {
      ok: true,
      reason: "sin_variaciones",
      idProduct: base.idProduct,
      idVariant: null,
      sku: null,
      attributes: {},
      variation: null,
    };
  }

  // Variante exacta fijada en el checkout: `order_items.variantId` apunta a la
  // fila de `supplier_product_variations`, que la sincronizacion actualiza en
  // sitio (conserva el UUID). Es mas fiable que re-resolver por talla/color y
  // permite crear pedidos multivariante aunque la linea no traiga atributos.
  if (orderItem.variantId) {
    const stored = rows.find((row) => row.id === orderItem.variantId);
    if (stored) {
      const externalId = Number(stored.externalId);
      if (Number.isInteger(externalId) && externalId > 0) {
        const shape =
          variations.find(
            (variation) => variation.externalId === String(stored.externalId),
          ) || toVariationShape(stored);
        return {
          ok: true,
          reason: "resuelto_por_variante_id",
          idProduct: base.idProduct,
          idVariant: externalId,
          sku: stored.sku || null,
          attributes: shape.attributes || {},
          variation: shape,
        };
      }
    }
    // Si el `variantId` ya no existe (variante retirada del proveedor) se cae
    // al respaldo por talla/color en vez de fallar de inmediato.
  }

  const wanted = {
    size: orderItem.size || null,
    color: orderItem.shirtColor || null,
  };

  const resolved = resolveVariation(variations, wanted, {
    requireStock: false,
  });

  if (!resolved.ok) {
    return {
      ok: false,
      reason: resolved.reason,
      idProduct: base.idProduct,
      candidates: resolved.candidates.map((variation) => ({
        idVariant: Number(variation.externalId),
        sku: variation.sku,
        attributes: variation.attributes,
      })),
    };
  }

  return {
    ok: true,
    reason: "resuelto",
    idProduct: base.idProduct,
    idVariant: Number(resolved.variation.externalId),
    sku: resolved.variation.sku,
    attributes: resolved.variation.attributes,
    variation: resolved.variation,
  };
};

// ---------------------------------------------------------------------------
// Reporte / diagnostico
// ---------------------------------------------------------------------------

// Un producto cuyas variantes se distinguen por algo mas que la talla no se
// puede resolver sin capturar ese atributo.
const isAmbiguousWithoutColor = (variations) => {
  const colors = new Set(
    variations
      .map((variation) => normalizeAttributeValue(variation.attributes?.color))
      .filter(Boolean),
  );
  return colors.size > 1;
};

const PAID_STATES = ["settled", "collected"];

// Huecos de mapeo reales del catalogo publicado de MasterShop.
//
// Devuelve grupos independientes para que el reporte sea accionable:
//   - publishedWithoutVariantLink: producto publicado sin nexo al proveedor.
//   - supplierProductsWithoutVariations: no se podra resolver ningun item.
//   - ambiguousProducts: se distinguen por color; los pedidos nuevos ya
//     envian `{ size, color }`, pero el reporte sigue listando estos productos
//     para detectar variantes duplicadas o sin atributos canonicos.
//   - duplicateSkus: el mismo SKU en varias variantes.
//   - outOfStockVariations: variantes sin unidades.
//   - unknownAttributes: nombres de atributo fuera de {size, color}.
//   - unresolvedPaidItems: items de pedidos con dinero cobrado que no se
//     pueden resolver (con el motivo).
const buildMappingReport = async ({ limit = 500 } = {}) => {
  const suppliers = await Supplier.findAll({
    where: { slug: SUPPLIER_SLUG.MASTERSHOP },
  });
  const supplierIds = suppliers.map((supplier) => supplier.id);

  const supplierProducts = supplierIds.length
    ? await SupplierProduct.findAll({
        where: { supplierId: supplierIds },
        order: [["externalId", "ASC"]],
      })
    : [];

  const products = supplierIds.length
    ? await Product.findAll({ where: { supplierId: supplierIds } })
    : [];
  const linkedIds = new Set(
    products.map((product) => product.supplierProductId).filter(Boolean),
  );

  const variations = supplierProducts.length
    ? await SupplierProductVariation.findAll({
        where: {
          supplierProductId: supplierProducts.map((p) => p.id),
        },
      })
    : [];

  const variationsByProduct = new Map();
  for (const variation of variations) {
    const list = variationsByProduct.get(variation.supplierProductId) || [];
    list.push(variation);
    variationsByProduct.set(variation.supplierProductId, list);
  }

  const publishedWithoutVariantLink = products
    .filter((product) => !product.supplierProductId)
    .map((product) => ({ productId: product.id, name: product.name }));

  const supplierProductsWithoutVariations = supplierProducts
    .filter((sp) => (variationsByProduct.get(sp.id) || []).length === 0)
    .map((sp) => ({
      msIdProduct: Number(sp.externalId),
      name: sp.name,
    }));

  const ambiguousProducts = supplierProducts
    .map((sp) => ({
      msIdProduct: Number(sp.externalId),
      name: sp.name,
      variations: (variationsByProduct.get(sp.id) || []).map(toVariationShape),
    }))
    .filter((entry) => isAmbiguousWithoutColor(entry.variations))
    .map(({ msIdProduct, name, variations: list }) => ({
      msIdProduct,
      name,
      colors: [
        ...new Set(list.map((v) => v.attributes.color).filter(Boolean)),
      ],
    }));

  const skuIndex = new Map();
  for (const variation of variations) {
    if (!variation.sku) continue;
    const key = String(variation.sku).toUpperCase();
    const list = skuIndex.get(key) || [];
    list.push(variation);
    skuIndex.set(key, list);
  }
  const duplicateSkus = [...skuIndex.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([sku, list]) => ({
      sku,
      variants: list.map((variation) => ({
        supplierProductId: variation.supplierProductId,
        idVariant: Number(variation.externalId),
      })),
    }));

  const outOfStockVariations = variations
    .filter((variation) => Number(variation.quantity) <= 0)
    .map((variation) => ({
      idVariant: Number(variation.externalId),
      sku: variation.sku,
      supplierProductId: variation.supplierProductId,
    }));

  const unknownAttributes = [
    ...new Set(variations.flatMap((v) => unknownAttributeKeys(v.attributes))),
  ];

  // Pedidos con dinero cobrado cuyos items no resuelven.
  const orders = await Order.findAll({
    where: { paymentState: PAID_STATES },
    order: [["createdAt", "DESC"]],
    limit,
  });

  const unresolvedPaidItems = [];
  for (const order of orders) {
    const items = await OrderItem.findAll({ where: { orderId: order.id } });
    for (const item of items) {
      const resolution = await resolveOrderItem({ orderItem: item });
      if (!resolution.ok) {
        unresolvedPaidItems.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          title: item.title,
          size: item.size,
          reason: resolution.reason,
          candidates: resolution.candidates || [],
        });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    supplierProducts: supplierProducts.length,
    publishedProducts: products.length,
    variations: variations.length,
    publishedWithoutVariantLink,
    supplierProductsWithoutVariations,
    ambiguousProducts,
    duplicateSkus,
    outOfStockVariations,
    unknownAttributes,
    unresolvedPaidItems,
  };
};

module.exports = {
  loadAliasMaps,
  clearAliasCache,
  applyValueAliases,
  loadMastershopProduct,
  resolveOrderItem,
  buildMappingReport,
  isAmbiguousWithoutColor,
};
