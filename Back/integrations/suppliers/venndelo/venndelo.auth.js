// Autenticacion OAuth 2.0 con Venndelo Pro.
//
// Flujo (confirmado en su OpenAPI):
//   POST https://api.venndelo.com/v1/admin/oauth/token
//   Content-Type: application/x-www-form-urlencoded
//     grant_type=refresh_token
//     refresh_token={REFRESH_TOKEN}
//     client_id={CLIENT_ID}
//     client_secret={CLIENT_SECRET}
//
// Respuesta: { access_token, token_type, expires_in, expires_at, refresh_token? }
//   - `refresh_token` SOLO viene cuando Venndelo lo rota. Si viene, hay que
//     guardarlo y usarlo en el siguiente intercambio.
//
// Reglas implementadas:
//   - Una sola funcion para obtener un access_token valido (getAccessToken).
//   - Se renueva cuando esta a menos de EXPIRY_MARGIN_MS de expirar.
//   - Single-flight: N llamadas simultaneas comparten UNA renovacion.
//   - La rotacion del refresh token se persiste cifrada en la base.
//   - Nunca se registran tokens completos en los logs.
const {
  VENNDELO_OAUTH_URL,
  VENNDELO_CLIENT_ID,
  VENNDELO_CLIENT_SECRET,
  VENNDELO_REFRESH_TOKEN,
} = require("../../../config.js");
const { fetchOnce } = require("../../../Utils/httpClient.js");
const HttpError = require("../../../Utils/HttpError.js");
const { createLogger } = require("../../../Utils/logger.js");
const credentials = require("../credentials.js");

const log = createLogger("venndelo.auth");

// Margen de seguridad: se renueva 60s antes de expirar.
const EXPIRY_MARGIN_MS = 60_000;

// supplierId -> { accessToken, expiresAt }
const tokenCache = new Map();
// supplierId -> Promise en vuelo (single-flight)
const inflight = new Map();

const envCredentials = () => ({
  clientId: VENNDELO_CLIENT_ID,
  clientSecret: VENNDELO_CLIENT_SECRET,
  refreshToken: VENNDELO_REFRESH_TOKEN,
});

// Credenciales basicas presentes en el entorno.
const isConfigured = () => {
  const env = envCredentials();
  return Boolean(env.clientId && env.clientSecret && env.refreshToken);
};

// Credenciales efectivas: la fila persistida (con el refresh token rotado)
// manda; si no hay fila, se usan las del entorno.
const resolveCredentials = async (supplier) => {
  const env = envCredentials();
  let row = null;

  if (supplier?.id) {
    try {
      const { SupplierCredential } = require("../../../DataBase/models/index.js");
      row = await SupplierCredential.findOne({
        where: { supplierId: supplier.id },
      });
    } catch (error) {
      log.warn("No se pudieron leer las credenciales persistidas", {
        error: error.message,
      });
    }
  }

  const safeDecrypt = (value, fallback) => {
    if (!value) return fallback;
    try {
      return credentials.decrypt(value) || fallback;
    } catch (error) {
      log.error("No se pudo descifrar una credencial persistida", {
        error: error.message,
      });
      return fallback;
    }
  };

  return {
    clientId: row?.clientId || env.clientId,
    clientSecret: safeDecrypt(row?.encryptedClientSecret, env.clientSecret),
    refreshToken: safeDecrypt(row?.encryptedRefreshToken, env.refreshToken),
    refreshTokenExpiresAt: row?.refreshTokenExpiresAt || null,
    persisted: Boolean(row),
  };
};

