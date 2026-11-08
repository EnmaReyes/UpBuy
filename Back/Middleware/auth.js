const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config.js");
const { Usuarios } = require("../DataBase/models/Usuarios.js");

// Middleware de autenticacion basado en la cookie httpOnly existente
// (access_token). No cambia el formato del token: { id, admin }.

const getToken = (req) => req.cookies?.access_token;

const requireAuth = (req, res, next) => {
  const token = getToken(req);

  if (!token) {
    return res.status(401).json("No estás autenticado");
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.id, admin: Boolean(payload.admin) };
    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json("Sesión expirada");
    }
    return res.status(403).json("Token no válido");
  }
};

// Verifica la sesion y el rol de administrador. Revalida el rol contra la
// base de datos para no confiar en un flag admin stale del JWT.
const requireAdmin = (req, res, next) => {
  const checkRole = async () => {
    if (!req.user) {
      return res.status(401).json("No estás autenticado");
    }

    try {
      const user = await Usuarios.findByPk(req.user.id, {
        attributes: ["admin"],
      });
      if (!user) {
        return res.status(401).json("No estás autenticado");
      }
      if (!user.admin) {
        return res.status(403).json("No tienes permisos de administrador");
      }
      req.user.admin = true;
      return next();
    } catch (error) {
      console.error("Error al validar el rol de administrador:", error.message);
      return res.status(500).json("Error interno del servidor");
    }
  };

  if (req.user) return checkRole();
  return requireAuth(req, res, checkRole);
};

// No bloquea: solo adjunta req.user si hay cookie valida.
const optionalAuth = (req, res, next) => {
  const token = getToken(req);
  if (!token) return next();

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.id, admin: Boolean(payload.admin) };
  } catch {
    // token invalido en ruta publica: se ignora
  }
  return next();
};

module.exports = { requireAuth, requireAdmin, optionalAuth };
