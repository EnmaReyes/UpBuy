// MFA TOTP de administradores (ADM-S2).
//
// Este modulo concentra la criptografia y el ciclo de vida del segundo factor:
//
//   - TOTP RFC 6238 (SHA1, 6 digitos, paso de 30 s, ventana +/-1).
//   - Cifrado AES-256-GCM del secreto TOTP en `usuarios.mfaSecretEncrypted`.
//   - Codigos de respaldo de un solo uso (hash bcrypt).
//   - Retos de login en `admin_mfa_challenges` con bloqueo por intentos.
//   - Ticket de enrolamiento de corta vida (JWT con audiencia propia).
//
// No decide permisos ni escribe la cookie de sesion: eso vive en
// Controllers/auth.js. Los errores de validacion devuelven objetos
// `{ ok: false, status, code }` para que el controller responda sin filtrar
// si el usuario existe o si el codigo era TOTP o de respaldo.

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const {
  JWT_SECRET,
  JWT_ALGORITHM,
  JWT_ISSUER,
  ADMIN_MFA_ENCRYPTION_KEY,
  ADMIN_MFA_ENCRYPTION_KEY_PREVIOUS,
  ADMIN_MFA_CHALLENGE_MINUTES,
  ADMIN_MFA_MAX_ATTEMPTS,
  ADMIN_MFA_ISSUER,
} = require("../config.js");
const {
  AdminMfaChallenge,
  AdminBackupCode,
  Usuarios,
  sequelize,
} = require("../DataBase/models/index.js");

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;
const TOTP_SECRET_BYTES = 20;

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_BYTES = 5;

const ENCRYPTION_ALGO = "aes-256-gcm";
const ENCRYPTION_PREFIX = "mfa1";
const IV_BYTES = 12;

const ENROLLMENT_TICKET_AUDIENCE = "upbuy-mfa";
const ENROLLMENT_TICKET_PURPOSE = "mfa_enroll";
const ENROLLMENT_TICKET_TTL = "10m";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// ---------------------------------------------------------------------------
// Base32 (RFC 4648, sin relleno). Google Authenticator y Authy lo esperan asi.
// ---------------------------------------------------------------------------

const base32Encode = (buffer) => {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
};

const base32Decode = (input) => {
  const normalized = String(input || "")
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/[^A-Z2-7]/g, "");

  let bits = 0;
  let value = 0;
  const bytes = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
};

// ---------------------------------------------------------------------------
// TOTP
// ---------------------------------------------------------------------------

const generateTotpSecret = () =>
  base32Encode(crypto.randomBytes(TOTP_SECRET_BYTES));

const hotp = (secret, counter) => {
  const counterBuffer = Buffer.alloc(8);
  const high = Math.floor(counter / 0x100000000);
  const low = counter % 0x100000000;
  counterBuffer.writeUInt32BE(high, 0);
  counterBuffer.writeUInt32BE(low, 4);

  const hmac = crypto
    .createHmac("sha1", base32Decode(secret))
    .update(counterBuffer)
    .digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
};

// Codigo TOTP para un instante dado. `time` en milisegundos.
const generateTotp = (secret, { time = Date.now() } = {}) => {
  const counter = Math.floor(time / 1000 / TOTP_STEP_SECONDS);
  return hotp(secret, counter);
};

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

// Acepta el codigo dentro de +/- una ventana para tolerar relojes desfasados.
const verifyTotp = (secret, code, { time = Date.now() } = {}) => {
  const normalized = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;

  const counter = Math.floor(time / 1000 / TOTP_STEP_SECONDS);
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    const candidate = hotp(secret, counter + offset);
    if (safeEqual(candidate, normalized)) return true;
  }
  return false;
};

// ---------------------------------------------------------------------------
// Cifrado del secreto TOTP (AES-256-GCM)
// ---------------------------------------------------------------------------

