// Mapeo de atributos de MasterShop a las claves canonicas de UpBuy.
//
// MasterShop entrega las opciones de cada variacion asi:
//
//   options: [
//     { propertyName: "COLOR",  nameValue: "NEGRO" },
//     { propertyName: "TALLAS", nameValue: "37" }
//   ]
//
// Verificado contra la API real (2026-11-24): el MISMO concepto llega con
// varias grafias ("COLOR", "Color", "TALLAS", "TALLA", "Talla"). Por eso todo
// nombre pasa por `normalizeAttributeName`, que lo lleva a una clave canonica
// (`color`, `size`) o, si es desconocido, a una clave estable en minusculas.
// Las excepciones (por ejemplo "AZUL MARINO" -> "AZUL") NO se resuelven aqui:
// viven en la tabla `mastershop_attr_alias` y se aplican en la capa de
// servicio. Este archivo es PURO (sin red, sin base de datos) y testeable.
//
// Decision de negocio (Fase 1): el checkout de UpBuy solo captura la TALLA.
// Un producto cuyas variantes se distinguen tambien por color no se puede
// resolver de forma unica, asi que se marca `ambiguous` y va a revision
// manual en lugar de crear un pedido con la variante equivocada.

// Nombre canonico de cada familia de atributos.
const KINDS = {
  SIZE: "size",
  COLOR: "color",
};

// Grafias observadas y sinonimos razonables. Todo se compara ya normalizado
// (minusculas, sin tildes).
const NAME_ALIASES = {
  talla: KINDS.SIZE,
  tallas: KINDS.SIZE,
  talle: KINDS.SIZE,
  tamanos: KINDS.SIZE,
  tamano: KINDS.SIZE,
  size: KINDS.SIZE,
  sizes: KINDS.SIZE,
  color: KINDS.COLOR,
  colores: KINDS.COLOR,
  colour: KINDS.COLOR,
  colors: KINDS.COLOR,
};

// Texto de comparacion: minusculas, sin tildes, espacios colapsados.
const fold = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

// Texto para mostrar/guardar: recorta y colapsa espacios, conserva mayusculas
// originales (MasterShop puede usar "Default Variant", "BRONCE", ...).
const cleanValue = (value, max = 120) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
};

// Clave de comparacion de un valor de atributo ("azul" == "Azul" == "AZUL").
const normalizeAttributeValue = (value) => fold(value).toUpperCase() || null;

// Clave canonica de un nombre de atributo.
//   "TALLAS" -> "size"; "Color" -> "color"; "Material" -> "material".
const normalizeAttributeName = (value) => {
  const folded = fold(value);
  if (!folded) return null;
  if (NAME_ALIASES[folded]) return NAME_ALIASES[folded];
  return folded.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || null;
};

// Una opcion por si sola no dice nada si no trae nombre y valor.
const isUsableOption = (option) =>
  Boolean(option) &&
  Boolean(normalizeAttributeName(option.propertyName)) &&
  Boolean(cleanValue(option.nameValue));

// ¿La variacion es la "Default Variant" que MasterShop agrega siempre?
//
// Verificado en la API real: todos los productos traen una variacion con
// `name: "Default Variant"`, `sku: null`, `options: null` y `stock: 0`. Esa
// fila no representa una talla/color vendible: mandarla en un pedido seria un
// error de negocio. Cuando el producto NO tiene variaciones reales, el pedido
// se crea solo con `id_product` (ver Anexo A del encargo).
const isDefaultVariant = (variation) => {
  const options = variation?.options;
  if (!Array.isArray(options) || options.filter(isUsableOption).length === 0) {
    return true;
  }
  return false;
};

// Convierte `options` en atributos canonicos: { size: "37", color: "NEGRO" }.
// Las claves desconocidas se conservan con su nombre normalizado para poder
// reportarlas (nunca se descartan en silencio).
const attributesFromOptions = (options) => {
  if (!Array.isArray(options)) return {};
  const attributes = {};
  for (const option of options) {
    if (!isUsableOption(option)) continue;
    const key = normalizeAttributeName(option.propertyName);
    const value = cleanValue(option.nameValue);
    if (!key || !value) continue;
    attributes[key] = value;
  }
  return attributes;
};

