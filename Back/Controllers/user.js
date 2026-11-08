const { Usuarios } = require("../DataBase/models/Usuarios.js");

// Rutas protegidas por requireAuth: req.user = { id, admin }.
// El perfil solo expone y permite editar datos no sensibles:
// nombre, apellido, teléfono, dirección e imagen. Nunca rol, correo,
// contrasena ni identificadores sociales.

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
    const { name, lastName, image, phone, address } = req.body || {};
    const userUpdate = {};

    if (name !== undefined) {
      userUpdate.name = String(name).trim().slice(0, 150);
    }
    if (lastName !== undefined) {
      userUpdate.lastName = String(lastName).trim().slice(0, 150);
    }
    if (phone !== undefined) {
      // null o cadena vacia borran el dato; si viene texto debe parecer un
      // telefono (al menos 7 digitos), igual que valida el checkout.
      const limpio = phone === null ? "" : String(phone).trim();
      if (limpio && limpio.replace(/\D/g, "").length < 7) {
        return res.status(400).json("Teléfono inválido");
      }
      userUpdate.phone = limpio.slice(0, 30) || null;
    }
    if (address !== undefined) {
      // null o cadena vacia borran el dato.
      const limpio = address === null ? "" : String(address).trim();
      userUpdate.address = limpio.slice(0, 255) || null;
    }
    if (image !== undefined) {
      // null o cadena vacia quitan la foto; si viene texto, debe ser URL.
      const limpio = image === null ? "" : String(image).trim();
      if (limpio && !/^https?:\/\//i.test(limpio)) {
        return res.status(400).json("URL de imagen inválida");
      }
      userUpdate.image = limpio || null;
    }

    if (Object.keys(userUpdate).length === 0) {
      return res.status(400).json("No hay datos para actualizar");
    }

    const [rowsUpdated] = await Usuarios.update(userUpdate, {
      where: { id: req.user.id },
    });

    if (rowsUpdated === 0) {
      // Puede ser "sin cambios" o "no existe": se comprueba para no
      // devolver 404 cuando el update simplemente fue idempotente.
      const existe = await Usuarios.findByPk(req.user.id, {
        attributes: ["id"],
      });
      if (!existe) {
        return res.status(404).json("No se encontró el usuario para actualizar");
      }
    }

    const user = await Usuarios.findByPk(req.user.id, {
      attributes: { exclude: ["password", "gmailRefreshToken"] },
    });

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
    console.error("Error al actualizar el usuario:", error.message);
    return res.status(500).json("Error al actualizar el usuario");
  }
};

module.exports = { userById, updateUser };
