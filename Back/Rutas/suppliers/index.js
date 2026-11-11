const express = require("express");
const { requireAuth, requireAdmin } = require("../../Middleware/auth.js");
const { list } = require("../../Controllers/suppliers/suppliers.controller.js");
const venndeloRoutes = require("./venndelo.routes.js");

const router = express.Router();

// Panel de proveedores de catalogo: sesion + rol admin.
router.use(requireAuth, requireAdmin);

router.get("/", list);
router.use("/venndelo", venndeloRoutes);

module.exports = router;