// Estado OAuth de Gmail firmado (ADM-7).
//
// El `state` que viaja en la URL de Google es un JWT corto (10 minutos) con
// `purpose: "gmail_oauth"` y el id del admin que inicio el flujo. El callback
// lo valida: purpose, expiracion y que el admin de la sesion coincida.
//
// Ademas viaja en una cookie httpOnly: el callback exige que el state de la
// URL sea igual al de la cookie, asi un atacante no puede inyectar su propio
// code con un state valido de otra sesion.

const jwt = require("jsonwebtoken");
const { JWT_SECRET, JWT_ALGORITHM, JWT_ISSUER, JWT_AUDIENCE } = require("../../config.js");

const PURPOSE = "gmail_oauth";
const TTL_MINUTES = 10;

const createState = (adminId) =>
  jwt.sign({ purpose: PURPOSE, adminId }, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    subject: String(adminId),
    expiresIn: `${TTL_MINUTES}m`,
  });

// Devuelve { adminId } o null si el estado es invalido/expirado/ajeno.
const verifyState = (token, { adminId } = {}) => {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (payload.purpose !== PURPOSE) return null;
    if (adminId && String(payload.adminId) !== String(adminId)) return null;
    return { adminId: payload.adminId, purpose: payload.purpose };
  } catch {
    return null;
  }
};

module.exports = { createState, verifyState, PURPOSE, TTL_MINUTES };
