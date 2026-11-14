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
  securityOverview,
  regenerateCodes,
  listAdmins,
  updateAdmin,
} = require("../Controllers/adminAdmins.js");

const router = express.Router();

router.use(requireAuth, requireAdminSession);

// Sesiones del propio administrador autenticado (ADM-S1).
router.get("/sessions", listSessions);
router.post("/sessions/revoke-all", revokeAll);
router.delete("/sessions/:id", revokeOne);

// Estado de seguridad personal (`/admin/perfil/seguridad`). Lo puede consultar
// cualquier administrador autenticado: no es gobierno de cuentas ajenas.
router.get("/security", securityOverview);
// Regenerar los codigos de respaldo es sensible: exige segundo factor
// reciente, igual que el resto de acciones destructivas.
router.post(
  "/security/backup-codes",
  requireStepUp("security.backup_codes"),
  regenerateCodes,
);

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
