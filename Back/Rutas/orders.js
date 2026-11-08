const express = require("express");
const { requireAuth } = require("../Middleware/auth.js");
const {
  create,
  list,
  detail,
  cancel,
  createPayment,
  verifyPayment,
} = require("../Controllers/orders.js");
const {
  orderLimiter,
  paymentLimiter,
} = require("../Middlewares/rateLimits.js");

const router = express.Router();

// Todos los endpoints de pedidos requieren sesion iniciada.
// Los invitados pueden ver el catalogo y el carrito, pero no comprar.
router.use(requireAuth);

router.post("/", orderLimiter, create);
router.get("/", list);
router.get("/:id", detail);
router.post("/:id/cancel", cancel);

// Pago en linea (Wompi Web Checkout). Solo el dueño del pedido.
router.post("/:id/payment", paymentLimiter, createPayment);
router.post("/:id/payment/verify", paymentLimiter, verifyPayment);

module.exports = router;
