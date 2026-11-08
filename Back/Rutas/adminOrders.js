const express = require("express");
const { requireAuth, requireAdmin } = require("../Middleware/auth.js");
const {
  list,
  stats,
  detail,
  changeStatus,
  tracking,
  sales,
  accounting,
  providers,
  sync,
  push,
  createManual,
  payments,
  registerPaymentHandler,
  changePayment,
} = require("../Controllers/adminOrders.js");

const router = express.Router();

// Panel de administracion: toda la seccion exige sesion + rol admin.
router.use(requireAuth, requireAdmin);

// Rutas fijas ANTES de /:id para que no las capture el parametro.
router.get("/stats", stats);
router.get("/ventas", sales);
router.get("/accounting", accounting);
router.get("/providers", providers);

// Registro manual de ventas externas.
router.post("/manual", createManual);

router.get("/", list);
router.get("/:id", detail);

// Cambio de estado (con push opcional al proveedor).
router.patch("/:id/status", changeStatus);
router.patch("/:id/tracking", tracking);

// Sincronizacion con el proveedor.
router.post("/:id/sync", sync);
router.post("/:id/push", push);

// Pagos del pedido (confirmar, rechazar, reembolsar).
router.get("/:id/payments", payments);
router.post("/:id/payments", registerPaymentHandler);
router.patch("/:id/payments/:paymentId", changePayment);

module.exports = router;
