const express = require("express");
const {
  requireAuth,
  requireAdminSession,
  requirePermission,
} = require("../../Middleware/auth.js");
const { list } = require("../../Controllers/suppliers/suppliers.controller.js");
const venndeloRoutes = require("./venndelo.routes.js");

const router = express.Router();

// Panel de proveedores de catalogo: sesion revocable + permiso de gestion.
router.use(
  requireAuth,
  requireAdminSession,
  requirePermission("providers.manage"),
);

router.get("/", list);
router.use("/venndelo", venndeloRoutes);

module.exports = router;