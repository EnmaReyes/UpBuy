const express = require("express");
const { wompi, vendelo, dispatch } = require("../Controllers/webhooks.js");
const { webhookLimiter } = require("../Middlewares/rateLimits.js");

const router = express.Router();

// Rutas explicitas (las que se documentan a cada proveedor).
router.post("/wompi", webhookLimiter, wompi);
router.post("/vendelo", webhookLimiter, vendelo);

// Alias generico: POST /api/webhooks/:provider
router.post("/:provider", webhookLimiter, dispatch);

module.exports = router;
