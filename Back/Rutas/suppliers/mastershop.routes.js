const express = require("express");
const {
  requireAuth,
  requireAdminSession,
  requirePermission,
} = require("../../Middleware/auth.js");
const {
  status,
  testConnection,
  listProducts,
  getProduct,
  sync,
  syncHistory,
  publish,
  publishBulk,
  unpublish,
  updateSettings,
} = require("../../Controllers/suppliers/mastershop.controller.js");
const { requireStepUp } = require("../../Middlewares/requireStepUp.js");

const router = express.Router();

// Toda la seccion exige sesion revocable + permiso de gestion de proveedores.
router.use(
  requireAuth,
  requireAdminSession,
  requirePermission("providers.manage"),
);

// Rutas fijas antes de las que llevan parametro.
router.get("/status", status);
router.post("/test-connection", testConnection);
router.get("/sync-history", syncHistory);

router.get("/products", listProducts);
// Ruta fija antes de /products/:id.
router.post("/products/publish-bulk", publishBulk);
router.get("/products/:id", getProduct);
router.post("/products/:id/publish", publish);
router.post(
  "/products/:id/unpublish",
  requireStepUp("catalog.unpublish"),
  unpublish,
);

router.patch("/settings", updateSettings);
router.post("/sync", sync);

// MasterShop solo se integra como catalogo: pedidos, billetera y webhooks no
// estan implementados, asi que no se montan esas rutas.

module.exports = router;
