const {
  createOrder,
  cancelOrder,
  getOrderForUser,
  listOrdersForUser,
} = require("../Services/orders.js");
const {
  createCheckoutForOrder,
  verifyOrderPayment,
} = require("../Services/wompi.js");
const { sendError } = require("../Utils/respond.js");

// POST /api/orders — requiere sesion
const create = async (req, res) => {
  try {
    const { items, shipping, notes } = req.body || {};
    const order = await createOrder({
      userId: req.user.id,
      items,
      shipping,
      notes,
    });
    return res.status(201).json(order);
  } catch (error) {
    return sendError(res, error, "No se pudo crear el pedido");
  }
};

// GET /api/orders — pedidos del usuario autenticado
const list = async (req, res) => {
  try {
    const { limit, offset, status } = req.query;
    const result = await listOrdersForUser({
      userId: req.user.id,
      limit,
      offset,
      status,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudieron cargar los pedidos");
  }
};

// GET /api/orders/:id — solo el dueño (o admin)
const detail = async (req, res) => {
  try {
    const order = await getOrderForUser({
      orderId: req.params.id,
      userId: req.user.id,
      admin: req.user.admin,
    });
    return res.status(200).json(order);
  } catch (error) {
    return sendError(res, error, "No se pudo cargar el pedido");
  }
};

// POST /api/orders/:id/cancel — solo pendiente_pago
const cancel = async (req, res) => {
  try {
    const order = await cancelOrder({
      orderId: req.params.id,
      user: req.user,
    });
    return res.status(200).json(order);
  } catch (error) {
    return sendError(res, error, "No se pudo cancelar el pedido");
  }
};

// POST /api/orders/:id/payment — URL de pago de Wompi para este pedido.
const createPayment = async (req, res) => {
  try {
    const result = await createCheckoutForOrder({
      orderId: req.params.id,
      userId: req.user.id,
    });
    return res.status(201).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudo iniciar el pago");
  }
};

// POST /api/orders/:id/payment/verify — consulta el estado real en Wompi.
// Body: { transactionId } (o ?transactionId=...)
const verifyPayment = async (req, res) => {
  try {
    const transactionId =
      req.body?.transactionId || req.query?.transactionId;

    const result = await verifyOrderPayment({
      orderId: req.params.id,
      userId: req.user.id,
      transactionId,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudo verificar el pago");
  }
};

module.exports = { create, list, detail, cancel, createPayment, verifyPayment };
