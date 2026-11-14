// Rutas de estado de WhatsApp (ADM-8).
//
//   GET  /api/admin/whatsapp/status  configuracion + plantilla + cuota diaria
//   POST /api/admin/whatsapp/test    mensaje de prueba SOLO al admin
//
// La difusion real vive en Rutas/adminCampaigns.js (send-whatsapp). Sin
// credenciales el status responde configured=false: el panel ofrece modo
// manual y no finge envios.

const express = require("express");
const {
  requireAuth,
  requireAdminSession,
  requirePermission,
} = require("../Middleware/auth.js");
const { campaignLimiter } = require("../Middlewares/rateLimits.js");
const {
  whatsappStatusHandler,
  whatsappTest,
} = require("../Controllers/adminCampaigns.js");

const router = express.Router();

router.use(requireAuth, requireAdminSession);

const canRead = requirePermission("campaigns.read");
const canSend = requirePermission("campaigns.send");

router.get("/status", canRead, whatsappStatusHandler);
// La prueba es un envio real: limiter y permiso de envio.
router.post("/test", canSend, campaignLimiter, whatsappTest);

module.exports = router;
