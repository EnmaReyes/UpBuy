// Cifrado de credenciales de proveedores (AES-256-GCM).
//
// Los secretos (client_secret, refresh_token) NUNCA se guardan en texto plano
// en la base. Se cifran con una clave de 32 bytes en base64 que vive en el
// entorno (Vercel / .env.local), nunca en el repositorio.
//
// Formato del valor cifrado (una sola cadena, cabe en TEXT):
//   v1:<iv base64>:<authTag base64>:<ciphertext base64>
//
// `SUPPLIER_CREDENTIALS_ENCRYPTION_KEY_PREVIOUS` permite rotar la clave: al
// descifrar se prueba la actual y, si falla, la anterior.
const crypto = require("crypto");

const {
  SUPPLIER_CREDENTIALS_ENCRYPTION_KEY,
  SUPPLIER_CREDENTIALS_ENCRYPTION_KEY_PREVIOUS,
} = require("../../config.js");

const ALGO = "aes-256-gcm";
const PREFIX = "v1";
const IV_BYTES = 12;

const parseKey = (raw) => {
  const value = String(raw || "").trim();
  if (!value) return null;
  let buffer;
  try {
    buffer = Buffer.from(value, "base64");
  } catch {
    return null;
  }
  return buffer.length === 32 ? buffer : null;
};

const currentKey = () => parseKey(SUPPLIER_CREDENTIALS_ENCRYPTION_KEY);
const previousKey = () =>
  parseKey(SUPPLIER_CREDENTIALS_ENCRYPTION_KEY_PREVIOUS);

// Hay clave configurada y bien formada.
const isConfigured = () => Boolean(currentKey());

const assertConfigured = () => {
  if (!isConfigured()) {
    const error = new Error(
      "SUPPLIER_CREDENTIALS_ENCRYPTION_KEY no configurada (base64 de 32 bytes)",
    );
    error.code = "CREDENTIALS_KEY_MISSING";
    throw error;
  }
};

// Cifra un texto. Devuelve null si el valor es vacio.
const encrypt = (plaintext) => {
  if (plaintext === undefined || plaintext === null || plaintext === "") {
    return null;
  }
  assertConfigured();

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, currentKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
};

// Descifra un valor producido por encrypt(). Devuelve null si no hay valor.
const decrypt = (payload) => {
  if (!payload) return null;

  const parts = String(payload).split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("Credencial cifrada con formato invalido");
  }

  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const data = Buffer.from(parts[3], "base64");

  for (const key of [currentKey(), previousKey()]) {
    if (!key) continue;
    try {
      const decipher = crypto.createDecipheriv(ALGO, key, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(data), decipher.final()]);
      return plain.toString("utf8");
    } catch {
      // Clave equivocada: se prueba la siguiente.
    }
  }

  throw new Error("No se pudo descifrar la credencial (clave incorrecta)");
};

// Deja solo los ultimos 4 caracteres, para logs y respuestas de estado.
const maskSecret = (value) => {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return "***";
  return `***${text.slice(-4)}`;
};

module.exports = { isConfigured, assertConfigured, encrypt, decrypt, maskSecret };