// Guarda el refresh token rotado para que no se pierda al reiniciar.
const persistRotation = async (supplier, { refreshToken, refreshTokenExpiresAt, clientId }) => {
  if (!supplier?.id) {
    log.warn(
      "Venndelo roto el refresh token, pero no hay proveedor en la base para guardarlo",
    );
    return false;
  }
  if (!credentials.isConfigured()) {
    log.warn(
      "Venndelo roto el refresh token, pero falta SUPPLIER_CREDENTIALS_ENCRYPTION_KEY: no se puede persistir",
    );
    return false;
  }

  const { SupplierCredential } = require("../../../DataBase/models/index.js");
  const env = envCredentials();
  const now = new Date();
  const current = await resolveCredentials(supplier);

  await SupplierCredential.upsert({
    supplierId: supplier.id,
    clientId: clientId || current.clientId || env.clientId || null,
    encryptedClientSecret: current.clientSecret
      ? credentials.encrypt(current.clientSecret)
      : null,
    encryptedRefreshToken: credentials.encrypt(refreshToken),
    refreshTokenExpiresAt: refreshTokenExpiresAt || null,
    lastRotatedAt: now,
    source: "db",
  });

  log.info("Refresh token de Venndelo rotado y persistido", {
    refreshTokenExpiresAt: refreshTokenExpiresAt || null,
  });
  return true;
};

// Intercambia el refresh token por un access token.
const refreshAccessToken = async (supplier, { reason = "expired" } = {}) => {
  const creds = await resolveCredentials(supplier);

  if (!creds.clientId || !creds.clientSecret || !creds.refreshToken) {
    throw new HttpError(
      503,
      "Venndelo no está configurado (faltan VENNDELO_CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN)",
    );
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: creds.refreshToken,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  }).toString();

  let response;
  try {
    response = await fetchOnce(VENNDELO_OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (error) {
    throw new HttpError(502, `No se pudo contactar a Venndelo: ${error.message}`);
  }

  if (!response.ok) {
    // 401 = credenciales invalidas (invalid_client) o refresh token vencido.
    const status = response.status === 401 ? 502 : 503;
    throw new HttpError(
      status,
      `Venndelo rechazó la autenticación (HTTP ${response.status}). Revisa las credenciales.`,
    );
  }

  const data = response.data || {};
  const accessToken = data.access_token;
  if (!accessToken) {
    throw new HttpError(502, "Venndelo no devolvió access_token");
  }

  const expiresIn = Number(data.expires_in) || 3600;
  const expiresAt = data.expires_at
    ? new Date(data.expires_at)
    : new Date(Date.now() + expiresIn * 1000);

  tokenCache.set(supplier?.id || "default", { accessToken, expiresAt });

  // Rotacion: solo cuando Venndelo manda un refresh token nuevo.
  if (data.refresh_token) {
    await persistRotation(supplier, {
      refreshToken: data.refresh_token,
      refreshTokenExpiresAt: data.refresh_token_expires_at
        ? new Date(data.refresh_token_expires_at)
        : null,
      clientId: creds.clientId,
    });
  }

  log.info("Access token de Venndelo obtenido", {
    reason,
    expiresAt: expiresAt.toISOString(),
    rotated: Boolean(data.refresh_token),
    token: credentials.maskSecret(accessToken),
  });

  return accessToken;
};

// Devuelve un access_token valido (renueva solo si hace falta).
const getAccessToken = async (supplier, { force = false } = {}) => {
  const key = supplier?.id || "default";
  const cached = tokenCache.get(key);

  if (
    !force &&
    cached &&
    cached.expiresAt &&
    cached.expiresAt.getTime() - Date.now() > EXPIRY_MARGIN_MS
  ) {
    return cached.accessToken;
  }

  // Single-flight: si ya hay una renovacion en curso, se espera esa misma.
  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const promise = refreshAccessToken(supplier, {
    reason: force ? "forced" : cached ? "expiring" : "initial",
  })
    .catch((error) => {
      tokenCache.delete(key);
      throw error;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
};

// Invalida el token en cache (tras un 401, para forzar renovacion).
const invalidate = (supplier) => {
  tokenCache.delete(supplier?.id || "default");
};

// Estado del token sin exponerlo (para /status).
const getStatus = (supplier) => {
  const cached = tokenCache.get(supplier?.id || "default");
  return {
    cached: Boolean(cached),
    accessTokenExpiresAt: cached?.expiresAt || null,
    encryptionConfigured: credentials.isConfigured(),
  };
};

// Para pruebas: limpia el estado en memoria.
const resetCache = () => {
  tokenCache.clear();
  inflight.clear();
};

module.exports = {
  isConfigured,
  resolveCredentials,
  getAccessToken,
  invalidate,
  getStatus,
  resetCache,
  EXPIRY_MARGIN_MS,
};
