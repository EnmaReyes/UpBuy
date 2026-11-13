// Perfil y tablero del administrador autenticado (ADM-1).
//
// Solo devuelve lo que el panel necesita pintar. Nunca expone contrasena,
// secretos de MFA, tokens ni campos internos del proveedor.

const {
  Usuarios,
  AdminSession,
} = require("../DataBase/models/index.js");
const { permissionsFor } = require("../Services/permissions.js");
const { getDashboardSummary } = require("../Services/adminDashboard.js");
const { sendError } = require("../Utils/respond.js");

const USER_ATTRIBUTES = [
  "id",
  "email",
  "username",
  "name",
  "lastName",
  "phone",
  "image",
  "role",
  "mfaEnabled",
];

// GET /api/admin/me
const me = async (req, res) => {
  try {
    const user = await Usuarios.findByPk(req.user.id, {
      attributes: USER_ATTRIBUTES,
    });
    if (!user) {
      return res.status(404).json("Usuario no encontrado");
    }

    const session = await AdminSession.findByPk(req.user.sessionId, {
      attributes: ["expiresAt", "mfaAt"],
    });

    return res.status(200).json({
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      lastName: user.lastName,
      phone: user.phone,
      image: user.image,
      role: req.user.role,
      permissions: permissionsFor(req.user.role),
      mfaEnabled: Boolean(user.mfaEnabled),
      session: session
        ? {
            expiresAt: session.expiresAt,
            mfaAt: session.mfaAt,
          }
        : null,
    });
  } catch (error) {
    return sendError(res, error, "No se pudo cargar tu perfil de administrador");
  }
};

// GET /api/admin/dashboard/summary?periodo=mes
const summary = async (req, res) => {
  try {
    const result = await getDashboardSummary({
      periodo: req.query?.periodo,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudo cargar el resumen del panel");
  }
};

module.exports = { me, summary };
