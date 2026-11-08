// API del comprador autenticado: perfil y direcciones.
//
//   GET    /api/users/me
//   PUT    /api/users/me
//   GET    /api/users/me/addresses
//   POST   /api/users/me/addresses
//   PUT    /api/users/me/addresses/:id
//   DELETE /api/users/me/addresses/:id
//   PUT    /api/users/me/addresses/:id/default

const { Usuarios, Address } = require("../DataBase/models/index.js");
const { updateProfile, findMissingProfileFields } = require("../Services/profile.js");
const {
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  getAddressForUser,
} = require("../Services/addresses.js");
const { sendError } = require("../Utils/respond.js");
const HttpError = require("../Utils/HttpError.js");

const getMe = async (req, res) => {
  try {
    const user = await Usuarios.findByPk(req.user.id, {
      attributes: { exclude: ["password", "gmailRefreshToken"] },
    });
    if (!user) {
      throw new HttpError(404, "Usuario no encontrado");
    }

    const defaultAddress = await Address.findOne({
      where: { userId: user.id, isDefault: true },
    });
    const missing = findMissingProfileFields({ user, defaultAddress });

    return res.status(200).json({
      ...user.toJSON(),
      defaultAddress,
      profileComplete: missing.length === 0,
      missing,
    });
  } catch (error) {
    return sendError(res, error, "No se pudo cargar el perfil");
  }
};

const updateMe = async (req, res) => {
  try {
    const { user, profileComplete, missing } = await updateProfile(
      req.user.id,
      req.body || {},
    );
    return res.status(200).json({ ...user.toJSON(), profileComplete, missing });
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar el perfil");
  }
};

const addresses = async (req, res) => {
  try {
    const rows = await listAddresses(req.user.id);
    return res.status(200).json({ addresses: rows });
  } catch (error) {
    return sendError(res, error, "No se pudieron cargar las direcciones");
  }
};

const createAddressHandler = async (req, res) => {
  try {
    const address = await createAddress(req.user.id, req.body || {});
    return res.status(201).json(address);
  } catch (error) {
    return sendError(res, error, "No se pudo crear la dirección");
  }
};

const updateAddressHandler = async (req, res) => {
  try {
    const address = await updateAddress({
      userId: req.user.id,
      addressId: req.params.id,
      payload: req.body || {},
    });
    return res.status(200).json(address);
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar la dirección");
  }
};

const deleteAddressHandler = async (req, res) => {
  try {
    const result = await deleteAddress({
      userId: req.user.id,
      addressId: req.params.id,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudo eliminar la dirección");
  }
};

const setDefaultHandler = async (req, res) => {
  try {
    // Verifica pertenencia antes de tocar nada.
    await getAddressForUser({ userId: req.user.id, addressId: req.params.id });
    const address = await setDefaultAddress({
      userId: req.user.id,
      addressId: req.params.id,
    });
    return res.status(200).json(address);
  } catch (error) {
    return sendError(res, error, "No se pudo marcar la dirección");
  }
};

module.exports = {
  getMe,
  updateMe,
  addresses,
  createAddressHandler,
  updateAddressHandler,
  deleteAddressHandler,
  setDefaultHandler,
};
