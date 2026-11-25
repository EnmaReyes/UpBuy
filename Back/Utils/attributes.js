// Utilidades puras de atributos de variacion.
//
// Los proveedores entregan el mismo concepto con grafias distintas ("COLOR",
// "Color", "TALLAS", "TALLA", ...). Estas funciones las llevan a claves
// canonicas y valores comparables. No conocen ningun proveedor ni tocan la
// base de datos: se usan en el catalogo, en los pedidos y en la resolucion de
// variantes.

// Familias canonicas de atributos que el checkout sabe capturar.
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

module.exports = {
  KINDS,
  NAME_ALIASES,
  fold,
  cleanValue,
  normalizeAttributeValue,
  normalizeAttributeName,
};
