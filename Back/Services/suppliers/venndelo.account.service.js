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

// Metodos de pago que acepta Venndelo al crear un pedido (OpenAPI).
// OJO: no son los metodos del comprador en Upbuy (wompi/cod_vendelo); esto
// describe quien recauda el dinero en la operacion con el proveedor.
const VENNDELO_PAYMENT_METHODS = new Set(["COD", "EXTERNAL_PAYMENT"]);
const VENNDELO_ORDER_STATUSES = new Set([
  "ANY",
  "PENDING",
  "READY",
  "PREPARING",
  "SHIPPED",
  "INCIDENT",
  "DELIVERED",
  "RETURNED",
  "CANCELLED",
]);

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

// Valida lo minimo indispensable antes de reenviar a Venndelo, segun el
// esquema documentado `ApiCreateOrderIn`:
//   { billing_info, shipping_info, line_items, payment_method_code, ... }
// El resto del cuerpo se reenvia TAL CUAL (notas, descuentos, external_order_id,
// pickup_info...). No se inventan campos.
const validateOrderPayload = (body = {}) => {
  if (!isPlainObject(body)) {
    throw new HttpError(400, "El cuerpo del pedido debe ser un objeto");
  }

  if (!Array.isArray(body.line_items) || body.line_items.length === 0) {
    throw new HttpError(
      400,
      "El pedido debe incluir al menos un artículo (line_items)",
    );
  }
  if (body.line_items.some((item) => !isPlainObject(item))) {
    throw new HttpError(400, "Cada elemento de line_items debe ser un objeto");
  }

  if (!isPlainObject(body.billing_info)) {
    throw new HttpError(400, "Falta el objeto billing_info");
  }
  if (!isPlainObject(body.shipping_info)) {
    throw new HttpError(400, "Falta el objeto shipping_info");
  }

  const paymentMethodCode = String(body.payment_method_code || "").trim();
  if (!paymentMethodCode) {
    throw new HttpError(400, "Falta payment_method_code");
  }
  if (!VENNDELO_PAYMENT_METHODS.has(paymentMethodCode)) {
    throw new HttpError(
      400,
      `payment_method_code inválido: usa ${[...VENNDELO_PAYMENT_METHODS].join(" o ")}`,
    );
  }

  const externalOrderId = String(
    body.external_order_id || body.orderId || body.order_id || "",
  ).trim();

  return {
    ...body,
    payment_method_code: paymentMethodCode,
    ...(externalOrderId ? { external_order_id: externalOrderId } : {}),
  };
};

// POST /orders
const createVenndeloOrder = async (body, { idempotencyKey } = {}) => {
  const payload = validateOrderPayload(body);
  const supplier = await resolveSupplier();
  const result = await account.createOrder(supplier, payload, {
    // `external_order_id` identifica el pedido en Upbuy: sirve de clave de
    // idempotencia si el llamador no manda el header.
    idempotencyKey: idempotencyKey || payload.external_order_id,
  });
  log.info("Pedido creado en Venndelo", {
    externalOrderId: payload.external_order_id || null,
  });
  return result;
};

// GET /orders
// Venndelo pagina con `page_token` / `page_size`, no con `limit`/`page`.
// Se aceptan esos nombres documentados y se valida el estado.
const listVenndeloOrders = async (params = {}) => {
  const clean = {};

  const pageToken = String(params.page_token || "").trim();
  if (pageToken) clean.page_token = pageToken;

  const pageSizeRaw = params.page_size ?? params.limit;
  if (pageSizeRaw !== undefined && pageSizeRaw !== "") {
    const pageSize = Math.min(Math.max(Number(pageSizeRaw) || 0, 1), 500);
    clean.page_size = pageSize;
  }

  for (const key of ["created_min", "created_max"]) {
    const value = String(params[key] || "").trim();
    if (value) clean[key] = value;
  }

  const status = String(params.status || "").trim().toUpperCase();
  if (status) {
    if (!VENNDELO_ORDER_STATUSES.has(status)) {
      throw new HttpError(400, `Estado de pedido inválido: "${status}"`);
    }
    clean.status = status;
  }

  if (isPlainObject(params.filter)) clean.filter = params.filter;

  const supplier = await resolveSupplier();
  return account.listOrders(supplier, clean);
};

// GET /orders/:id
const getVenndeloOrder = async (id) => {
  const supplier = await resolveSupplier();
  return account.getOrder(supplier, id);
};

// POST /orders/:id/cancel
const cancelVenndeloOrder = async (id) => {
  const supplier = await resolveSupplier();
  const result = await account.cancelOrder(supplier, id);
  log.info("Pedido cancelado en Venndelo", { venndeloOrderId: id });
  return result;
};

// POST /orders/quotation
// Esquema `ApiOrderQuotationIn`: pickup_info, shipping_info, line_items y
// payment_method_code (no lleva billing_info).
const validateQuotationPayload = (body = {}) => {
  if (!isPlainObject(body)) {
    throw new HttpError(400, "El cuerpo de la cotización debe ser un objeto");
  }
  if (!Array.isArray(body.line_items) || body.line_items.length === 0) {
    throw new HttpError(400, "La cotización debe incluir line_items");
  }
  if (!isPlainObject(body.pickup_info)) {
    throw new HttpError(400, "Falta el objeto pickup_info");
  }
  if (!isPlainObject(body.shipping_info)) {
    throw new HttpError(400, "Falta el objeto shipping_info");
  }
  const paymentMethodCode = String(body.payment_method_code || "").trim();
  if (!VENNDELO_PAYMENT_METHODS.has(paymentMethodCode)) {
    throw new HttpError(
      400,
      `payment_method_code inválido: usa ${[...VENNDELO_PAYMENT_METHODS].join(" o ")}`,
    );
  }
  return { ...body, payment_method_code: paymentMethodCode };
};

// POST /orders/quotation
const quoteVenndeloOrder = async (body) => {
  const payload = validateQuotationPayload(body);
  const supplier = await resolveSupplier();
  return account.quoteOrder(supplier, payload);
};

// POST /orders/:id/modify-order-confirmation-status
const modifyVenndeloOrderConfirmation = async (id, body = {}) => {
  const confirmationStatus = String(body.confirmation_status || "").trim();
  if (!["CONFIRMED", "REJECTED"].includes(confirmationStatus)) {
    throw new HttpError(
      400,
      "confirmation_status debe ser CONFIRMED o REJECTED",
    );
  }
  const supplier = await resolveSupplier();
  return account.modifyOrderConfirmation(supplier, id, {
    ...body,
    confirmation_status: confirmationStatus,
  });
};

module.exports = {
  SLUG,
  VENNDELO_PAYMENT_METHODS,
  createWalletTopup,
  getWalletBalance,
  createVenndeloOrder,
  listVenndeloOrders,
  getVenndeloOrder,
  cancelVenndeloOrder,
  quoteVenndeloOrder,
  modifyVenndeloOrderConfirmation,
  validateOrderPayload,
  validateQuotationPayload,
};