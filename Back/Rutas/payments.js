const express = require("express");
const { webhook, intent } = require("../Controllers/payments.js");
const { requireAuth } = require("../Middleware/auth.js");
const {
  requireCompleteProfile,
} = require("../Middlewares/requireCompleteProfile.js");
const {
  webhookLimiter,
  paymentLimiter,
} = require("../Middlewares/rateLimits.js");

const router = express.Router();

// Publico a proposito: la autenticidad la da la firma del evento, no una
// cookie. Nada de requireAuth aqui (Wompi no tiene sesion).
// Se conserva por compatibilidad; la ruta canonica es /api/webhooks/wompi.
router.post("/webhook", webhookLimiter, webhook);

// Crear un intento de pago del pedido (requiere sesion y perfil completo).
router.post(
  "/intent",
  requireAuth,
  paymentLimiter,
  requireCompleteProfile,
  intent,
);

module.exports = router;
