const express = require("express");
const { requireAuth, requireAdmin } = require("../Middleware/auth.js");
const {
  list,
  stats,
  detail,
  changeStatus,
  tracking,
  sales,
  createManual,
  payments,
  registerPaymentHandler,
  changePayment,
} = require("../Controllers/adminOrders.js");

const router = express.Router();

// Panel de administracion: toda la seccion exige sesion + rol admin.
router.use(requireAuth, requireAdmin);

// /stats va antes de /:id para que no lo capture el parametro.
router.get("/stats", stats);
router.get("/ventas", sales);

// Registro manual de ventas externas.
router.post("/manual", createManual);

router.get("/", list);
router.get("/:id", detail);
router.patch("/:id/status", changeStatus);
router.patch("/:id/tracking", tracking);

// Pagos del pedido (confirmar, rechazar, reembolsar).
router.get("/:id/payments", payments);
router.post("/:id/payments", registerPaymentHandler);
router.patch("/:id/payments/:paymentId", changePayment);

module.exports = router;
