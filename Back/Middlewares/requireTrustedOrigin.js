const { FRONTEND_URLS } = require("../config.js");

// ---------------------------------------------------------------------------
// Proteccion CSRF para peticiones con cookie de sesion.
//
// En produccion la cookie es `sameSite=none` (front y API viven en dominios
// distintos), asi que el navegador la adjunta tambien en peticiones iniciadas
// desde otro sitio. CORS impide LEER la respuesta, pero no impide EJECUTAR un
// POST simple (por ejemplo /api/admin/orders/:id/sync, que no lleva cuerpo).
//
// Regla:
//   1. Solo aplica a metodos que mutan estado.
//   2. Solo aplica si la peticion trae la cookie `access_token` (sin cookie no
//      hay CSRF posible; los webhooks y el login quedan fuera).
//   3. Si viene `Origin`, debe estar en la lista permitida.
//   4. La cabecera `X-Upbuy-CSRF: 1` es obligatoria. No es una cabecera
//      "simple": obliga a un preflight que CORS solo autoriza para los
//      origenes permitidos.
// ---------------------------------------------------------------------------

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_HEADER = "x-upbuy-csrf";

const normalizeOrigin = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
};

const TRUSTED_ORIGINS = new Set(
  FRONTEND_URLS.map(normalizeOrigin).filter(Boolean),
);

const isTrustedOrigin = (origin) =>
  Boolean(origin) && TRUSTED_ORIGINS.has(normalizeOrigin(origin));

const requireTrustedOrigin = (req, res, next) => {
  if (!MUTATING_METHODS.has(req.method)) return next();

  const hasSessionCookie = Boolean(req.cookies?.access_token);
  if (!hasSessionCookie) return next();

  const origin = req.get ? req.get("origin") : req.headers?.origin;
  if (origin && !isTrustedOrigin(origin)) {
    return res.status(403).json({
      message: "Origen no permitido",
      code: "CSRF_ORIGIN_REJECTED",
    });
  }

  const csrf = req.get ? req.get(CSRF_HEADER) : req.headers?.[CSRF_HEADER];
  if (csrf !== "1") {
    return res.status(403).json({
      message: "Falta la cabecera de seguridad de la solicitud",
      code: "CSRF_HEADER_REQUIRED",
    });
  }

  return next();
};

module.exports = {
  requireTrustedOrigin,
  isTrustedOrigin,
  CSRF_HEADER,
};
