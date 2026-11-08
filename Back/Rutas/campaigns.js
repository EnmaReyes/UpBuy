const express = require("express");
const { requireAuth, requireAdmin } = require("../Middleware/auth.js");
const {
  oauthStart,
  oauthCallback,
  status,
  send,
  list,
} = require("../Controllers/campaigns.js");

const router = express.Router();
router.use(requireAuth, requireAdmin);

// OAuth flow
router.get("/oauth/start", oauthStart);
router.get("/oauth/callback", oauthCallback);

// Estado de autorización
router.get("/status", status);

// Envío e historial
router.post("/send", send);
router.get("/", list);

module.exports = router;
