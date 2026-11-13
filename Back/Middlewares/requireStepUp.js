// Step-up para acciones destructivas (ADM-S3).
//
// Regla (docs/SEGURIDAD_ADMIN.md, F-10): una sesion administrativa sirve para
// consultar, pero reembolsar, cancelar, enviar campanas, despublicar catalogo o
// cambiar roles exige un segundo factor reciente. La marca vive en
// `admin_sessions.mfaAt`; `POST /api/auth/admin/step-up` la refresca.
//
// Este middleware va DESPUES de `requireAdminSession` y de `requirePermission`:
// usa `req.user.mfaAt` y `req.user.permissions` ya resueltos desde la base.

const { ADMIN_STEP_UP_MINUTES } = require("../config.js");
const {
  isStepUpAction,
  permissionForStepUpAction,
} = require("../Services/permissions.js");

const STEP_UP_WINDOW_MS = ADMIN_STEP_UP_MINUTES * 60 * 1000;

// Un `mfaAt` ausente, invalido o mayor que la ventana no habilita la accion.
const isStepUpFresh = (mfaAt, { now = Date.now() } = {}) => {
  if (!mfaAt) return false;
  const timestamp =
    mfaAt instanceof Date ? mfaAt.getTime() : new Date(mfaAt).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return now - timestamp <= STEP_UP_WINDOW_MS;
};

const stepUpRequiredBody = (action) => ({
  message: "Confirma tu identidad con el código de verificación",
  code: "STEP_UP_REQUIRED",
  action,
  maxAgeMinutes: ADMIN_STEP_UP_MINUTES,
});

// `action` es una clave de STEP_UP_ACTIONS (Services/permissions.js).
// `when(req)` permite exigir step-up solo en ciertos cuerpos: por ejemplo,
// PATCH /orders/:id/status solo lo pide cuando el destino es "cancelled".
const requireStepUp = (action, { when = null } = {}) => {
  if (!isStepUpAction(action)) {
    throw new Error(`Acción de step-up desconocida: ${action}`);
  }

  const requiredPermission = permissionForStepUpAction(action);

  return (req, res, next) => {
    if (typeof when === "function" && !when(req)) return next();

    const user = req.user;
    if (!user || !Array.isArray(user.permissions)) {
      return res.status(401).json({
        message: "Sesión administrativa requerida",
        code: "ADMIN_SESSION_REQUIRED",
      });
    }

    // Defensa en profundidad: aunque la ruta ya lleve requirePermission, una
    // accion critica nunca debe ejecutarse sin el permiso que la habilita.
    if (requiredPermission && !user.permissions.includes(requiredPermission)) {
      return res.status(403).json({
        message: "No tienes permiso para esta acción",
        code: "PERMISSION_DENIED",
        required: [requiredPermission],
      });
    }

    if (!isStepUpFresh(user.mfaAt)) {
      return res.status(403).json(stepUpRequiredBody(action));
    }

    return next();
  };
};

module.exports = {
  STEP_UP_WINDOW_MS,
  isStepUpFresh,
  requireStepUp,
};
