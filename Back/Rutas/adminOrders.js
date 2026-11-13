const express = require("express");
const {
  requireAuth,
  requireAdminSession,
  requirePermission,
} = require("../Middleware/auth.js");
const { requireStepUp } = require("../Middlewares/requireStepUp.js");
const { importLimiter } = require("../Middlewares/rateLimits.js");
const {
  FULFILLMENT_STATUS,
} = require("../DataBase/models/enums.js");
const {
  list,
  stats,
  detail,
  syncHistory,
  changeStatus,
  tracking,
  sales,
  accounting,
  providers,
  sync,
  push,
  createManual,
  previewManual,
  importCsv,
  payments,
  registerPaymentHandler,
  changePayment,
} = require("../Controllers/adminOrders.js");

const router = express.Router();

// Panel de administracion: sesion revocable + rol actual desde la base.
router.use(requireAuth, requireAdminSession);

const canReadOrders = requirePermission("orders.read");
const canWriteOrders = requirePermission("orders.write");
const canRefundOrders = requirePermission("orders.refund");

// Cancelar mueve el pedido y puede devolver stock: exige step-up. Cambiar a
// "packing"/"shipped" no lo exige (es operacion normal del panel).
const isCancellation = (req) => {
  const raw = String(
    req.body?.fulfillmentStatus || req.body?.status || "",
  ).toLowerCase();
  return (
    raw === FULFILLMENT_STATUS.CANCELLED || raw === "cancelado"
  );
};

// El registro de pagos puede crear un cobro manual (sin step-up); el cambio de
// un pago existente se reserva a `orders.refund` y exige segundo factor.
const stepUpRefund = requireStepUp("orders.refund");
const stepUpCancel = requireStepUp("orders.cancel", { when: isCancellation });

// Rutas fijas ANTES de /:id para que no las capture el parametro.
router.get("/stats", canReadOrders, stats);
router.get("/ventas", canReadOrders, sales);
router.get("/accounting", canReadOrders, accounting);
router.get("/providers", canReadOrders, providers);

// Registro manual de ventas externas.
router.post("/manual", canWriteOrders, createManual);

// Previsualizacion del total de una venta manual (no escribe nada).
router.post("/manual/preview", canWriteOrders, previewManual);

// Importacion de ventas desde CSV (ADM-3).
//
// El cuerpo llega como texto plano (text/csv), no como JSON: el limitador de
// tamano vive aqui (2 MB) y el parser solo acepta ese tipo de contenido.
const csvBody = express.text({
  type: ["text/csv", "application/csv", "text/plain"],
  limit: "2mb",
});

router.post("/import", canWriteOrders, importLimiter, csvBody, importCsv);

router.get("/", canReadOrders, list);
router.get("/:id", canReadOrders, detail);

// Cambio de estado (con push opcional al proveedor).
router.patch("/:id/status", canWriteOrders, stepUpCancel, changeStatus);
router.patch("/:id/tracking", canWriteOrders, tracking);

// Sincronizacion con el proveedor.
router.get("/:id/sync-history", canReadOrders, syncHistory);
router.post("/:id/sync", canWriteOrders, sync);
router.post("/:id/push", canWriteOrders, push);

// Pagos del pedido (confirmar, rechazar, reembolsar).
router.get("/:id/payments", canReadOrders, payments);
router.post("/:id/payments", canWriteOrders, registerPaymentHandler);
router.patch(
  "/:id/payments/:paymentId",
  canRefundOrders,
  stepUpRefund,
  changePayment,
);

module.exports = router;
