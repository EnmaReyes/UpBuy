const express = require("express");
const {
  wompi,
  venndelo,
  mastershop,
  dispatch,
} = require("../Controllers/webhooks.js");
const { webhookLimiter } = require("../Middlewares/rateLimits.js");

const router = express.Router();

// Rutas explicitas (las que se documentan a cada proveedor).
router.post("/wompi", webhookLimiter, wompi);
// Venndelo (doble N): eventos de pedidos/envios del chatbot.
router.post("/venndelo", webhookLimiter, venndelo);
// MasterShop: estado/tracking (sin firma; se valida reconsultando la API).
router.post("/mastershop", webhookLimiter, mastershop);

// Alias generico: POST /api/webhooks/:provider
router.post("/:provider", webhookLimiter, dispatch);

module.exports = router;