const parseKey = (raw) => {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const buffer = Buffer.from(value, "base64");
    return buffer.length === 32 ? buffer : null;
  } catch {
    return null;
  }
};

const currentKey = () => parseKey(ADMIN_MFA_ENCRYPTION_KEY);
const previousKey = () => parseKey(ADMIN_MFA_ENCRYPTION_KEY_PREVIOUS);

const encryptSecret = (plaintext) => {
  if (!plaintext) return null;
  const key = currentKey();
  if (!key) {
    const error = new Error("ADMIN_MFA_ENCRYPTION_KEY no configurada");
    error.code = "MFA_KEY_MISSING";
    throw error;
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);

  return [
    ENCRYPTION_PREFIX,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
};

const decryptSecret = (payload) => {
  if (!payload) return null;
  const parts = String(payload).split(":");
  if (parts.length !== 4 || parts[0] !== ENCRYPTION_PREFIX) {
    throw new Error("Secreto MFA con formato invalido");
  }

  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const data = Buffer.from(parts[3], "base64");

  for (const key of [currentKey(), previousKey()]) {
    if (!key) continue;
    try {
      const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, key, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(data), decipher.final()]);
      return plain.toString("utf8");
    } catch {
      // Clave anterior o dato manipulado: se prueba la siguiente.
    }
  }

  const error = new Error("No se pudo descifrar el secreto MFA");
  error.code = "MFA_SECRET_UNREADABLE";
  throw error;
};

// ---------------------------------------------------------------------------
// Codigos de respaldo
// ---------------------------------------------------------------------------

