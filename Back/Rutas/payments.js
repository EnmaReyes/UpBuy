const express = require("express");
const { webhook } = require("../Controllers/payments.js");
const { webhookLimiter } = require("../Middlewares/rateLimits.js");

const router = express.Router();

// Publico a proposito: la autenticidad la da la firma del evento, no una
// cookie. Nada de requireAuth aqui (Wompi no tiene sesion).
router.post("/webhook", webhookLimiter, webhook);

module.exports = router;
