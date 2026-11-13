// Alertas de seguridad por intentos fallidos (ADM-S4).
//
// No sustituye al rate limit: lo complementa. Cuando una cuenta o una IP
// acumula N fallos en la ventana configurada, se crea una notificacion para
// los administradores. La clave es idempotente por ventana, cuenta/IP y admin,
// asi que un ataque sostenido no llena la bandeja.
//
// Nunca se guarda ni se envia el codigo, la contrasena ni el token: solo el
// conteo, el tipo de evento y la IP.

const { Op } = require("sequelize");
const {
  SECURITY_ALERTS_ENABLED,
  ADMIN_ALERT_FAILED_ATTEMPTS,
  ADMIN_ALERT_WINDOW_MINUTES,
} = require("../config.js");
const { AuthEvent } = require("../DataBase/models/index.js");
const { notifyAdmins } = require("./notifications.js");
const { logger } = require("../Utils/logger.js");

const WINDOW_MS = ADMIN_ALERT_WINDOW_MINUTES * 60 * 1000;

const shouldAlertOnFailures = (count, threshold = ADMIN_ALERT_FAILED_ATTEMPTS) =>
  Number(count) >= Number(threshold);

// Ventana discreta para que la notificacion sea idempotente sin guardar estado.
const alertBucket = (now = Date.now()) => Math.floor(now / WINDOW_MS);

const TITLES = {
  login: "Intentos fallidos de inicio de sesión",
  mfa: "Intentos fallidos de verificación en dos pasos",
  step_up: "Intentos fallidos de confirmación de identidad",
};

const notifyFailedAttempts = async ({
  userId = null,
  ip = null,
  event = "login",
} = {}) => {
  if (!SECURITY_ALERTS_ENABLED) return false;

  const scope = userId ? { userId } : ip ? { ip } : null;
  if (!scope) return false;

  try {
    const since = new Date(Date.now() - WINDOW_MS);
    const count = await AuthEvent.count({
      where: {
        ...scope,
        event,
        result: { [Op.in]: ["failure", "denied"] },
        createdAt: { [Op.gte]: since },
      },
    });

    if (!shouldAlertOnFailures(count)) return false;

    const bucket = alertBucket();
    const scopeKey = userId ? `user:${userId}` : `ip:${ip}`;
    const where = ip ? ` desde ${ip}` : "";

    await notifyAdmins({
      tipo: "seguridad",
      titulo: TITLES[event] || "Intentos fallidos de autenticación",
      texto: `${count} intentos fallidos en los últimos ${ADMIN_ALERT_WINDOW_MINUTES} minutos${where}. Revisa las sesiones y la actividad de la cuenta.`,
      to: "/admin/perfil/seguridad",
      claveForAdmin: (adminId) =>
        `security:${event}:${scopeKey}:${bucket}:admin:${adminId}`,
    });

    return true;
  } catch (error) {
    // Una alerta nunca debe tumbar el intento de login.
    logger.warn("No se pudo generar la alerta de intentos fallidos", {
      event,
      error: error.message,
    });
    return false;
  }
};

module.exports = {
  WINDOW_MS,
  shouldAlertOnFailures,
  alertBucket,
  notifyFailedAttempts,
};
