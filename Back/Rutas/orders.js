const express = require("express");
const { requireAuth } = require("../Middleware/auth.js");
const {
  requireCompleteProfile,
} = require("../Middlewares/requireCompleteProfile.js");
const {
  create,
  list,
  detail,
  tracking,
  cancel,
  createPayment,
  verifyPayment,
} = require("../Controllers/orders.js");
const {
  orderLimiter,
  paymentLimiter,
} = require("../Middlewares/rateLimits.js");

const router = express.Router();

// Tracking publico: cualquiera con el enlace + telefono/correo del pedido
// puede consultarlo, sin iniciar sesion. Va ANTES de requireAuth a proposito.
router.get("/:id/tracking", tracking);

// Todo lo demas exige sesion iniciada. Los invitados ven el catalogo y el
// carrito, pero no compran.
router.use(requireAuth);

// Crear pedido exige perfil completo (nombre, apellido, telefono y
// direccion principal): sin esos datos el courier no puede entregar.
router.post("/", orderLimiter, requireCompleteProfile, create);

// Alias explicito del listado del comprador (el prompt lo llama /mine).
router.get("/mine", list);
router.get("/", list);

router.get("/:id", detail);
router.post("/:id/cancel", cancel);

// Pago en linea (Wompi Web Checkout). Solo el dueño del pedido.
router.post("/:id/payment", paymentLimiter, createPayment);
router.post("/:id/payment/verify", paymentLimiter, verifyPayment);

module.exports = router;
