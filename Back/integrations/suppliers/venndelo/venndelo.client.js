// Cliente HTTP centralizado de Venndelo Pro.
//
//   Base: https://api.venndelo.com/v1/admin
//   Todas las solicitudes protegidas: Authorization: Bearer <access_token>
//
// Responsabilidades:
//   - Armar la URL (base + ruta + query).
//   - Inyectar el Bearer (via venndelo.auth.getAccessToken).
//   - Reintentar UNA vez un 401: invalida el token, renueva y repite.
//   - Traducir los errores HTTP del proveedor a HttpError con un status
//     coherente para nuestra API.
//
// No sabe nada de productos ni de assets: eso vive en venndelo.catalog.js y
// venndelo.assets.js.
const {
  VENNDELO_API_URL,
  VENNDELO_ADMIN_PATH,
  VENNDELO_HTTP_TIMEOUT_MS,
} = require("../../../config.js");
const { request } = require("../../../Utils/httpClient.js");
const HttpError = require("../../../Utils/HttpError.js");
const auth = require("./venndelo.auth.js");

const adminBase = () =>
  `${String(VENNDELO_API_URL).replace(/\/+$/, "")}${String(
    VENNDELO_ADMIN_PATH,
  ).replace(/\/+$/, "")}`;

const buildUrl = (path, params = {}) => {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${adminBase()}${cleanPath}`;
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
const mapStatus = (status) => {
  if (status === 404) return 404;
  if (status === 422 || status === 400) return 400;
  if (status === 429) return 503;
  if (status >= 500) return 502;
  if (status === 401 || status === 403) return 502;
  return 502;
};

// Peticion cruda (devuelve { status, ok, data }).
const adminRequest = async (
  supplier,
  method,
  path,
  { params, body, headers, retries, allowRetryOnNonIdempotent, timeoutMs } = {},
) => {
  const url = buildUrl(path, params);

  const run = async () => {
    const token = await auth.getAccessToken(supplier);
    const isJsonBody = body !== undefined && body !== null;
    return request(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(isJsonBody ? { "Content-Type": "application/json" } : {}),
        ...(headers || {}),
      },
      body: isJsonBody ? JSON.stringify(body) : undefined,
      retries,
      allowRetryOnNonIdempotent,
      timeoutMs: timeoutMs || VENNDELO_HTTP_TIMEOUT_MS,
    });
  };

  let response = await run();

  // Token vencido o revocado: renovar UNA vez y repetir.
  if (response.status === 401) {
    auth.invalidate(supplier);
    response = await run();
  }

  return response;
};

// Peticion que exige 2xx y devuelve el cuerpo JSON ya parseado.
const adminJson = async (supplier, method, path, options = {}) => {
  const response = await adminRequest(supplier, method, path, options);
  if (!response.ok) {
    throw new HttpError(
      mapStatus(response.status),
      `Venndelo respondió HTTP ${response.status} en ${method} ${path}`,
    );
  }
  // Venndelo sirve su documentación HTML en /v1/admin/*. Un 200 con HTML
  // significa que la ruta no existe, no que la operación funcionó.
  if (typeof response.data === "string" && /^\s*</.test(response.data)) {
    throw new HttpError(
      502,
      `Venndelo devolvió HTML en ${method} ${path}: la ruta no existe o cambió`,
    );
  }
  return response.data;
};

// GET /check-auth (opcional; sirve para probar la autenticacion).
const checkAuth = async (supplier) => {
  const data = await adminJson(supplier, "GET", "/check-auth");
  return data;
};

module.exports = { adminBase, buildUrl, adminRequest, adminJson, checkAuth };
