const { Usuarios } = require("../DataBase/models/Usuarios.js");
const { updateProfile } = require("../Services/profile.js");

// Rutas protegidas por requireAuth: req.user = { id, admin }.
// El perfil solo expone y permite editar datos no sensibles:
// nombre, apellido, teléfono, dirección e imagen. Nunca rol, correo,
// contrasena ni identificadores sociales.
//
// La logica de validacion y el recalculo de profileComplete viven en
// Services/profile.js: el checkout y esta ruta usan la misma regla.

const userById = async (req, res) => {
  try {
    const user = await Usuarios.findByPk(req.user.id, {
      attributes: { exclude: ["password", "gmailRefreshToken"] },
    });

    if (!user) {
      return res.status(404).json("No Hay Usuario con este ID");
    }
    return res.status(200).json(user);
  } catch (error) {
    console.error("Error al cargar el usuario:", error.message);
    return res.status(500).json("Error interno del servidor");
  }
};

const updateUser = async (req, res) => {
  try {
    const { user } = await updateProfile(req.user.id, req.body || {});

    // Notificacion de actividad de cuenta (no bloquea si falla).
    try {
      const { createNotification } = require("../Services/notifications.js");
      await createNotification({
        userId: req.user.id,
        tipo: "cuenta",
        titulo: "Perfil actualizado",
        texto: "Actualizaste los datos de tu cuenta.",
        to: "/dashboard/perfil",
      });
    } catch (error) {
      console.error("No se pudo crear la notificación:", error.message);
    }

    return res.status(200).json(user);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json(error.message);
    }
    console.error("Error al actualizar el usuario:", error.message);
    return res.status(500).json("Error al actualizar el usuario");
  }
};

module.exports = { userById, updateUser };
