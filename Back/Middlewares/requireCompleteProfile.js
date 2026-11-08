// Bloquea el checkout si el comprador no completo su perfil.
//
// Responde 403 con un cuerpo estable para que el front abra el modal:
//
//   { code: "PROFILE_INCOMPLETE", missing: ["phone", "address"] }
//
// Solo debe usarse DESPUES de requireAuth (necesita req.user.id).

const { Usuarios, Address } = require("../DataBase/models/index.js");
const { findMissingProfileFields } = require("../Services/profile.js");

const requireCompleteProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json("No estás autenticado");
    }

    const [user, defaultAddress] = await Promise.all([
      Usuarios.findByPk(userId, {
        attributes: ["id", "name", "lastName", "phone", "address"],
      }),
      Address.findOne({ where: { userId, isDefault: true } }),
    ]);

    if (!user) {
      return res.status(401).json("No estás autenticado");
    }

    const missing = findMissingProfileFields({ user, defaultAddress });

    if (missing.length > 0) {
      return res.status(403).json({
        code: "PROFILE_INCOMPLETE",
        message:
          "Completa tu perfil (nombre, apellido, teléfono y dirección) para continuar",
        missing,
      });
    }

    return next();
  } catch (error) {
    console.error("Error al validar el perfil:", error.message);
    return res.status(500).json("Error interno del servidor");
  }
};

module.exports = { requireCompleteProfile };