// Claves de atributo que el flujo de creacion de pedidos sabe usar.
const KNOWN_ATTRIBUTE_KEYS = Object.values(KINDS);

const unknownAttributeKeys = (attributes) =>
  Object.keys(attributes || {}).filter(
    (key) => !KNOWN_ATTRIBUTE_KEYS.includes(key),
  );

// Tallas distintas que ofrece un conjunto de variaciones ya normalizadas.
//
// Regla propia de MasterShop: la talla sale de `attributes.size`. No se usa
// el "primer valor del objeto" (que en un producto solo-color devolveria el
// color como si fuera una talla).
const sizesOf = (variations) => {
  const sizes = new Set();
  for (const variation of variations || []) {
    if (variation?.isDefault) continue;
    if (variation?.isEnabled === false) continue;
    const size = variation?.attributes?.size;
    if (size) sizes.add(String(size));
  }
  return [...sizes];
};

// Compara la variante contra lo pedido. Devuelve null si no coincide.
const matchesWanted = (attributes, wanted) => {
  for (const key of KNOWN_ATTRIBUTE_KEYS) {
    const expected = wanted?.[key];
    if (expected === undefined || expected === null || expected === "") {
      continue;
    }
    const actual = attributes?.[key];
    if (!actual) return false;
    if (normalizeAttributeValue(actual) !== normalizeAttributeValue(expected)) {
      return false;
    }
  }
  return true;
};

// Resuelve la variante de MasterShop para un item del pedido.
//
// Entrada (variaciones ya normalizadas por mastershop.normalize.js):
//   [{ externalId: "753806", sku: "M101", attributes: { size: "37", color: "BRONCE" },
//      available: true, isDefault: false, isEnabled: true, ... }]
//
// `wanted` admite { size, color }. Solo se comparan las claves presentes: si
// el pedido no trae color, un producto multicolor produce VARIAS coincidencias
// y el resultado es `ambiguous` (decision de negocio: revision manual).
//
// Devuelve { ok, variation, reason, candidates }:
//   reason: "sin_variaciones" | "no_encontrado" | "ambiguo" | "sin_stock"
const resolveVariation = (variations, wanted = {}, { requireStock = true } = {}) => {
  const list = Array.isArray(variations) ? variations : [];
  const usable = list.filter(
    (variation) => variation && variation.isDefault !== true,
  );

  if (usable.length === 0) {
    return { ok: false, variation: null, reason: "sin_variaciones", candidates: [] };
  }

  const matches = usable.filter((variation) =>
    matchesWanted(variation.attributes, wanted),
  );

  if (matches.length === 0) {
    return { ok: false, variation: null, reason: "no_encontrado", candidates: [] };
  }

  if (matches.length > 1) {
    // Se desempatan por stock: si solo UNA tiene unidades, es la elegida.
    // Con dos o mas candidatas vivas no se adivina: revision manual.
    const withStock = requireStock
      ? matches.filter((variation) => variation.available !== false)
      : matches;
    if (withStock.length === 1) {
      return {
        ok: true,
        variation: withStock[0],
        reason: "resuelto",
        candidates: matches,
      };
    }
    return {
      ok: false,
      variation: null,
      reason: "ambiguo",
      candidates: matches,
    };
  }

  const [only] = matches;
  if (requireStock && only.available === false) {
    return {
      ok: false,
      variation: null,
      reason: "sin_stock",
      candidates: matches,
    };
  }

  return { ok: true, variation: only, reason: "resuelto", candidates: matches };
};

module.exports = {
  KINDS,
  KNOWN_ATTRIBUTE_KEYS,
  fold,
  cleanValue,
  normalizeAttributeName,
  normalizeAttributeValue,
  isUsableOption,
  isDefaultVariant,
  attributesFromOptions,
  unknownAttributeKeys,
  sizesOf,
  matchesWanted,
  resolveVariation,
};
