const {
  rateLimit,
  ipKeyGenerator,
  MINUTE,
  HOUR,
} = require("express-rate-limit");
const { RATE_LIMIT_ENABLED } = require("../config.js");

// ---------------------------------------------------------------------------
// Limites de peticiones (Fase E).
//
// Objetivo: que un script no pueda (a) probar contraseñas, (b) llenar la tabla
// de pedidos ni (c) inundar el webhook de pagos. Los limites son holgados para
// una tienda real y se pueden apagar con RATE_LIMIT_ENABLED=false.
//
// La clave es la IP (normalizada para IPv6 por ipKeyGenerator) o el usuario
// autenticado, para no castigar a todos los clientes de una misma red.
// ---------------------------------------------------------------------------

const MENSAJE_GENERICO =
  "Demasiadas solicitudes. Espera un momento e intenta de nuevo.";

// Respuesta en el formato de la API: string plano, no objeto.
const responderLimite = (req, res, next, options) =>
  res.status(options.statusCode).json(options.message);

const crearLimite = ({ windowMs, limit, message = MENSAJE_GENERICO }) => {
  if (!RATE_LIMIT_ENABLED) {
    return (req, res, next) => next();
  }

  return rateLimit({
    windowMs,
    limit,
    message,
    handler: responderLimite,
    // Clave por usuario autenticado cuando lo hay (rutas de pedidos); en el
    // resto de casos cae a la IP, normalizada para IPv6.
    keyGenerator: porUsuarioOIp,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
};

// Usuario autenticado si lo hay; si no, la IP. requireAuth corre antes que
// estos middlewares en las rutas de pedidos, asi que req.user existe.
const porUsuarioOIp = (req) =>
  req.user?.id || ipKeyGenerator(req.ip || "");

// Techo general de la API: corta inundaciones sin estorbar el uso normal
// (el panel hace varias peticiones por pantalla).
const globalLimiter = crearLimite({
  windowMs: 15 * MINUTE,
  limit: 900,
});

// Inicio de sesion y login social: frena la fuerza bruta.
const authLimiter = crearLimite({
  windowMs: 15 * MINUTE,
  limit: 10,
  message: "Demasiados intentos de inicio de sesión. Espera unos minutos.",
});

// Creacion de cuentas: mas estricto, es lo que se automatiza para spam.
const registerLimiter = crearLimite({
  windowMs: HOUR,
  limit: 5,
  message: "Demasiados registros desde esta conexión. Intenta más tarde.",
});

// Crear pedidos: un cliente real no hace 20 pedidos por hora.
const orderLimiter = crearLimite({
  windowMs: HOUR,
  limit: 20,
  message: "Has creado muchos pedidos seguidos. Espera un momento.",
});

// Iniciar / verificar pagos: recargar la pagina no debe consumir el cupo, pero
// si alguien automatiza el checkout.
const paymentLimiter = crearLimite({
  windowMs: 15 * MINUTE,
  limit: 30,
  message: "Demasiados intentos de pago. Espera unos minutos.",
});

// Wompi reintenta eventos: el limite es alto a proposito. Solo evita que un
// tercero use el endpoint como ariete.
const webhookLimiter = crearLimite({
  windowMs: MINUTE,
  limit: 120,
});

module.exports = {
  globalLimiter,
  authLimiter,
  registerLimiter,
  orderLimiter,
  paymentLimiter,
  webhookLimiter,
  porUsuarioOIp,
};
