// Direcciones de envio del usuario.
//
// Reglas:
//   - Cada usuario tiene como maximo una direccion principal (isDefault).
//   - La primera direccion creada es principal automaticamente.
//   - Borrar la principal promueve otra (si existe) y recalcula el perfil.
//   - El pedido NO usa estas filas en caliente: al comprar se congela un
//     snapshot. Cambiar una direccion no mueve pedidos ya hechos.

const { sequelize, Address } = require("../DataBase/models/index.js");
const { recalcProfileComplete } = require("./profile.js");
const HttpError = require("../Utils/HttpError.js");
const { assertUuid } = require("../Utils/ids.js");

const clean = (value) =>
  value === null || value === undefined ? "" : String(value).trim();

const buildAddressFields = (payload = {}) => {
  const fields = {};

  if (payload.department !== undefined) {
    fields.department = clean(payload.department).slice(0, 100) || null;
  }
  if (payload.city !== undefined) {
    fields.city = clean(payload.city).slice(0, 100) || null;
  }
  if (payload.address !== undefined) {
    fields.address = clean(payload.address).slice(0, 255);
  }
  if (payload.reference !== undefined) {
    fields.reference = clean(payload.reference).slice(0, 200) || null;
  }

  return fields;
};

const listAddresses = async (userId) =>
  Address.findAll({
    where: { userId },
    order: [
      ["isDefault", "DESC"],
      ["createdAt", "ASC"],
    ],
  });

const getAddressForUser = async ({ userId, addressId }) => {
  assertUuid(addressId, "dirección");
  const address = await Address.findOne({ where: { id: addressId, userId } });
  if (!address) {
    throw new HttpError(404, "Dirección no encontrada");
  }
  return address;
};

// Marca una direccion como principal y desmarca el resto.
const makeDefault = async ({ userId, addressId, transaction }) => {
  await Address.update(
    { isDefault: false },
    { where: { userId }, transaction },
  );
  await Address.update(
    { isDefault: true },
    { where: { id: addressId, userId }, transaction },
  );
};

const createAddress = async (userId, payload = {}) => {
  const fields = buildAddressFields(payload);
  if (!fields.address) {
    throw new HttpError(400, "La dirección es obligatoria");
  }

  const transaction = await sequelize.transaction();
  try {
    const count = await Address.count({ where: { userId }, transaction });
    const isDefault = payload.isDefault === true || count === 0;

    const address = await Address.create(
      {
        userId,
        ...fields,
        isDefault: false,
      },
      { transaction },
    );

    if (isDefault) {
      await makeDefault({ userId, addressId: address.id, transaction });
      address.isDefault = true;
    }

    await recalcProfileComplete(userId, { transaction });
    await transaction.commit();

    return address;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateAddress = async ({ userId, addressId, payload = {} }) => {
  const fields = buildAddressFields(payload);

  const transaction = await sequelize.transaction();
  try {
    const address = await Address.findOne({
      where: { id: addressId, userId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!address) {
      throw new HttpError(404, "Dirección no encontrada");
    }

    if (fields.address !== undefined && !fields.address) {
      throw new HttpError(400, "La dirección no puede quedar vacía");
    }

    await address.update(fields, { transaction });

    if (payload.isDefault === true) {
      await makeDefault({ userId, addressId, transaction });
      address.isDefault = true;
    }

    await recalcProfileComplete(userId, { transaction });
    await transaction.commit();

    return address;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const deleteAddress = async ({ userId, addressId }) => {
  const transaction = await sequelize.transaction();
  try {
    const address = await Address.findOne({
      where: { id: addressId, userId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!address) {
      throw new HttpError(404, "Dirección no encontrada");
    }

    const wasDefault = address.isDefault;
    await address.destroy({ transaction });

    if (wasDefault) {
      // Promueve la mas antigua que quede: el usuario no deberia quedarse
      // sin principal por borrar la que tenia marcada.
      const next = await Address.findOne({
        where: { userId },
        order: [["createdAt", "ASC"]],
        transaction,
      });
      if (next) {
        await makeDefault({ userId, addressId: next.id, transaction });
      }
    }

    await recalcProfileComplete(userId, { transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return { deleted: true, addressId };
};

const setDefaultAddress = async ({ userId, addressId }) => {
  const transaction = await sequelize.transaction();
  try {
    const address = await Address.findOne({
      where: { id: addressId, userId },
      transaction,
    });
    if (!address) {
      throw new HttpError(404, "Dirección no encontrada");
    }

    await makeDefault({ userId, addressId, transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return getAddressForUser({ userId, addressId });
};

// La direccion principal, o null. La usan el checkout y el snapshot.
const getDefaultAddress = async (userId) =>
  Address.findOne({ where: { userId, isDefault: true } });

// La primera direccion del usuario (respaldo si no hay principal marcada).
const getFirstAddress = async (userId) =>
  Address.findOne({ where: { userId }, order: [["createdAt", "ASC"]] });

module.exports = {
  listAddresses,
  getAddressForUser,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  getDefaultAddress,
  getFirstAddress,
};
