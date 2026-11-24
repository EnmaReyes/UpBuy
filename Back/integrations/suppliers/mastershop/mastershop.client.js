// Cliente HTTP centralizado de MasterShop.
//
//   Base: https://prod.api.mastershop.com   (host oficial documentado)
//   Auth: header `ms-api-key` (llave estatica del negocio)
//
// Responsabilidades:
//   - Armar la URL (base + ruta + query).
//   - Enviar SOLO `ms-api-key` como credencial. MasterShop deriva el usuario y
//     el negocio de la llave: no se mandan headers de contexto ni IDs.
//   - Traducir los errores HTTP del proveedor a HttpError con un status
//     coherente para nuestra API, sin filtrar la llave.
//   - Leer los headers de rate limit (RateLimit-Limit/Remaining/Reset) y
//     reportar el reintento sugerido cuando hay 429.
//
// No sabe nada de productos: eso vive en mastershop.catalog.js.
const {
  MASTERSHOP_API_URL,
  MASTERSHOP_API_KEY,
  MASTERSHOP_HTTP_TIMEOUT_MS,
} = require("../../../config.js");
const { request } = require("../../../Utils/httpClient.js");
const HttpError = require("../../../Utils/HttpError.js");
const { createLogger } = require("../../../Utils/logger.js");

const log = createLogger("mastershop.client");

// Ultimo estado observado de rate limit (sin secretos: solo numeros).
let lastRateLimit = null;

const isConfigured = () => Boolean(MASTERSHOP_API_URL && MASTERSHOP_API_KEY);

const assertConfigured = () => {
  if (!isConfigured()) {
    throw new HttpError(
      503,
      "MasterShop no está configurado (falta MASTERSHOP_API_KEY)",
    );
  }
};

const apiBase = () => String(MASTERSHOP_API_URL).replace(/\/+$/, "");

const buildUrl = (path, params = {}) => {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${apiBase()}${cleanPath}`;
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&");
  return query ? `${url}?${query}` : url;
};

// Traduce el status del proveedor a uno que nuestra API exponga con sentido.
//   - 400: la peticion no cumple su contrato (bug o dato invalido).
//   - 401/403: llave ausente/sin permiso. Es configuracion nuestra: 502.
//   - 404: recurso inexistente.
//   - 429: limite de uso. El llamador puede reintentar mas tarde -> 503.
//   - 5xx: fallo del proveedor.
const mapStatus = (status) => {
  if (status === 400) return 400;
  if (status === 404) return 404;
  if (status === 429) return 503;
  return 502;
};

const intHeader = (headers, name) => {
  const value = headers?.[name.toLowerCase()] ?? headers?.[name];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

const readRateLimit = (headers = {}) => ({
  limit: intHeader(headers, "RateLimit-Limit"),
  remaining: intHeader(headers, "RateLimit-Remaining"),
  resetSeconds:
    intHeader(headers, "RateLimit-Reset") ?? intHeader(headers, "Retry-After"),
});

// Peticion que exige 2xx y devuelve el cuerpo JSON ya parseado.
//
// `retries` solo se usa en lecturas (GET): las escrituras no se implementan en
// esta integracion, y reintentar un POST podria duplicar registros.
const requestJson = async (
  method,
  path,
  { params, body, retries } = {},
) => {
  assertConfigured();

  const upperMethod = String(method || "GET").toUpperCase();
  const url = buildUrl(path, params);
  const isJsonBody = body !== undefined && body !== null;

  let response;
  try {
    response = await request(url, {
      method: upperMethod,
      headers: {
        "ms-api-key": MASTERSHOP_API_KEY,
        Accept: "application/json",
        ...(isJsonBody ? { "Content-Type": "application/json" } : {}),
      },
      body: isJsonBody ? JSON.stringify(body) : undefined,
      retries: Number.isInteger(retries)
        ? retries
        : upperMethod === "GET"
          ? 2
          : 0,
      allowRetryOnNonIdempotent: false,
      timeoutMs: MASTERSHOP_HTTP_TIMEOUT_MS,
    });
  } catch (error) {
    // El httpClient ya describe timeouts/red sin incluir headers.
    throw new HttpError(
      502,
      `No se pudo contactar a MasterShop en ${upperMethod} ${path}: ${error.message}`,
    );
  }

  lastRateLimit = readRateLimit(response.headers);

  if (!response.ok) {
    const error = new HttpError(
      mapStatus(response.status),
      `MasterShop respondió HTTP ${response.status} en ${upperMethod} ${path}`,
    );
    // Metadatos utiles para diagnostico. Nunca incluyen la llave.
    error.upstreamStatus = response.status;
    error.upstreamBody = response.data;
    error.rateLimit = lastRateLimit;
    if (response.status === 429 && lastRateLimit?.resetSeconds !== null) {
      error.retryAfterSeconds = lastRateLimit.resetSeconds;
    }
    log.warn("Respuesta de error de MasterShop", {
      method: upperMethod,
      path,
      status: response.status,
      rateLimit: lastRateLimit,
    });
    throw error;
  }

  // MasterShop sirve JSON. Un 200 con HTML significaria una ruta equivocada.
  if (typeof response.data === "string" && /^\s*</.test(response.data)) {
    throw new HttpError(
      502,
      `MasterShop devolvió HTML en ${upperMethod} ${path}: la ruta no existe o cambió`,
    );
  }

  return response.data;
};

// GET /api/products?page=1&limit=1 — llamada mas barata para comprobar que la
// llave es valida. MasterShop no tiene un endpoint /check-auth.
const checkAuth = async () => {
  const data = await requestJson("GET", "/api/products", {
    params: { page: 1, limit: 1 },
  });
  return {
    ok: true,
    totalProducts: Number(data?.resultsCount?.totalProducts) || 0,
    rateLimit: lastRateLimit,
  };
};

const getRateLimit = () => lastRateLimit;

module.exports = {
  isConfigured,
  assertConfigured,
  buildUrl,
  mapStatus,
  readRateLimit,
  requestJson,
  checkAuth,
  getRateLimit,
};
