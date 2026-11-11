// Operaciones de cuenta y pedidos de Venndelo Pro.
//
// A diferencia del catalogo (venndelo.catalog.js), aqui viven las llamadas
// "de dinero / operacion" del panel administrativo:
//
//   POST /account/wallet/topup     -> { payment_url }
//   GET  /account/wallet/balance   -> { balance, detail }
//   POST /orders                   -> crear pedido
//   GET  /orders                   -> listar pedidos
//   GET  /orders/{id}              -> detalle de un pedido
//
// Todas pasan por venndelo.client.adminJson, que ya inyecta el Bearer, renueva
// el token ante un 401 y traduce los errores HTTP a HttpError.
//
// NUNCA se devuelve ni se registra el access_token / client_secret.
const { adminJson } = require("./venndelo.client.js");
const HttpError = require("../../../Utils/HttpError.js");

const PATHS = {
  walletTopup: "/account/wallet/topup",
  walletBalance: "/account/wallet/balance",
  orders: "/orders",
  orderDetail: "/orders/{id}",
};

// Idempotencia: si el llamador trae una clave, se manda tal cual en el header
// estandar. Venndelo puede ignorarlo; el backend de Upbuy tambien deduplica
// por `orderId` del cliente (ver Servicios). TODO: validar contra doc Venndelo
// si el header real es otro (por ejemplo `X-Idempotency-Key`).
const idempotencyHeaders = (key) => {
  const value = String(key || "").trim();
  return value ? { "Idempotency-Key": value.slice(0, 100) } : {};
};

// Algunas APIs envuelven la respuesta en `{ data: ... }`; se toleran ambas.
const unwrap = (data) => (data && typeof data === "object" && data.data) || data;

// Topup de la wallet del proveedor. Devuelve `payment_url` (hosted checkout).
const createWalletTopup = async (
  supplier,
  { amount, returnUrl, cancelUrl, idempotencyKey } = {},
) => {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new HttpError(400, "El monto del topup debe ser mayor que 0");
  }

  const body = { amount: numeric };
  if (returnUrl) body.return_url = String(returnUrl);
  if (cancelUrl) body.cancel_url = String(cancelUrl);

  const data = await adminJson(supplier, "POST", PATHS.walletTopup, {
    body,
    headers: idempotencyHeaders(idempotencyKey),
  });

  const payload = unwrap(data);
  const paymentUrl = payload?.payment_url || payload?.paymentUrl || payload?.url;

  if (!paymentUrl) {
    throw new HttpError(502, "Venndelo no devolvió la URL de pago (payment_url)");
  }

  return { payment_url: String(paymentUrl), raw: data };
};

// Saldo de la wallet del proveedor.
const getWalletBalance = async (supplier) => {
  const data = await adminJson(supplier, "GET", PATHS.walletBalance);
  const payload = unwrap(data);
  return {
    balance: payload?.balance ?? null,
    detail: payload?.detail ?? null,
    raw: data,
  };
};

// Crea un pedido en Venndelo. El cuerpo lo valida/normaliza el servicio.
const createOrder = async (supplier, payload, { idempotencyKey } = {}) => {
  const data = await adminJson(supplier, "POST", PATHS.orders, {
    body: payload,
    headers: idempotencyHeaders(idempotencyKey),
  });
  return { order: unwrap(data), raw: data };
};

// Lista pedidos (proxy de la paginacion de Venndelo).
const listOrders = async (supplier, params = {}) => {
  const data = await adminJson(supplier, "GET", PATHS.orders, { params });
  return { orders: unwrap(data), raw: data };
};

// Detalle de un pedido por id de Venndelo.
const getOrder = async (supplier, id) => {
  const orderId = String(id || "").trim();
  if (!orderId) {
    throw new HttpError(400, "Falta el id del pedido de Venndelo");
  }
  const path = PATHS.orderDetail.replace("{id}", encodeURIComponent(orderId));
  const data = await adminJson(supplier, "GET", path);
  return { order: unwrap(data), raw: data };
};

module.exports = {
  PATHS,
  createWalletTopup,
  getWalletBalance,
  createOrder,
  listOrders,
  getOrder,
};