// Normalizadores de datos de entrada.
//
// El checkout, el perfil y los pedidos reciben los mismos datos de varias
// fuentes (formulario, WhatsApp, importacion). Si cada ruta los limpia a su
// manera, la base termina con "+57 300 123 4567", "3001234567" y
// "57 3001234567" como tres telefonos distintos del mismo cliente.
//
// Telefonos: se guardan en formato E.164 (codigo de pais con +), que es el
// unico formato que los couriers (Dropi/Vendelo) aceptan sin ambiguedad.

// Prefijos por pais. Colombia es el principal; los demas estan porque el
// catalogo es LATAM.
const COUNTRY_CODES = {
  CO: "57",
  MX: "52",
  AR: "54",
  CL: "56",
  PE: "51",
  EC: "593",
  UY: "598",
  PY: "595",
  BO: "591",
  CR: "506",
  PA: "507",
  GT: "502",
  HN: "504",
  NI: "505",
  SV: "503",
  DO: "809",
  PR: "1787",
  VE: "58",
};

const DEFAULT_COUNTRY = "CO";

// Quita tildes y pasa a mayusculas sin tilde: "Medellín" -> "MEDELLIN".
// Se usa para comparar ciudades/departamentos sin depender de como los
// escribio el usuario.
const sinTildes = (texto) =>
  String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

// Espacios colapsados: "  Bogota   D.C. " -> "Bogota D.C."
const colapsarEspacios = (texto) => String(texto).trim().replace(/\s+/g, " ");

// Texto limpio y recortado a un maximo. "" y null se normalizan a null.
const trimText = (value, max = 255) => {
  if (value === undefined || value === null) return null;
  const limpio = colapsarEspacios(value);
  if (!limpio) return null;
  return limpio.slice(0, max);
};

// Email en minusculas, recortado. Devuelve null si no parece un email.
const normalizeEmail = (value) => {
  const limpio = trimText(value, 255);
  if (!limpio) return null;
  const minusculas = limpio.toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(minusculas) ? minusculas : null;
};

// Telefono en E.164 (+573001234567).
//
// Acepta: "+57 300 123 4567", "57 3001234567", "3001234567",
// "300 123 4567", "(300) 123-4567", "00300 123 4567".
// Devuelve null si no hay un numero utilizable.
const normalizePhone = (value, { defaultCountry = DEFAULT_COUNTRY } = {}) => {
  if (value === undefined || value === null) return null;

  const original = String(value).trim();
  if (!original) return null;

  // Prefijo internacional explicito.
  if (original.startsWith("+")) {
    const digitos = original.slice(1).replace(/\D/g, "");
    if (digitos.length < 7 || digitos.length > 15) return null;
    return `+${digitos}`;
  }

  let digitos = original.replace(/\D/g, "");
  if (!digitos) return null;

  // "00..." puede ser el prefijo internacional (0057...) o simplemente un
  // cero de mas en un numero local. Se quita y el resto se decide por
  // longitud: "003001234567" es un movil local, no un pais +30.
  if (digitos.startsWith("00")) digitos = digitos.slice(2);

  const prefijo = COUNTRY_CODES[defaultCountry] || defaultCountry;

  // Ya viene con el codigo de pais + 10 digitos (p. ej. 573001234567).
  if (digitos.startsWith(prefijo) && digitos.length === prefijo.length + 10) {
    return `+${digitos}`;
  }

  // Codigo de pais de otro pais de la region + 10 digitos.
  for (const codigo of Object.values(COUNTRY_CODES)) {
    if (codigo === prefijo) continue;
    if (digitos.startsWith(codigo) && digitos.length === codigo.length + 10) {
      return `+${digitos}`;
    }
  }

  // Numero local de 10 digitos (movil colombiano).
  if (digitos.length === 10) return `+${prefijo}${digitos}`;

  // Movil con 0 inicial: 03001234567.
  if (digitos.length === 11 && digitos.startsWith("0")) {
    return `+${prefijo}${digitos.slice(1)}`;
  }

  // Numero local de 7 digitos (fijo).
  if (digitos.length === 7) return `+${prefijo}${digitos}`;

  return null;
};

// Un telefono es valido si se puede normalizar.
const isValidPhone = (value) => Boolean(normalizePhone(value));

// Direccion en una linea, sin comas ni saltos de linea (los dashboards de
// los couriers rompen con los saltos).
const normalizeAddressLine = (value, max = 255) => {
  const limpio = trimText(value, max);
  if (!limpio) return null;
  return limpio.replace(/[\r\n]+/g, " ").replace(/\s*,\s*/g, ", ");
};

// Direccion completa normalizada: linea, ciudad, departamento y referencia.
const normalizeAddress = ({
  address,
  city,
  department,
  reference = null,
} = {}) => ({
  address: normalizeAddressLine(address, 255),
  city: trimText(city, 100),
  department: trimText(department, 100),
  reference: trimText(reference, 200),
});

// Compara dos textos ignorando tildes, mayusculas y espacios sobrantes.
// Se usa para detectar que el usuario ya completo un campo.
const equalsLoose = (a, b) =>
  sinTildes(colapsarEspacios(a)).toUpperCase() ===
  sinTildes(colapsarEspacios(b)).toUpperCase();

// Clave corta y estable para deduplicar (notificaciones, idempotencia).
const slugify = (value, max = 100) =>
  sinTildes(String(value || ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);

module.exports = {
  COUNTRY_CODES,
  DEFAULT_COUNTRY,
  sinTildes,
  colapsarEspacios,
  trimText,
  normalizeEmail,
  normalizePhone,
  isValidPhone,
  normalizeAddressLine,
  normalizeAddress,
  equalsLoose,
  slugify,
};
