// Sincronizacion con los proveedores de dropshipping.
//
// Dos direcciones:
//   IN  -> el cron lee el estado del proveedor y actualiza Upbuy.
//   OUT -> el administrador empuja un pedido/estado a Upbuy hacia el proveedor.
//
// Reglas:
//   - Upbuy es la fuente de verdad: un cambio manual del admin
//     (manualOverride) JAMAS se pisa por auto-sync.
//   - Nunca se revierte un cambio local porque el push falle: el pedido queda
//     con providerOutOfSync = true para que el panel lo muestre.
//   - Todo intento (ok o error) queda en sync_logs: no hay workers ni colas,
//     el cron reintenta lo que fallo en la siguiente corrida.

const { Op } = require("sequelize");
const {
  Order,
  OrderItem,
  SyncLog,
} = require("../DataBase/models/index.js");
const {
  FULFILLMENT_STATUS,
  STATUS_SOURCE,
  SYNC_DIRECTION,
} = require("../DataBase/models/enums.js");
const { getProvider } = require("./providers/index.js");
const {
  transitionFulfillment,
  transitionPaymentState,
} = require("./orderService.js");
const {
  canTransitionFulfillment,
  canTransitionPayment,
  FULFILLMENT_LABELS,
} = require("./statusMachine.js");
const HttpError = require("../Utils/HttpError.js");
const { assertUuid } = require("../Utils/ids.js");
const { createLogger } = require("../Utils/logger.js");

const log = createLogger("sync");

const logSync = async (payload) => {
  try {
    return await SyncLog.create(payload);
  } catch (error) {
    log.error("No se pudo registrar la sincronizacion", {
      error: error.message,
      provider: payload.provider,
      orderId: payload.orderId,
    });
    return null;
  }
};

const notifyStatusChange = async (order, to) => {
  if (!order.userId) return;
  try {
    const { createNotification } = require("./notifications.js");
    await createNotification({
      userId: order.userId,
      tipo: "pedido",
      titulo: `Pedido ${order.orderNumber}: ${FULFILLMENT_LABELS[to] || to}`,
      texto: "El estado de tu pedido cambió. Toca para ver el detalle.",
      to: `/dashboard/pedidos/${order.id}`,
      clave: `pedido:${order.id}:${to}`,
    });
  } catch (error) {
    log.warn("No se pudo notificar el cambio de estado", {
      error: error.message,
      orderId: order.id,
    });
  }
};

// Lee el estado del proveedor y lo aplica respetando la maquina de estados.
const syncOrder = async (order) => {
  if (!order.provider || !order.providerOrderId) {
    return { orderId: order.id, skipped: "sin_proveedor" };
  }
  if (order.manualOverride) {
    return { orderId: order.id, skipped: "manual_override" };
  }

  const client = getProvider(order.provider);
  if (!client.isConfigured()) {
    return { orderId: order.id, skipped: "proveedor_no_configurado" };
  }

  let result;
  try {
    result = await client.getOrderStatus(order.providerOrderId);
  } catch (error) {
    await logSync({
      orderId: order.id,
      provider: order.provider,
      direction: SYNC_DIRECTION.IN,
      attempt: 1,
      ok: false,
      request: { providerOrderId: order.providerOrderId },
      error: error.message,
    });
    return { orderId: order.id, ok: false, error: error.message };
  }

  const providerStatus = result.providerStatus;
  const canonical = result.canonical || {};

  const changes = [];

  // El estado crudo se guarda siempre, para diagnostico.
  if (providerStatus !== null && providerStatus !== order.providerStatus) {
    order.providerStatus = providerStatus;
    await order.save();
  }

  // Primero el pago (en COD, el cumplimiento puede depender de el).
  if (
    canonical.paymentState &&
    canonical.paymentState !== order.paymentState &&
    canTransitionPayment(order.paymentState, canonical.paymentState)
  ) {
    await transitionPaymentState({
      order,
      to: canonical.paymentState,
      actorUserId: null,
      source: STATUS_SOURCE.AUTO_SYNC,
      note: `Estado del proveedor: ${providerStatus}`,
      audit: true,
    });
    changes.push(`paymentState:${canonical.paymentState}`);
  }

  if (
    canonical.fulfillmentStatus &&
    canonical.fulfillmentStatus !== order.fulfillmentStatus &&
    canTransitionFulfillment(order.fulfillmentStatus, canonical.fulfillmentStatus)
  ) {
    await transitionFulfillment({
      order,
      to: canonical.fulfillmentStatus,
      actorUserId: null,
      source: STATUS_SOURCE.AUTO_SYNC,
      note: `Estado del proveedor: ${providerStatus}`,
    });
    changes.push(`fulfillmentStatus:${canonical.fulfillmentStatus}`);
    await notifyStatusChange(order, canonical.fulfillmentStatus);
  }

  await logSync({
    orderId: order.id,
    provider: order.provider,
    direction: SYNC_DIRECTION.IN,
    attempt: 1,
    ok: true,
    request: { providerOrderId: order.providerOrderId },
    response: {
      providerStatus,
      canonical,
      changes,
    },
  });

  if (order.providerOutOfSync) {
    order.providerOutOfSync = false;
    await order.save();
  }

  return {
    orderId: order.id,
    ok: true,
    providerStatus,
    changes,
    unchanged: changes.length === 0,
  };
};