// Quita guiones/espacios y pasa a mayusculas. El formato visible es
// XXXXX-XXXXX, pero se compara siempre normalizado.
const normalizeBackupCode = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const generateBackupCodes = (count = BACKUP_CODE_COUNT) => {
  const codes = [];
  for (let index = 0; index < count; index += 1) {
    const raw = crypto.randomBytes(BACKUP_CODE_BYTES).toString("hex").toUpperCase();
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
};

const hashBackupCode = (code) => bcrypt.hash(normalizeBackupCode(code), 10);

// Busca un codigo sin usar y lo marca. Devuelve true si lo consumio.
const consumeBackupCode = async (userId, code) => {
  const normalized = normalizeBackupCode(code);
  if (!normalized) return false;

  const candidates = await AdminBackupCode.findAll({
    where: { userId, usedAt: null },
  });

  for (const candidate of candidates) {
    const matches = await bcrypt.compare(normalized, candidate.codeHash);
    if (!matches) continue;

    const [updated] = await AdminBackupCode.update(
      { usedAt: new Date() },
      { where: { id: candidate.id, usedAt: null } },
    );
    return updated > 0;
  }

  return false;
};

// ---------------------------------------------------------------------------
// Ticket de enrolamiento
// ---------------------------------------------------------------------------

const createEnrollmentTicket = (user) =>
  jwt.sign(
    { id: user.id, purpose: ENROLLMENT_TICKET_PURPOSE },
    JWT_SECRET,
    {
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: ENROLLMENT_TICKET_AUDIENCE,
      subject: String(user.id),
      expiresIn: ENROLLMENT_TICKET_TTL,
    },
  );

const verifyEnrollmentTicket = (token) => {
  const payload = jwt.verify(token, JWT_SECRET, {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: ENROLLMENT_TICKET_AUDIENCE,
  });

  if (payload.purpose !== ENROLLMENT_TICKET_PURPOSE) {
    const error = new Error("Ticket de enrolamiento invalido");
    error.code = "MFA_TICKET_INVALID";
    throw error;
  }

  return payload;
};

const buildOtpauthUrl = ({ secret, account }) => {
  const issuer = ADMIN_MFA_ISSUER;
  const label = `${issuer}:${account || "admin"}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
};

// ---------------------------------------------------------------------------
// Enrolamiento
// ---------------------------------------------------------------------------

// Genera secreto + codigos nuevos y los persiste. MFA queda DESACTIVADO hasta
// que `completeEnrollment` valide un TOTP. Reejecutarlo invalida el secreto y
// los codigos anteriores (unico estado valido: el ultimo setup).
const beginEnrollment = async ({ userId }) => {
  const user = await Usuarios.findByPk(userId);
  if (!user) {
    const error = new Error("Usuario no encontrado");
    error.status = 404;
    throw error;
  }

  const secret = generateTotpSecret();
  const encrypted = encryptSecret(secret);
  const backupCodes = generateBackupCodes();
  const hashes = await Promise.all(backupCodes.map(hashBackupCode));

  const transaction = await sequelize.transaction();
  try {
    await AdminBackupCode.destroy({ where: { userId }, transaction });
    await AdminBackupCode.bulkCreate(
      hashes.map((codeHash) => ({ userId, codeHash })),
      { transaction },
    );
    await user.update(
      {
        mfaSecretEncrypted: encrypted,
        mfaEnabled: false,
        mfaEnrolledAt: null,
      },
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // La conexion pudo caerse: el rollback ya no aplica.
    }
    throw error;
  }

  const account = user.email || user.username || String(user.id);
  return {
    secret,
    backupCodes,
    otpauthUrl: buildOtpauthUrl({ secret, account }),
    issuer: ADMIN_MFA_ISSUER,
    account,
  };
};

// Valida el primer TOTP y activa MFA. No emite sesion: eso lo hace el
// controller despues de confirmar el ticket.
const completeEnrollment = async ({ user, code }) => {
  if (!user?.mfaSecretEncrypted) {
    return { ok: false, status: 409, code: "MFA_ENROLLMENT_REQUIRED" };
  }

  const secret = decryptSecret(user.mfaSecretEncrypted);
  if (!verifyTotp(secret, code)) {
    return { ok: false, status: 401, code: "MFA_INVALID_CODE" };
  }

  await user.update({
    mfaEnabled: true,
    mfaEnrolledAt: new Date(),
  });

  return { ok: true, user };
};

// Verifica un codigo suelto (TOTP o respaldo) para step-up (ADM-S3). No crea
// reto ni incrementa intentos: el limite de peticiones lo pone la ruta.
const verifyAdminCode = async ({ user, code } = {}) => {
  if (!user || !code) {
    return { ok: false, status: 400, code: "MFA_CODE_REQUIRED" };
  }

  if (user.mfaEnabled && user.mfaSecretEncrypted) {
    try {
      const secret = decryptSecret(user.mfaSecretEncrypted);
      if (verifyTotp(secret, code)) {
        return { ok: true, method: "totp" };
      }
    } catch {
      // Secreto ilegible: se intenta el codigo de respaldo.
    }
  }

  if (await consumeBackupCode(user.id, code)) {
    return { ok: true, method: "backup_code" };
  }

  return { ok: false, status: 401, code: "MFA_INVALID_CODE" };
};

// ---------------------------------------------------------------------------
// Retos de login
// ---------------------------------------------------------------------------

const createLoginChallenge = async ({ userId }) => {
  const now = new Date();
  return AdminMfaChallenge.create({
    userId,
    purpose: "login",
    expiresAt: new Date(
      now.getTime() + Number(ADMIN_MFA_CHALLENGE_MINUTES) * 60 * 1000,
    ),
  });
};

// Verifica el codigo de un reto de login. Devuelve `{ ok: true, user, method }`
// o `{ ok: false, status, code, attemptsRemaining? }`.
//
// El mensaje nunca revela si el reto existe, si expiro o si el codigo era
// TOTP o de respaldo: solo distingue el bloqueo, que es informacion util para
// el usuario legitimo.
const verifyLoginChallenge = async ({ challengeId, code }) => {
  if (!challengeId) {
    return { ok: false, status: 400, code: "MFA_CHALLENGE_REQUIRED" };
  }

  const challenge = await AdminMfaChallenge.findOne({
    where: { id: String(challengeId), purpose: "login" },
  });

  if (!challenge) {
    return { ok: false, status: 401, code: "MFA_CHALLENGE_INVALID" };
  }

  if (challenge.usedAt) {
    const maxAttempts = Math.max(1, Number(ADMIN_MFA_MAX_ATTEMPTS) || 5);
    if (Number(challenge.attempts || 0) >= maxAttempts) {
      return {
        ok: false,
        status: 401,
        code: "MFA_CHALLENGE_LOCKED",
        attemptsRemaining: 0,
      };
    }
    return { ok: false, status: 401, code: "MFA_CHALLENGE_USED" };
  }

  if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
    return { ok: false, status: 401, code: "MFA_CHALLENGE_EXPIRED" };
  }

  const maxAttempts = Math.max(1, Number(ADMIN_MFA_MAX_ATTEMPTS) || 5);
  if (Number(challenge.attempts || 0) >= maxAttempts) {
    return { ok: false, status: 401, code: "MFA_CHALLENGE_LOCKED" };
  }

  const user = await Usuarios.findByPk(challenge.userId, {
    attributes: [
      "id",
      "username",
      "email",
      "role",
      "admin",
      "disabled",
      "tokenVersion",
      "mfaEnabled",
      "mfaSecretEncrypted",
      "mfaEnrolledAt",
      "lastLoginAt",
      "lastLoginIp",
    ],
  });

  if (!user || user.disabled) {
    return { ok: false, status: 401, code: "MFA_CHALLENGE_INVALID" };
  }

  let method = null;

  if (user.mfaEnabled && user.mfaSecretEncrypted) {
    try {
      const secret = decryptSecret(user.mfaSecretEncrypted);
      if (verifyTotp(secret, code)) method = "totp";
    } catch {
      // Secreto ilegible: se intenta el codigo de respaldo.
    }
  }

  if (!method && (await consumeBackupCode(user.id, code))) {
    method = "backup_code";
  }

  if (method) {
    challenge.usedAt = new Date();
    challenge.attempts = Number(challenge.attempts || 0) + 1;
    await challenge.save();
    return { ok: true, user, method };
  }

  challenge.attempts = Number(challenge.attempts || 0) + 1;
  const locked = challenge.attempts >= maxAttempts;
  if (locked) challenge.usedAt = new Date();
  await challenge.save();

  return {
    ok: false,
    status: 401,
    code: locked ? "MFA_CHALLENGE_LOCKED" : "MFA_INVALID_CODE",
    attemptsRemaining: Math.max(0, maxAttempts - challenge.attempts),
  };
};

// Limpieza de retos vencidos. Se puede llamar desde un cron o al arrancar.
const purgeExpiredChallenges = async ({ olderThanHours = 24 } = {}) => {
  const cutoff = new Date(
    Date.now() - Math.max(1, Number(olderThanHours) || 24) * 60 * 60 * 1000,
  );
  return AdminMfaChallenge.destroy({
    where: {
      [Op.or]: [
        { expiresAt: { [Op.lt]: cutoff } },
        { usedAt: { [Op.lt]: cutoff } },
      ],
    },
  });
};

module.exports = {
  TOTP_DIGITS,
  TOTP_STEP_SECONDS,
  TOTP_WINDOW,
  BACKUP_CODE_COUNT,
  base32Encode,
  base32Decode,
  generateTotpSecret,
  generateTotp,
  verifyTotp,
  encryptSecret,
  decryptSecret,
  normalizeBackupCode,
  generateBackupCodes,
  hashBackupCode,
  consumeBackupCode,
  createEnrollmentTicket,
  verifyEnrollmentTicket,
  buildOtpauthUrl,
  verifyAdminCode,
  beginEnrollment,
  completeEnrollment,
  createLoginChallenge,
  verifyLoginChallenge,
  purgeExpiredChallenges,
};
