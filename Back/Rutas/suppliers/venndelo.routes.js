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
const accountController = require("../../Controllers/suppliers/venndelo.account.controller.js");

const router = express.Router();

// Toda la seccion exige sesion + rol admin (revalidado contra la base).
router.use(requireAuth, requireAdmin);

// Rutas fijas antes de las que llevan parametro.
router.get("/status", status);
router.post("/test-connection", testConnection);
router.get("/sync-history", syncHistory);

// Wallet del proveedor y pedidos en Venndelo (operacion administrativa).
router.get("/wallet/balance", accountController.balance);
router.post("/wallet/topup", accountController.topup);
// Las rutas fijas van antes de las que llevan parametro.
router.post("/orders/quotation", accountController.quoteOrder);
router.get("/orders", accountController.listOrders);
router.post("/orders", accountController.createOrder);
router.get("/orders/:id", accountController.getOrder);
router.post("/orders/:id/cancel", accountController.cancelOrder);
router.post("/orders/:id/confirmation", accountController.modifyConfirmation);

router.get("/products", listProducts);
router.get("/products/:id", getProduct);
router.post("/products/:id/publish", publish);
router.post("/products/:id/unpublish", unpublish);

router.post("/sync", sync);

module.exports = router;