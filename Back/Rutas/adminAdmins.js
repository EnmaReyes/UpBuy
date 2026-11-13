const express = require("express");
const {
  requireAuth,
  requireAdminSession,
  requirePermission,
} = require("../Middleware/auth.js");
const { requireStepUp } = require("../Middlewares/requireStepUp.js");
const {
  listSessions,
  revokeAll,
  revokeOne,
  listAdmins,
  updateAdmin,
} = require("../Controllers/adminAdmins.js");

const router = express.Router();

router.use(requireAuth, requireAdminSession);

// Sesiones del propio administrador autenticado (ADM-S1).
router.get("/sessions", listSessions);
router.post("/sessions/revoke-all", revokeAll);
router.delete("/sessions/:id", revokeOne);

// Gobierno de administradores (ADM-S3): solo superadmin y con step-up
// reciente. Un admin normal recibe 403 PERMISSION_DENIED.
const canManageAdmins = requirePermission("admins.manage");

router.get("/", canManageAdmins, listAdmins);
router.patch(
  "/:id",
  canManageAdmins,
  requireStepUp("admins.manage"),
  updateAdmin,
);

module.exports = router;
