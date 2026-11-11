const express = require("express");
const { requireAuth, requireAdmin } = require("../../Middleware/auth.js");
const {
  status,
  testConnection,
  listProducts,
  getProduct,
  sync,
  syncHistory,
  publish,
  unpublish,
} = require("../../Controllers/suppliers/venndelo.controller.js");

const router = express.Router();

// Toda la seccion exige sesion + rol admin (revalidado contra la base).
router.use(requireAuth, requireAdmin);

// Rutas fijas antes de las que llevan parametro.
router.get("/status", status);
router.post("/test-connection", testConnection);
router.get("/sync-history", syncHistory);

router.get("/products", listProducts);
router.get("/products/:id", getProduct);
router.post("/products/:id/publish", publish);
router.post("/products/:id/unpublish", unpublish);

router.post("/sync", sync);

module.exports = router;