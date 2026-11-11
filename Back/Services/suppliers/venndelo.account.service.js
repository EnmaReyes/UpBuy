// Fachada administrativa de Venndelo para wallet y pedidos.
//
// Une el adaptador (integrations/suppliers/venndelo/venndelo.account.js) con
// la fila `suppliers` de la base y con la configuracion del entorno. El
// controlador solo llama estos metodos y no sabe nada de Venndelo.
//
// Nota de arquitectura: esto es OPERACION ADMINISTRATIVA (financiar la wallet
// del proveedor, crear/consultar pedidos en Venndelo). El pago del cliente
// final sigue siendo Wompi (Services/wompi.js). No mezclar ambos flujos.
const {
  VENNDELO_RETURN_URL,
  VENNDELO_CANCEL_URL,
} = require("../../config.js");
const { getSupplierAdapter, SUPPLIER_SLUG } = require("../../integrations/suppliers/index.js");
const account = require("../../integrations/suppliers/venndelo/venndelo.account.js");
const runs = require("../catalog/catalogRuns.service.js");
const HttpError = require("../../Utils/HttpError.js");
const { createLogger } = require("../../Utils/logger.js");

const log = createLogger("venndelo.account");
const SLUG = SUPPLIER_SLUG.VENNDELO;

// Devuelve la fila del proveedor y falla con un mensaje claro si la
// integracion no esta configurada.
const resolveSupplier = async () => {
  const supplier = await runs.getSupplierRow(SLUG);
  const adapter = getSupplierAdapter(SLUG);
  if (!adapter.isConfigured()) {
    throw new HttpError(
      503,
      "Venndelo no está configurado (faltan VENNDELO_CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN)",
    );
  }
  return supplier;
};

// POST /account/wallet/topup
const createWalletTopup = async ({
  amount,
  returnUrl,
  cancelUrl,
  idempotencyKey,
} = {}) => {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new HttpError(400, "El monto del topup debe ser mayor que 0");
  }
  // Un topup grande es una accion sensible: se deja constancia sin secretos.
  log.info("Solicitud de topup de wallet Venndelo", { amount: numeric });

  const supplier = await resolveSupplier();

  return account.createWalletTopup(supplier, {
    amount: numeric,
    returnUrl: returnUrl || VENNDELO_RETURN_URL || undefined,
    cancelUrl: cancelUrl || VENNDELO_CANCEL_URL || undefined,
    idempotencyKey,
  });
};

// GET /account/wallet/balance
const getWalletBalance = async () => {
  const supplier = await resolveSupplier();
  return account.getWalletBalance(supplier);
};

// Valida lo minimo indispensable antes de reenviar a Venndelo. El resto del
// cuerpo se reenvia TAL CUAL: la forma exacta del payload de pedidos no esta
// documentada en este repo, asi que no se inventan campos.
// TODO: validar contra doc Venndelo cuando se confirme el esquema.
const validateOrderPayload = (body = {}) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "El cuerpo del pedido debe ser un objeto");
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new HttpError(400, "El pedido debe incluir al menos un artículo (items)");
  }

  const paymentMethodCode =
    body.payment_method_code || body.paymentMethodCode || null;
  if (!paymentMethodCode || typeof paymentMethodCode !== "string") {
    throw new HttpError(400, "Falta payment_method_code");
  }

  if (!body.customer || typeof body.customer !== "object") {
    throw new HttpError(400, "Falta el objeto customer");
  }

  return { ...body, payment_method_code: paymentMethodCode };
};

// POST /orders
const createVenndeloOrder = async (body, { idempotencyKey } = {}) => {
  const payload = validateOrderPayload(body);
  const supplier = await resolveSupplier();
  const result = await account.createOrder(supplier, payload, {
    // `orderId` del cliente sirve como clave de idempotencia si no hay header.
    idempotencyKey: idempotencyKey || payload.orderId || payload.order_id,
  });
  log.info("Pedido creado en Venndelo", {
    clientOrderId: payload.orderId || payload.order_id || null,
  });
  return result;
};

// GET /orders
const listVenndeloOrders = async (params = {}) => {
  const supplier = await resolveSupplier();
  return account.listOrders(supplier, params);
};

// GET /orders/:id
const getVenndeloOrder = async (id) => {
  const supplier = await resolveSupplier();
  return account.getOrder(supplier, id);
};

module.exports = {
  SLUG,
  createWalletTopup,
  getWalletBalance,
  createVenndeloOrder,
  listVenndeloOrders,
  getVenndeloOrder,
  validateOrderPayload,
};