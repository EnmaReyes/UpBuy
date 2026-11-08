// Registro de adaptadores de proveedores de dropshipping.
//
// Contrato comun (todos los adaptadores lo cumplen):
//
//   name                        -> "vendelo" | "dropi"
//   isConfigured()              -> bool (sin credenciales = modo manual/503)
//   listProducts(page, opts)    -> { provider, page, items, raw }
//   createOrder({order, items}) -> { provider, providerOrderId, ... }
//   getOrderStatus(id)          -> { providerStatus, canonical, ... }
//   updateOrderStatus(id, to)   -> { provider, providerOrderId, canonicalStatus }
//
// El resto del backend NO importa vendelo.client.js ni dropi.client.js
// directamente: pide el adaptador por nombre con getProvider(). Asi se puede
// cambiar de proveedor sin tocar la logica de pedidos.

const vendelo = require("./vendelo.client.js");
const dropi = require("./dropi.client.js");
const { PROVIDER, PROVIDER_VALUES } = require("../../DataBase/models/enums.js");
const HttpError = require("../../Utils/HttpError.js");

const CLIENTS = {
  [PROVIDER.VENDELO]: vendelo,
  [PROVIDER.DROPI]: dropi,
};

const getProvider = (name) => {
  const key = String(name || "").trim().toLowerCase();
  const client = CLIENTS[key];
  if (!client) {
    throw new HttpError(
      400,
      `Proveedor inválido: "${name}" (esperado: ${PROVIDER_VALUES.join(", ")})`,
    );
  }
  return client;
};

// Lista de proveedores con su estado de conexion, para el panel.
const listProviders = () =>
  PROVIDER_VALUES.map((name) => ({
    name,
    configured: CLIENTS[name].isConfigured(),
    modes: name === PROVIDER.DROPI ? ["manual", "api"] : ["api"],
  }));

module.exports = {
  getProvider,
  listProviders,
  CLIENTS,
};
