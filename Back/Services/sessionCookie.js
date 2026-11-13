// Cookie de sesion de UPBUY (ADM-S4).
//
// En produccion el nombre es `__Host-upbuy_session`, que el navegador solo
// acepta con `Secure`, `Path=/` y sin `Domain`. Eso impide que un subdominio
// escriba o sobrescriba la cookie de sesion.
//
// Durante la transicion se sigue leyendo la cookie historica `access_token`
// (y se limpia en logout), para no cerrar sesiones al desplegar. La cookie
// nueva es siempre la que se emite.

const {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_LEGACY_NAME,
} = require("../config.js");

const isProduction = () => process.env.NODE_ENV === "production";

const cookieNames = () => {
  const names = [SESSION_COOKIE_NAME];
  if (
    SESSION_COOKIE_LEGACY_NAME &&
    SESSION_COOKIE_LEGACY_NAME !== SESSION_COOKIE_NAME
  ) {
    names.push(SESSION_COOKIE_LEGACY_NAME);
  }
  return names;
};

const sessionCookieOptions = ({ maxAge } = {}) => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: isProduction() ? "none" : "lax",
  path: "/",
  ...(maxAge !== undefined ? { maxAge } : {}),
});

// Token de la cookie actual o, si aun no migro, de la historica.
const readSessionToken = (req) => {
  for (const name of cookieNames()) {
    const value = req?.cookies?.[name];
    if (value) return value;
  }
  return undefined;
};

const hasSessionCookie = (req) => Boolean(readSessionToken(req));

const setSessionCookie = (res, token, { maxAge } = {}) =>
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions({ maxAge }));

const clearSessionCookies = (res) => {
  for (const name of cookieNames()) {
    res.clearCookie(name, sessionCookieOptions());
  }
  return res;
};

module.exports = {
  sessionCookieOptions,
  cookieNames,
  readSessionToken,
  hasSessionCookie,
  setSessionCookie,
  clearSessionCookies,
};
