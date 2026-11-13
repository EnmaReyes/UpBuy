const express = require("express");
const {
  requireAuth,
  requireAdminSession,
  requirePermission,
} = require("../Middleware/auth.js");
const { me, summary } = require("../Controllers/adminMe.js");

const router = express.Router();

// Todo el namespace del panel exige una sesion administrativa revocable.
router.use(requireAuth, requireAdminSession);

// Perfil del administrador: cualquier rol del panel puede leerlo.
router.get("/me", me);

// Resumen del tablero: usa datos de pedidos, por eso exige `orders.read`.
router.get(
  "/dashboard/summary",
  requirePermission("orders.read"),
  summary,
);

module.exports = router;
