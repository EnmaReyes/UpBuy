// Autenticacion de MasterShop.
//
// MasterShop NO usa OAuth: todas las peticiones llevan la llave estatica en el
// header `ms-api-key`. El contexto de usuario y negocio lo deriva la plataforma
// de la llave, asi que aqui no hay refresh token, cache de token ni rotacion.
//
// Este modulo existe solo para cumplir el contrato comun de
// `integrations/suppliers/index.js` sin inventar un flujo que no existe.
const { MASTERSHOP_API_KEY } = require("../../../config.js");
const client = require("./mastershop.client.js");

const isConfigured = () => client.isConfigured();

// El "token" es la propia llave. Se devuelve al cliente interno; NUNCA se
// expone en respuestas del panel ni en logs.
const getAccessToken = async () => {
  client.assertConfigured();
  return MASTERSHOP_API_KEY;
};

// Estado sin secretos: solo si hay llave y como va el rate limit.
const getStatus = () => ({
  cached: false,
  accessTokenExpiresAt: null,
  configured: isConfigured(),
  rateLimit: client.getRateLimit(),
});

// Sin cache que invalidar (la llave no expira por contrato).
const invalidate = () => {};

// Credenciales efectivas sin exponer el valor de la llave.
const resolveCredentials = async () => ({
  configured: isConfigured(),
  source: "env",
  variable: "MASTERSHOP_API_KEY",
});

module.exports = {
  isConfigured,
  getAccessToken,
  getStatus,
  invalidate,
  resolveCredentials,
};
