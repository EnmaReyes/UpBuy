// Cifrado AES-256-GCM del refresh token de Gmail (ADM-7).
//
// Mismo patron que Services/mfa.js: formato "gmail1:<iv>:<tag>:<datos>" en
// base64. `GMAIL_TOKEN_ENCRYPTION_KEY` es base64 de 32 bytes; la clave previa
// se acepta solo para leer (rotacion). Sin clave NO se cifra ni se guarda en
// claro: `encryptGmailToken` lanza y el llamador responde "Gmail no
// configurado".
//
// Los tokens nunca se registran en logs y nunca salen en respuestas: este
// modulo es la unica puerta.

const crypto = require("crypto");
const {
  GMAIL_TOKEN_ENCRYPTION_KEY,
  GMAIL_TOKEN_ENCRYPTION_KEY_PREVIOUS,
} = require("../../config.js");

const ALGO = "aes-256-gcm";
const PREFIX = "gmail1";
const IV_BYTES = 12;

const currentKey = () => {
  if (!GMAIL_TOKEN_ENCRYPTION_KEY) return null;
  return Buffer.from(GMAIL_TOKEN_ENCRYPTION_KEY, "base64");
};

const previousKey = () => {
  if (!GMAIL_TOKEN_ENCRYPTION_KEY_PREVIOUS) return null;
  return Buffer.from(GMAIL_TOKEN_ENCRYPTION_KEY_PREVIOUS, "base64");
};

// Cifra el token. Devuelve null si no hay entrada (nada que cifrar) y lanza
// con code=GMAIL_KEY_MISSING si falta la clave.
const encryptGmailToken = (plaintext) => {
  const value = String(plaintext || "").trim();
  if (!value) return null;

  const key = currentKey();
  if (!key) {
    const error = new Error("GMAIL_TOKEN_ENCRYPTION_KEY no configurada");
    error.code = "GMAIL_KEY_MISSING";
    throw error;
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    data.toString("base64"),
  ].join(":");
};

// Descifra. Acepta el formato cifrado (prefijo gmail1:) y, durante la
// transicion, un valor guardado en claro por el codigo anterior.
const decryptGmailToken = (payload) => {
  const value = String(payload || "").trim();
  if (!value) return null;

  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    // Legado: token guardado sin cifrar. Se entrega tal cual (solo lectura)
    // y se re-cifrara en la proxima autorizacion.
    return value;
  }

  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const candidates = [currentKey(), previousKey()].filter(Boolean);
  for (const key of candidates) {
    try {
      const decipher = crypto.createDecipheriv(ALGO, key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString(
        "utf8",
      );
    } catch {
      // La clave siguiente podra descifrarlo.
    }
  }

  const error = new Error("No se pudo descifrar el token de Gmail");
  error.code = "GMAIL_TOKEN_UNREADABLE";
  throw error;
};

// Indica si el payload esta en formato cifrado propio.
const isEncryptedGmailToken = (payload) =>
  String(payload || "").startsWith(`${PREFIX}:`);

module.exports = {
  encryptGmailToken,
  decryptGmailToken,
  isEncryptedGmailToken,
};
