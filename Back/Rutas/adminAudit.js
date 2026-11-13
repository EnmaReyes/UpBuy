const express = require("express");
const {
  requireAuth,
  requireAdminSession,
  requirePermission,
} = require("../Middleware/auth.js");
const { requireStepUp } = require("../Middlewares/requireStepUp.js");
const { listEvents, pruneEvents } = require("../Controllers/adminAudit.js");

const router = express.Router();

router.use(requireAuth, requireAdminSession);

// Revision de logs: solo superadmin con `audit.read`.
router.get("/events", requirePermission("audit.read"), listEvents);

// La limpieza borra evidencia: exige step-up y el permiso de gobierno.
router.post(
  "/prune",
  requirePermission("audit.read"),
  requireStepUp("admins.manage"),
  pruneEvents,
);

module.exports = router;
