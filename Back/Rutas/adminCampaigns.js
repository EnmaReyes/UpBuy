// Rutas de campanas de difusion por email (ADM-7).
//
//   GET  /status              estado de Gmail (configurada/conectada, cuota)
//   GET  /oauth/start         URL de autorizacion de Google + cookie state
//   GET  /oauth/callback      intercambia el code y guarda el token cifrado
//   POST /audience            conteo + muestra (10) del segmento
//   POST /                    crea la campana y calcula destinatarios
//   POST /:id/send            envia UN lote de 25 (reintentable)
//   GET  /                    historial
//   GET  /:id                 detalle por destinatario
//   POST /test-send           correo de prueba al propio admin
//
// WhatsApp (ADM-8) comparte este router:
//
//   POST /whatsapp/audience        conteo de elegibles del segmento
//   POST /                        crea la campana (channel = email | whatsapp)
//   POST /:id/send-whatsapp        envia UN lote de 20 (reintentable)
//   GET  /:id/whatsapp/manual      filas para el envio manual (wa.me)
//   POST /:id/whatsapp/manual-sent marca un envio manual hecho
//   GET  /:id/whatsapp/export.csv  CSV del modo manual
//
// El estado y la prueba de WhatsApp viven en Rutas/adminWhatsapp.js.
//
// El envio exige `campaigns.send` y step-up reciente (segundo factor).

const express = require("express");
const {
  requireAuth,
  requireAdminSession,
  requirePermission,
} = require("../Middleware/auth.js");
const { requireStepUp } = require("../Middlewares/requireStepUp.js");
const { campaignLimiter } = require("../Middlewares/rateLimits.js");
const {
  audience,
  create,
  detail,
  list,
  oauthRedirectHandler,
  send,
  sendWhatsapp,
  startOauth,
  status,
  testSend,
  whatsappAudienceHandler,
  whatsappCsv,
  whatsappManual,
  whatsappManualSent,
} = require("../Controllers/adminCampaigns.js");

const router = express.Router();

// Panel de administracion: sesion revocable + rol actual desde la base.
router.use(requireAuth, requireAdminSession);

const canRead = requirePermission("campaigns.read");
const canSend = requirePermission("campaigns.send");

// El envio de una difusion masiva es destructivo (no se puede deshacer):
// segundo factor reciente, como reembolsar o cancelar.
const stepUpSend = requireStepUp("campaigns.send");

// Rutas fijas ANTES de /:id para que no las capture el parametro.
router.get("/status", canRead, status);
router.get("/oauth/start", canSend, startOauth);
router.get("/oauth/callback", oauthRedirectHandler);
router.post("/audience", canSend, campaignLimiter, audience);
router.post("/test-send", canSend, campaignLimiter, testSend);
router.post("/whatsapp/audience", canSend, campaignLimiter, whatsappAudienceHandler);

router.get("/", canRead, list);
router.post("/", canSend, campaignLimiter, stepUpSend, create);
router.post("/:id/send", canSend, campaignLimiter, stepUpSend, send);
// WhatsApp: mismas garantias de step-up y idempotencia.
router.post("/:id/send-whatsapp", canSend, campaignLimiter, stepUpSend, sendWhatsapp);
router.get("/:id/whatsapp/manual", canRead, whatsappManual);
router.post(
  "/:id/whatsapp/manual-sent",
  canSend,
  campaignLimiter,
  whatsappManualSent,
);
router.get("/:id/whatsapp/export.csv", canRead, whatsappCsv);
router.get("/:id", canRead, detail);

module.exports = router;
