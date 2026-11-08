const {
  listOrdersAdmin,
  getOrderAdmin,
  changeOrderStatus,
  updateTracking,
  orderStats,
  salesByPeriod,
} = require("../Services/adminOrders.js");
const { createManualOrder } = require("../Services/orders.js");
const {
  listOrderPayments,
  registerPayment,
  changePaymentStatus,
} = require("../Services/payments.js");
const { sendError } = require("../Utils/respond.js");

// GET /api/admin/orders?status&paymentStatus&channel&paymentMethod&q&from&to&limit&offset
const list = async (req, res) => {
  try {
    const {
      status,
      paymentStatus,
      channel,
      paymentMethod,
      q,
      from,
      to,
      limit,
      offset,
    } = req.query;
    const result = await listOrdersAdmin({
      status,
      paymentStatus,
      channel,
      paymentMethod,
      q,
      from,
      to,
      limit,
      offset,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudieron cargar los pedidos");
  }
};

// POST /api/admin/orders/manual — registrar una venta externa a mano.
// Body: { items, shipping, notes?, channel?, paymentMethod?, paymentStatus?,
//         deliveryType?, discount? }
const createManual = async (req, res) => {
  try {
    const {
      items,
      shipping,
      notes,
      channel,
      paymentMethod,
      paymentStatus,
      deliveryType,
      discount,
    } = req.body || {};

    const order = await createManualOrder({
      adminId: req.user.id,
      items,
      shipping,
      notes,
      channel,
      paymentMethod,
      paymentStatus,
      deliveryType,
      manualDiscount: discount,
    });

    return res.status(201).json(order);
  } catch (error) {
    return sendError(res, error, "No se pudo registrar la venta");
  }
};

// GET /api/admin/orders/stats
const stats = async (req, res) => {
  try {
    const result = await orderStats();
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudo cargar el resumen");
  }
};

// GET /api/admin/orders/:id
const detail = async (req, res) => {
  try {
    const order = await getOrderAdmin(req.params.id);
    return res.status(200).json(order);
  } catch (error) {
    return sendError(res, error, "No se pudo cargar el pedido");
  }
};

// PATCH /api/admin/orders/:id/status  { status, note? }
const changeStatus = async (req, res) => {
  try {
    const { status, note } = req.body || {};
    const order = await changeOrderStatus({
      orderId: req.params.id,
      status,
      note,
      adminId: req.user.id,
    });
    return res.status(200).json(order);
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar el estado");
  }
};

// PATCH /api/admin/orders/:id/tracking  { trackingCarrier?, trackingNumber? }
const tracking = async (req, res) => {
  try {
    const { trackingCarrier, trackingNumber } = req.body || {};
    const order = await updateTracking({
      orderId: req.params.id,
      trackingCarrier,
      trackingNumber,
    });
    return res.status(200).json(order);
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar el envío");
  }
};

// GET /api/admin/orders/ventas?periodo=dia|semana|mes|anio
const sales = async (req, res) => {
  try {
    const { periodo } = req.query;
    const result = await salesByPeriod({ periodo });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudieron cargar las ventas");
  }
};

// GET /api/admin/orders/:id/payments — intentos de pago del pedido.
const payments = async (req, res) => {
  try {
    const result = await listOrderPayments(req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudieron cargar los pagos");
  }
};

// POST /api/admin/orders/:id/payments
// Body: { status?, paymentMethodType?, statusMessage?, failureCode?, note? }
// Registra o actualiza el pago manual del pedido (transferencia/Nequi/efectivo).
const registerPaymentHandler = async (req, res) => {
  try {
    const { status, paymentMethodType, statusMessage, failureCode, note } =
      req.body || {};

    const { order } = await registerPayment({
      orderId: req.params.id,
      status: status || "aprobado",
      paymentMethodType,
      statusMessage,
      failureCode,
      actorUserId: req.user.id,
      note,
    });

    // Se devuelve el pedido completo para que el panel se actualice de una.
    return res.status(201).json(await getOrderAdmin(order.id));
  } catch (error) {
    return sendError(res, error, "No se pudo registrar el pago");
  }
};

// PATCH /api/admin/orders/:id/payments/:paymentId
// Body: { status, statusMessage?, failureCode?, note? }
// Cambia el estado de un pago ya registrado (reembolso, anulacion).
const changePayment = async (req, res) => {
  try {
    const { status, paymentMethodType, statusMessage, failureCode, note } =
      req.body || {};

    const { order } = await changePaymentStatus({
      orderId: req.params.id,
      paymentId: req.params.paymentId,
      status,
      paymentMethodType,
      statusMessage,
      failureCode,
      actorUserId: req.user.id,
      note,
    });

    return res.status(200).json(await getOrderAdmin(order.id));
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar el pago");
  }
};

module.exports = {
  list,
  stats,
  detail,
  changeStatus,
  tracking,
  sales,
  createManual,
  payments,
  registerPaymentHandler,
  changePayment,
};
