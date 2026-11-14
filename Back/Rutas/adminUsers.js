// Rutas de clientes / usuarios (ADM-9).
//
//   GET   /api/admin/users                     listado con filtros y paginacion
//   GET   /api/admin/users/export.csv          export CSV (sin password/tokens)
//   GET   /api/admin/users/:id                 perfil + direcciones + resumen
//   GET   /api/admin/users/:id/orders          pedidos del cliente
//   PATCH /api/admin/users/:id                 perfil, consentimientos, disabled
//
// La edicion exige `users.write`; desactivar la cuenta es destructivo y
// ademas exige step-up reciente. Nunca se editan rol, admin ni password.

const express = require("express");
const {
  requireAuth,
  requireAdminSession,
  requirePermission,
} = require("../Middleware/auth.js");
const { requireStepUp } = require("../Middlewares/requireStepUp.js");
const {
  detail,
  exportCsv,
  list,
  orders,
  update,
} = require("../Controllers/adminUsers.js");

const router = express.Router();
router.use(requireAuth, requireAdminSession);

const canRead = requirePermission("users.read");
const canWrite = requirePermission("users.write");
// Desactivar una cuenta bloquea el acceso de esa persona: segundo factor,
// pero SOLO cuando el payload realmente cambia `disabled`.
const stepUpDisable = requireStepUp("users.disable", {
  when: (req) => req.body?.disabled !== undefined,
});

// Fijas antes de /:id.
router.get("/", canRead, list);
router.get("/export.csv", canRead, exportCsv);

router.get("/:id", canRead, detail);
router.get("/:id/orders", canRead, orders);
// El step-up solo se exige si el payload cambia `disabled` (el middleware
// mira req.body): editar datos de contacto no es destructivo.
router.patch("/:id", canWrite, stepUpDisable, update);

module.exports = router;
