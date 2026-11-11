const {
  createOrder,
  cancelOrder,
  getOrderForUser,
  listOrdersForUser,
  getPublicTracking,
} = require("../Services/orders.js");
const {
  createCheckoutForOrder,
  verifyOrderPayment,
} = require("../Services/wompi.js");
const { sendError } = require("../Utils/respond.js");

// POST /api/orders — requiere sesion
const create = async (req, res) => {
  try {
    const { items, shipping, notes, paymentMethodCode } = req.body || {};
    const order = await createOrder({
      userId: req.user.id,
      items,
      shipping,
      notes,
      // "wompi" (por defecto) o un codigo contra entrega. El servicio valida
      // el valor y fija los estados iniciales segun el metodo.
      paymentMethodCode,
    });
    return res.status(201).json(order);
  } catch (error) {
    return sendError(res, error, "No se pudo crear el pedido");
  }
};

// GET /api/orders — pedidos del usuario autenticado
const list = async (req, res) => {
  try {
    const { limit, offset, status, fulfillmentStatus, paymentState } = req.query;
    const result = await listOrdersForUser({
      userId: req.user.id,
      limit,
      offset,
      // `status` es el nombre historico del parametro; `fulfillmentStatus`
      // es el canonico. Se aceptan los dos.
      status: fulfillmentStatus || status,
      paymentState,
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

// GET /api/orders/:id/tracking — publico (sin sesion).
// Exige que el telefono o el correo coincidan con el pedido.
const tracking = async (req, res) => {
  try {
    const { phone, email } = req.query;
    const result = await getPublicTracking({
      orderId: req.params.id,
      phone,
      email,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudo cargar el seguimiento");
  }
};

module.exports = {
  create,
  list,
  detail,
  tracking,
  cancel,
  createPayment,
  verifyPayment,
};
