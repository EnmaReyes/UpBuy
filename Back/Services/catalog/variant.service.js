// Resolucion de la variante exacta de un producto del proveedor.
//
// El catalogo guarda las variaciones en `supplier_product_variations` con sus
// atributos crudos. Para poder comprar una combinacion concreta (color + talla)
// hay que:
//   1. Canonicalizar los nombres de atributo (`TALLA` -> `size`,
//      `COLOR` -> `color`).
//   2. Comparar los valores sin depender de mayusculas ni tildes.
//   3. Exigir que la combinacion pedida identifique UNA sola variacion. Nunca
//      se elige "la primera": si hay ambiguedad se rechaza el pedido.
//
// Este modulo no conoce Wompi ni los proveedores de pedidos: solo la relacion
// entre un producto publicado y sus variaciones.
const {
  SupplierProductVariation,
} = require("../../DataBase/models/index.js");
const {
  cleanValue,
  normalizeAttributeName,
  normalizeAttributeValue,
} = require("../../Utils/attributes.js");

// Atributos con claves canonicas y valores limpios.
const canonicalAttributes = (attributes = {}) => {
  const result = {};
  for (const [rawKey, rawValue] of Object.entries(attributes || {})) {
    const key = normalizeAttributeName(rawKey);
    const value = cleanValue(rawValue);
    if (!key || !value) continue;
    result[key] = value;
  }
  return result;
};

const canonicalizeVariation = (variation) => {
  const json = variation?.toJSON ? variation.toJSON() : variation;
  return {
    ...json,
    attributes: canonicalAttributes(json?.attributes),
  };
};

const loadProductVariations = async (supplierProductId, transaction) => {
  if (!supplierProductId) return [];
  const rows = await SupplierProductVariation.findAll({
    where: { supplierProductId },
    transaction,
  });
  return rows.map(canonicalizeVariation);
};

const attributeValue = (variation, key) =>
  variation?.attributes?.[key] ?? null;

const matchesWanted = (variation, wanted = {}) => {
  for (const key of ["size", "color"]) {
    const expected = wanted?.[key];
    if (expected === undefined || expected === null || expected === "") continue;
    const actual = attributeValue(variation, key);
    if (!actual) return false;
    if (normalizeAttributeValue(actual) !== normalizeAttributeValue(expected)) {
      return false;
    }
  }
  return true;
};

// Devuelve { status, variation?, matches }.
//   status: "sin_variaciones" | "no_encontrado" | "ambiguo" | "ok"
const findExactVariation = (variations, wanted = {}) => {
  const list = (Array.isArray(variations) ? variations : []).filter(Boolean);
  if (list.length === 0) {
    return { status: "sin_variaciones", variation: null, matches: [] };
  }

  const matches = list.filter((variation) => matchesWanted(variation, wanted));
  if (matches.length === 0) {
    return { status: "no_encontrado", variation: null, matches: [] };
  }
  if (matches.length > 1) {
    return { status: "ambiguo", variation: null, matches };
  }
  return { status: "ok", variation: matches[0], matches };
};

const uniqueValues = (variations, key) => {
  const seen = new Map();
  for (const variation of variations || []) {
    const value = attributeValue(variation, key);
    if (!value) continue;
    const normalized = normalizeAttributeValue(value);
    if (normalized && !seen.has(normalized)) seen.set(normalized, value);
  }
  return [...seen.values()];
};

const colorsFromVariations = (variations) => uniqueValues(variations, "color");
const sizesFromVariations = (variations) => uniqueValues(variations, "size");

// Colores por producto del proveedor, en UNA consulta para listados.
// Devuelve un Map<supplierProductId, string[]>.
const colorsBySupplierProduct = async (supplierProductIds) => {
  const ids = [
    ...new Set((supplierProductIds || []).filter(Boolean)),
  ];
  const result = new Map();
  if (ids.length === 0) return result;

  const rows = await SupplierProductVariation.findAll({
    where: { supplierProductId: ids },
  });

  const grouped = new Map();
  for (const row of rows) {
    const list = grouped.get(row.supplierProductId) || [];
    list.push(canonicalizeVariation(row));
    grouped.set(row.supplierProductId, list);
  }

  for (const [id, variations] of grouped.entries()) {
    result.set(id, colorsFromVariations(variations));
  }
  return result;
};

const publicVariant = (variation) => {
  const stock = Math.max(0, Math.trunc(Number(variation?.quantity) || 0));
  return {
    id: variation.id,
    size: attributeValue(variation, "size"),
    color: attributeValue(variation, "color"),
    stock,
    available: Boolean(variation.available) && stock > 0,
    sku: variation.sku ? String(variation.sku) : null,
  };
};

const publicVariants = (variations) => (variations || []).map(publicVariant);

module.exports = {
  canonicalAttributes,
  canonicalizeVariation,
  loadProductVariations,
  findExactVariation,
  colorsFromVariations,
  sizesFromVariations,
  colorsBySupplierProduct,
  publicVariant,
  publicVariants,
};
