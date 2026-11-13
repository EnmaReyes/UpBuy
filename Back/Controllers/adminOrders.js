const {
  listOrdersAdmin,
  getOrderAdminDetail,
  listOrderSyncHistory,
  changeOrderStatus,
  updateTracking,
  orderStats,
  salesByPeriod,
} = require("../Services/adminOrders.js");
const {
  createManualOrder,
  previewManualOrder,
} = require("../Services/orders.js");
const {
  analyzeCsv,
  importCsv,
  assertSize,
} = require("../Services/orderImport.js");
const { getAccounting } = require("../Services/accounting.js");
const {
  syncOrderById,
  pushOrderToProvider,
} = require("../Services/syncService.js");
const { listProviders } = require("../Services/providers/index.js");
const {
  listOrderPayments,
  registerPayment,
  changePaymentStatus,
} = require("../Services/payments.js");
const { sendError } = require("../Utils/respond.js");

// GET /api/admin/orders?status&paymentStatus&channel&paymentMethod&q&from&to&limit&offset
//
// `status` y `paymentStatus` son los nombres historicos; el canonico es
// fulfillmentStatus / paymentState. Se aceptan los dos.
const list = async (req, res) => {
  try {
    const {
      status,
      fulfillmentStatus,
      paymentStatus,
      paymentState,
      channel,
      paymentMethod,
      paymentMethodCode,
      provider,
      q,
      from,
      to,
      limit,
      offset,
    } = req.query;
    const result = await listOrdersAdmin({
      status: fulfillmentStatus || status,
      paymentStatus: paymentState || paymentStatus,
      channel,
      paymentMethod,
      paymentMethodCode,
      provider,
      q,
      from,
      to,
      limit,
      offset,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudieron cargar los pedidos");
  }
};

// POST /api/admin/orders/manual — registrar una venta externa a mano.
// Body: { items, shipping, notes?, channel?, paymentMethod?, paymentStatus?,
//         deliveryType?, discount? }
const createManual = async (req, res) => {
  try {
    const {
      items,
      shipping,
      notes,
      channel,
      paymentMethod,
      paymentStatus,
      deliveryType,
      discount,
    } = req.body || {};

    const order = await createManualOrder({
      adminId: req.user.id,
      items,
      shipping,
      notes,
      channel,
      paymentMethod,
      paymentStatus,
      deliveryType,
      manualDiscount: discount,
    });

    return res.status(201).json(order);
  } catch (error) {
    return sendError(res, error, "No se pudo registrar la venta");
  }
};

// POST /api/admin/orders/manual/preview
//
// Calcula el total de una venta manual SIN escribir nada. Es lo que el panel
// muestra mientras el administrador arma el pedido: el precio sale del
// catalogo, nunca del navegador.
const previewManual = async (req, res) => {
  try {
    const { items, discount, deliveryType } = req.body || {};

    const preview = await previewManualOrder({
      items,
      manualDiscount: discount ?? 0,
      deliveryType,
    });

    return res.status(200).json(preview);
  } catch (error) {
    return sendError(res, error, "No se pudo calcular el total");
  }
};

// POST /api/admin/orders/import
//
// Importa ventas desde un CSV (text/csv). Con ?dryRun=1 solo analiza el
// archivo: devuelve los errores por fila SIN escribir nada.
//
// Body: el CSV crudo (Content-Type: text/csv).
const importCsvHandler = async (req, res) => {
  try {
    const text = typeof req.body === "string" ? req.body : "";
    assertSize(text);

    const dryRun = String(req.query.dryRun || "") === "1";

    if (dryRun) {
      const analysis = await analyzeCsv(text);
      return res.status(200).json({
        dryRun: true,
        summary: analysis.summary,
        errors: analysis.errors,
        warnings: analysis.warnings,
      });
    }

    const result = await importCsv({ text, adminId: req.user.id });
    return res.status(201).json({ dryRun: false, ...result });
  } catch (error) {
    return sendError(res, error, "No se pudo importar el archivo");
  }
};

// GET /api/admin/orders/stats
const stats = async (req, res) => {
  try {
    const result = await orderStats();
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudo cargar el resumen");
  }
};

// GET /api/admin/orders/:id
const detail = async (req, res) => {
  try {
    const order = await getOrderAdminDetail(req.params.id);
    return res.status(200).json(order);
  } catch (error) {
    return sendError(res, error, "No se pudo cargar el pedido");
  }
};

// GET /api/admin/orders/:id/sync-history
const syncHistory = async (req, res) => {
  try {
    const logs = await listOrderSyncHistory(req.params.id);
    return res.status(200).json({ logs });
  } catch (error) {
    return sendError(res, error, "No se pudo cargar el historial de sincronización");
  }
};

// PATCH /api/admin/orders/:id/status
// Body: { status | fulfillmentStatus, note?, trackingNumber?, trackingUrl? }
const changeStatus = async (req, res) => {
  try {
    const {
      status,
      fulfillmentStatus,
      note,
      trackingNumber,
      trackingUrl,
      pushToProvider,
      push_to_provider,
    } = req.body || {};
    const order = await changeOrderStatus({
      orderId: req.params.id,
      status: fulfillmentStatus || status,
      note,
      adminId: req.user.id,
      trackingNumber,
      trackingUrl,
      pushToProvider: Boolean(pushToProvider ?? push_to_provider),
      ip: req.ip,
      requestId: req.get("X-Request-Id") || null,
    });
    return res.status(200).json(order);
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar el estado");
  }
};

// PATCH /api/admin/orders/:id/tracking  { trackingCarrier?, trackingNumber? }
const tracking = async (req, res) => {
  try {
    const { trackingCarrier, trackingNumber } = req.body || {};
    const order = await updateTracking({
      orderId: req.params.id,
      trackingCarrier,
      trackingNumber,
    });
    return res.status(200).json(order);
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar el envío");
  }
};

// GET /api/admin/orders/ventas?periodo=dia|semana|mes|anio
const sales = async (req, res) => {
  try {
    const { periodo } = req.query;
    const result = await salesByPeriod({ periodo });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudieron cargar las ventas");
  }
};

// GET /api/admin/orders/accounting?from&to&provider
// Contabilidad: bruto, comisiones, costo proveedor, margen y desglose COD.
const accounting = async (req, res) => {
  try {
    const { from, to, provider } = req.query;
    const result = await getAccounting({ from, to, provider });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudo cargar la contabilidad");
  }
};

// GET /api/admin/orders/providers — estado de cada proveedor.
const providers = async (req, res) => {
  try {
    return res.status(200).json({ providers: listProviders() });
  } catch (error) {
    return sendError(res, error, "No se pudieron cargar los proveedores");
  }
};

// POST /api/admin/orders/:id/sync — forzar la lectura del estado del proveedor.
const sync = async (req, res) => {
  try {
    const result = await syncOrderById(req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudo sincronizar el pedido");
  }
};

// POST /api/admin/orders/:id/push — enviar el pedido al proveedor.
const push = async (req, res) => {
  try {
    const result = await pushOrderToProvider({
      orderId: req.params.id,
      actorUserId: req.user.id,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudo enviar el pedido al proveedor");
  }
};

// GET /api/admin/orders/:id/payments — intentos de pago del pedido.
const payments = async (req, res) => {
  try {
    const result = await listOrderPayments(req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudieron cargar los pagos");
  }
};

// POST /api/admin/orders/:id/payments
// Body: { status?, paymentMethodType?, statusMessage?, failureCode?, note? }
// Registra o actualiza el pago manual del pedido (transferencia/Nequi/efectivo).
const registerPaymentHandler = async (req, res) => {
  try {
    const { status, paymentMethodType, statusMessage, failureCode, note } =
      req.body || {};

    const { order } = await registerPayment({
      orderId: req.params.id,
      status: status || "aprobado",
      paymentMethodType,
      statusMessage,
      failureCode,
      actorUserId: req.user.id,
      note,
    });

    // Se devuelve el pedido completo para que el panel se actualice de una.
    return res.status(201).json(await getOrderAdminDetail(order.id));
  } catch (error) {
    return sendError(res, error, "No se pudo registrar el pago");
  }
};

// PATCH /api/admin/orders/:id/payments/:paymentId
// Body: { status, statusMessage?, failureCode?, note? }
// Cambia el estado de un pago ya registrado (reembolso, anulacion).
const changePayment = async (req, res) => {
  try {
    const { status, paymentMethodType, statusMessage, failureCode, note } =
      req.body || {};

    const { order } = await changePaymentStatus({
      orderId: req.params.id,
      paymentId: req.params.paymentId,
      status,
      paymentMethodType,
      statusMessage,
      failureCode,
      actorUserId: req.user.id,
      note,
    });

    return res.status(200).json(await getOrderAdminDetail(order.id));
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar el pago");
  }
};

module.exports = {
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
  importCsv: importCsvHandler,
  payments,
  registerPaymentHandler,
  changePayment,
};
