// Perfil del comprador y regla de "perfil completo".
//
// Para comprar, el comprador necesita: nombre, apellido, telefono y una
// direccion principal. El telefono se guarda normalizado a formato LATAM
// (+57...) porque es lo que usan los couriers.
//
// Esta regla se materializa en usuarios.profileComplete/profileCompleteAt
// para que el middleware de checkout no tenga que recomputarla en cada
// request. Cualquier cambio de perfil o de direcciones pasa por aqui.

const { sequelize, Usuarios, Address } = require("../DataBase/models/index.js");
const { normalizePhone } = require("./providers/payload.js");
const HttpError = require("../Utils/HttpError.js");

const cleanText = (value) =>
  value === null || value === undefined ? "" : String(value).trim();

// Un telefono sirve si al quitarle todo lo que no es digito quedan al menos
// 7 (los fijos colombianos tienen 7 y los moviles 10, con o sin +57).
const phoneDigits = (phone) => String(phone || "").replace(/\D/g, "");

const isValidPhone = (phone) => phoneDigits(phone).length >= 7;

// Calcula las piezas que faltan. No toca la base.
const findMissingProfileFields = ({ user, defaultAddress } = {}) => {
  const missing = [];

  if (!cleanText(user?.name)) missing.push("name");
  if (!cleanText(user?.lastName)) missing.push("lastName");
  if (!cleanText(user?.phone) || !isValidPhone(user.phone)) missing.push("phone");

  const hasAddress =
    cleanText(defaultAddress?.address) || cleanText(user?.address);
  if (!hasAddress) missing.push("address");

  return missing;
};

// Recalcula y guarda el flag del usuario. Devuelve { profileComplete, missing }.
const recalcProfileComplete = async (userId, { transaction } = {}) => {
  const user = await Usuarios.findByPk(userId, { transaction });
  if (!user) {
    throw new HttpError(404, "Usuario no encontrado");
  }

  const defaultAddress = await Address.findOne({
    where: { userId, isDefault: true },
    transaction,
  });

  const missing = findMissingProfileFields({ user, defaultAddress });
  const profileComplete = missing.length === 0;

  user.profileComplete = profileComplete;
  if (profileComplete && !user.profileCompleteAt) {
    user.profileCompleteAt = new Date();
  }
  await user.save({ transaction });

  return { profileComplete, missing };
};

// Nombre y telefono: el telefono queda normalizado a +57...
const buildProfileUpdate = (payload = {}) => {
  const update = {};

  if (payload.name !== undefined) {
    update.name = cleanText(payload.name).slice(0, 150) || null;
  }
  if (payload.lastName !== undefined) {
    update.lastName = cleanText(payload.lastName).slice(0, 150) || null;
  }
  if (payload.phone !== undefined) {
    const raw = cleanText(payload.phone);
    if (raw && !isValidPhone(raw)) {
      throw new HttpError(400, "Teléfono inválido");
    }
    update.phone = raw ? normalizePhone(raw).slice(0, 30) : null;
  }
  if (payload.image !== undefined) {
    const image = cleanText(payload.image);
    if (image && !/^https?:\/\//i.test(image)) {
      throw new HttpError(400, "URL de imagen inválida");
    }
    update.image = image || null;
  }

  return update;
};

// Actualiza el perfil y, si viene una direccion, la refleja en la direccion
// principal (compatibilidad con el formulario antiguo de /api/user/edit).
const updateProfile = async (userId, payload = {}) => {
  const update = buildProfileUpdate(payload);

  const transaction = await sequelize.transaction();
  try {
    const user = await Usuarios.findByPk(userId, { transaction });
    if (!user) {
      throw new HttpError(404, "No se encontró el usuario para actualizar");
    }

    if (payload.address !== undefined) {
      const address = cleanText(payload.address).slice(0, 255);
      user.address = address || null;

      const defaultAddress = await Address.findOne({
        where: { userId, isDefault: true },
        transaction,
      });

      if (address) {
        if (defaultAddress) {
          defaultAddress.address = address;
          await defaultAddress.save({ transaction });
        } else {
          await Address.create(
            {
              userId,
              address,
              department: null,
              city: null,
              reference: null,
              isDefault: true,
            },
            { transaction },
          );
        }
      }
    }

    await user.update(update, { transaction });

    const { profileComplete, missing } = await recalcProfileComplete(userId, {
      transaction,
    });

    await transaction.commit();

    const fresh = await Usuarios.findByPk(userId, {
      attributes: { exclude: ["password", "gmailRefreshToken"] },
    });

    return { user: fresh, profileComplete, missing };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

module.exports = {
  findMissingProfileFields,
  recalcProfileComplete,
  updateProfile,
  isValidPhone,
  phoneDigits,
};
