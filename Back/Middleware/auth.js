const jwt = require("jsonwebtoken");
const {
  JWT_SECRET,
  JWT_ALGORITHM,
  JWT_ISSUER,
  JWT_AUDIENCE,
  ADMIN_MFA_REQUIRED,
} = require("../config.js");
const { Usuarios } = require("../DataBase/models/Usuarios.js");
const {
  resolveRole,
  permissionsFor,
  isAdminRole,
} = require("../Services/permissions.js");
const {
  findActiveSession,
  touchSession,
  revokeSession,
} = require("../Services/adminSessions.js");
const { logger } = require("../Utils/logger.js");
const { readSessionToken } = require("../Services/sessionCookie.js");

// Middleware de autenticacion basado en la cookie httpOnly existente.
// El token identifica al usuario: `{ id }`. Para los administradores agrega
// `sid` (sesion revocable) y `ver` (tokenVersion). El rol NUNCA se toma del
// token: `requireAdminSession` lo lee de la base.
//
// El nombre de la cookie cambia en produccion (ADM-S4): `__Host-upbuy_session`
// con respaldo temporal en `access_token` (ver Services/sessionCookie.js).

const getToken = (req) => readSessionToken(req);

const verifyOptions = {
  algorithms: [JWT_ALGORITHM],
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
};

const requireAuth = (req, res, next) => {
  const token = getToken(req);

  if (!token) {
    return res.status(401).json("No estás autenticado");
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, verifyOptions);
    // Solo el id y los claims de sesion. Nunca se copia un claim `admin`.
    req.user = { id: payload.id };
    if (payload.sid) req.user.sessionId = payload.sid;
    if (payload.ver !== undefined) {
      req.user.tokenVersion = Number(payload.ver) || 0;
    }
    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json("Sesión expirada");
    }
    return res.status(403).json("Token no válido");
  }
};

// Verifica el rol administrativo y la sesion revocable contra la base.
//
// Reglas (ADM-S1):
//   - El rol sale de `usuarios.role` (con respaldo en `admin` legacy).
//   - La cuenta no puede estar desactivada.
//   - El token debe traer `sid` de una sesion viva y no revocada.
//   - `tokenVersion` debe coincidir con la de la base.
//
// Deja en `req.user` el rol y los permisos efectivos para `requirePermission`.
const requireAdminSession = (req, res, next) => {
  const checkRole = async () => {
    if (!req.user) {
      return res.status(401).json("No estás autenticado");
    }

    try {
      const user = await Usuarios.findByPk(req.user.id, {
        attributes: [
          "id",
          "admin",
          "role",
          "disabled",
          "tokenVersion",
          "mfaEnabled",
        ],
      });
      if (!user) {
        return res.status(401).json("No estás autenticado");
      }

      const role = resolveRole(user);

      if (user.disabled) {
        return res.status(403).json({
          message: "La cuenta está desactivada",
          code: "ACCOUNT_DISABLED",
        });
      }

      if (!isAdminRole(role)) {
        return res.status(403).json({
          message: "No tienes permisos de administrador",
          code: "ADMIN_REQUIRED",
        });
      }

      // Los tokens emitidos antes de ADM-S1 no tienen sesion revocable.
      if (!req.user.sessionId) {
        return res.status(401).json({
          message: "Vuelve a iniciar sesión para usar el panel",
          code: "ADMIN_SESSION_REQUIRED",
        });
      }

      if (
        Number(req.user.tokenVersion || 0) !== Number(user.tokenVersion || 0)
      ) {
        await revokeSession({
          sessionId: req.user.sessionId,
          userId: user.id,
        });
        return res.status(401).json({
          message: "La sesión quedó obsoleta. Inicia sesión de nuevo.",
          code: "SESSION_STALE",
        });
      }

      const session = await findActiveSession({
        sessionId: req.user.sessionId,
        userId: user.id,
      });
      if (!session) {
        return res.status(403).json({
          message: "La sesión administrativa no está activa",
          code: "ADMIN_SESSION_REVOKED",
        });
      }

      // MFA obligatorio (ADM-S2). Una sesion sin `mfaAt` es anterior al
      // segundo paso: no sirve para el panel aunque el JWT sea valido.
      if (ADMIN_MFA_REQUIRED) {
        if (!user.mfaEnabled) {
          return res.status(403).json({
            message:
              "Configura el segundo factor para usar el panel administrativo",
            code: "ADMIN_MFA_SETUP_REQUIRED",
          });
        }

        if (!session.mfaAt) {
          return res.status(403).json({
            message: "Falta la verificación en dos pasos",
            code: "MFA_REQUIRED",
          });
        }
      }

      await touchSession(session);

      req.user = {
        id: user.id,
        role,
        admin: true,
        permissions: permissionsFor(role),
        sessionId: req.user.sessionId,
        tokenVersion: Number(user.tokenVersion || 0),
        mfaEnabled: Boolean(user.mfaEnabled),
        mfaAt: session.mfaAt || null,
      };

      return next();
    } catch (error) {
      logger.error("Error al validar la sesión de administrador", {
        error: error.message,
      });
      return res.status(500).json("Error interno del servidor");
    }
  };

  if (req.user) return checkRole();
  return requireAuth(req, res, checkRole);
};

// Exige uno o varios permisos. Debe usarse DESPUES de requireAdminSession.
const requirePermission = (...permissions) => (req, res, next) => {
  const effective = req.user?.permissions;
  if (!Array.isArray(effective)) {
    return res.status(401).json({
      message: "Sesión administrativa requerida",
      code: "ADMIN_SESSION_REQUIRED",
    });
  }

  const missing = permissions.filter(
    (permission) => !effective.includes(permission),
  );
  if (missing.length > 0) {
    return res.status(403).json({
      message: "No tienes permiso para esta acción",
      code: "PERMISSION_DENIED",
      required: missing,
    });
  }

  return next();
};

// Alias de compatibilidad: las rutas administrativas existentes siguen
// usando `requireAdmin`, que ahora equivale a la sesion revocable.
const requireAdmin = requireAdminSession;

// No bloquea: solo adjunta req.user si hay cookie valida.
const optionalAuth = (req, res, next) => {
  const token = getToken(req);
  if (!token) return next();

  try {
    const payload = jwt.verify(token, JWT_SECRET, verifyOptions);
    req.user = { id: payload.id };
    if (payload.sid) req.user.sessionId = payload.sid;
    if (payload.ver !== undefined) {
      req.user.tokenVersion = Number(payload.ver) || 0;
    }
  } catch {
    // token invalido en ruta publica: se ignora
  }
  return next();
};

module.exports = {
  requireAuth,
  requireAdmin,
  requireAdminSession,
  requirePermission,
  optionalAuth,
};
