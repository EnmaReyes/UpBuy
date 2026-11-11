// Capa HTTP de Venndelo (wallet y pedidos). Solo valida y delega.
const { sendError } = require("../../Utils/respond.js");
const service = require("../../Services/suppliers/venndelo.account.service.js");

// Clave de idempotencia: header estandar o variante con X-.
const idempotencyKey = (req) =>
  req.get("Idempotency-Key") || req.get("X-Idempotency-Key") || null;

// POST /api/admin/suppliers/venndelo/wallet/topup
// Body: { amount: number, return_url?, cancel_url? }
const topup = async (req, res) => {
  try {
    const { amount, return_url, cancel_url } = req.body || {};
    const result = await service.createWalletTopup({
      amount,
      returnUrl: return_url,
      cancelUrl: cancel_url,
      idempotencyKey: idempotencyKey(req),
    });
    return res.status(201).json({ payment_url: result.payment_url });
  } catch (error) {
    return sendError(res, error, "No se pudo iniciar el topup de la wallet");
  }
};

// GET /api/admin/suppliers/venndelo/wallet/balance
const balance = async (req, res) => {
  try {
    return res.json(await service.getWalletBalance());
  } catch (error) {
    return sendError(res, error, "No se pudo consultar el saldo de la wallet");
  }
};

// POST /api/admin/suppliers/venndelo/orders
const createOrder = async (req, res) => {
  try {
    const result = await service.createVenndeloOrder(req.body, {
      idempotencyKey: idempotencyKey(req),
    });
    return res.status(201).json(result.order);
  } catch (error) {
    return sendError(res, error, "No se pudo crear el pedido en Venndelo");
  }
};

// GET /api/admin/suppliers/venndelo/orders
const listOrders = async (req, res) => {
  try {
    const result = await service.listVenndeloOrders(req.query || {});
    return res.json(result.orders);
  } catch (error) {
    return sendError(res, error, "No se pudieron listar los pedidos de Venndelo");
  }
};

// GET /api/admin/suppliers/venndelo/orders/:id
const getOrder = async (req, res) => {
  try {
    const result = await service.getVenndeloOrder(req.params.id);
    return res.json(result.order);
  } catch (error) {
    return sendError(res, error, "No se pudo obtener el pedido de Venndelo");
  }
};

module.exports = { topup, balance, createOrder, listOrders, getOrder };