// Sincroniza un pedido puntual (boton "sync" del panel).
const syncOrderById = async (orderId) => {
  assertUuid(orderId, "pedido");
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw new HttpError(404, "Pedido no encontrado");
  }
  return syncOrder(order);
};

// Sincroniza todos los pedidos con proveedor y sin override manual.
const syncIncomingStatuses = async ({ limit = 50 } = {}) => {
  const pendientes = await Order.findAll({
    where: {
      provider: { [Op.ne]: null },
      providerOrderId: { [Op.ne]: null },
      manualOverride: false,
      fulfillmentStatus: {
        [Op.notIn]: [
          FULFILLMENT_STATUS.DELIVERED,
          FULFILLMENT_STATUS.CANCELLED,
        ],
      },
    },
    order: [["updatedAt", "ASC"]],
    limit: Math.min(Math.max(Number(limit) || 50, 1), 200),
  });

  const resultados = [];
  for (const order of pendientes) {
    try {
      resultados.push(await syncOrder(order));
    } catch (error) {
      log.error("Fallo la sincronizacion del pedido", {
        orderId: order.id,
        error: error.message,
      });
      resultados.push({ orderId: order.id, ok: false, error: error.message });
    }
  }

  return {
    total: pendientes.length,
    synced: resultados.filter((r) => r.ok).length,
    skipped: resultados.filter((r) => r.skipped).length,
    failed: resultados.filter((r) => r.ok === false).length,
    results: resultados,
  };
};

// Envia el pedido al proveedor (una sola vez: si ya tiene providerOrderId se
// reutiliza). Dropi en modo manual solo registra la exportacion.
const pushOrderToProvider = async ({ orderId, actorUserId = null } = {}) => {
  assertUuid(orderId, "pedido");

  const order = await Order.findByPk(orderId, {
    include: [{ model: OrderItem, as: "items" }],
  });
  if (!order) {
    throw new HttpError(404, "Pedido no encontrado");
  }
  if (!order.provider) {
    throw new HttpError(400, "El pedido no tiene proveedor asignado");
  }
  if (order.providerOrderId) {
    return {
      orderId: order.id,
      alreadyPushed: true,
      providerOrderId: order.providerOrderId,
    };
  }

  const client = getProvider(order.provider);
  const items = (order.items || []).map((item) => ({
    sku: item.sku || item.productId,
    name: item.title,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }));

  let result;
  try {
    result = await client.createOrder({ order, items });
  } catch (error) {
    await logSync({
      orderId: order.id,
      provider: order.provider,
      direction: SYNC_DIRECTION.OUT,
      attempt: 1,
      ok: false,
      request: { action: "create_order", orderNumber: order.orderNumber },
      error: error.message,
    });
    order.providerOutOfSync = true;
    await order.save();
    throw error;
  }

  if (result.providerOrderId) {
    order.providerOrderId = result.providerOrderId;
    order.providerStatus = result.status ? String(result.status) : null;
    order.providerOutOfSync = false;
    await order.save();
  }

  await logSync({
    orderId: order.id,
    provider: order.provider,
    direction: SYNC_DIRECTION.OUT,
    attempt: 1,
    ok: true,
    request: { action: "create_order", orderNumber: order.orderNumber },
    response: {
      manual: Boolean(result.manual),
      providerOrderId: result.providerOrderId || null,
      status: result.status || null,
      rows: result.export?.rows?.length || 0,
    },
  });

  return {
    orderId: order.id,
    provider: order.provider,
    manual: Boolean(result.manual),
    providerOrderId: result.providerOrderId || null,
    export: result.export || null,
    pushedBy: actorUserId,
  };
};

// Empuja el estado actual del pedido al proveedor. Nunca revierte lo local.
const pushCurrentStatus = async ({ order, actorUserId = null } = {}) => {
  if (!order.provider || !order.providerOrderId) {
    return { pushed: false, reason: "sin_proveedor" };
  }

  const client = getProvider(order.provider);

  try {
    await client.updateOrderStatus(
      order.providerOrderId,
      order.fulfillmentStatus,
    );
    order.providerOutOfSync = false;
    order.statusSource = STATUS_SOURCE.MANUAL_ADMIN_PUSHED;
    await order.save();

    await logSync({
      orderId: order.id,
      provider: order.provider,
      direction: SYNC_DIRECTION.OUT,
      attempt: 1,
      ok: true,
      request: {
        action: "update_status",
        status: order.fulfillmentStatus,
      },
      response: { ok: true },
    });

    return { pushed: true, status: order.fulfillmentStatus, pushedBy: actorUserId };
  } catch (error) {
    order.providerOutOfSync = true;
    await order.save();

    await logSync({
      orderId: order.id,
      provider: order.provider,
      direction: SYNC_DIRECTION.OUT,
      attempt: 1,
      ok: false,
      request: {
        action: "update_status",
        status: order.fulfillmentStatus,
      },
      error: error.message,
    });

    return { pushed: false, reason: error.message, outOfSync: true };
  }
};

// Reintenta los envios fallidos registrados en sync_logs (los usa el cron).
const retryFailedOutbound = async ({ limit = 20 } = {}) => {
  const failed = await SyncLog.findAll({
    where: {
      direction: SYNC_DIRECTION.OUT,
      ok: false,
      orderId: { [Op.ne]: null },
    },
    order: [["createdAt", "DESC"]],
    limit: Math.min(Math.max(Number(limit) || 20, 1), 100),
  });

  const results = [];
  const seen = new Set();

  for (const entry of failed) {
    if (seen.has(entry.orderId)) continue;
    seen.add(entry.orderId);

    const order = await Order.findByPk(entry.orderId);
    if (!order) continue;

    try {
      if (!order.providerOrderId && entry.request?.action === "create_order") {
        results.push(
          await pushOrderToProvider({ orderId: order.id }).catch((error) => ({
            orderId: order.id,
            ok: false,
            error: error.message,
          })),
        );
      } else if (entry.request?.action === "update_status") {
        results.push({
          orderId: order.id,
          ...(await pushCurrentStatus({ order })),
        });
      }
    } catch (error) {
      results.push({ orderId: order.id, ok: false, error: error.message });
    }
  }

  return { attempted: results.length, results };
};

module.exports = {
  syncOrder,
  syncOrderById,
  syncIncomingStatuses,
  pushOrderToProvider,
  pushCurrentStatus,
  retryFailedOutbound,
};
