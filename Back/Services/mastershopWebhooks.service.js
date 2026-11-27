// Webhooks de estado/tracking de MasterShop (eventos 16/17/18) y
// reconciliacion periodica del estado de los pedidos.
//
// MasterShop NO firma sus webhooks. Por eso el cuerpo NUNCA se usa como fuente
// de verdad: solo identifica el pedido y, acto seguido, se reconsulta
// `GET /api/orders`. El estado y la guia que se guardan salen de esa reconsulta.
//
// Reglas (iguales que el resto de la sincronizacion):
//   - UpBuy es la fuente de verdad: un cambio manual (`manualOverride`) JAMAS se
//     pisa.
//   - Solo se aplican transiciones validas de la maquina de estados.
//   - "Enviado" exige guia: si MasterShop aun no la mando, se guarda el estado
//     crudo pero no se mueve el pedido.
//   - Un fallo de red no rompe la respuesta al proveedor: el cron reintenta.
const { Op } = require("sequelize");
const {
  sequelize,
  Order,
} = require("../DataBase/models/index.js");
const {
  FULFILLMENT_STATUS,
  SUPPLIER_SLUG,
  STATUS_SOURCE,
} = require("../DataBase/models/enums.js");
const {
  transitionFulfillment,
  transitionPaymentState,
} = require("./orderService.js");
const {
  canTransitionFulfillment,
  canTransitionPayment,
  mapProviderToCanonical,
} = require("./statusMachine.js");
const {
  getOrder,
} = require("../integrations/suppliers/mastershop/mastershop.orders.js");
const {
  parseWebhookBody,
  extractRemoteStatus,
  extractTracking,
} = require("../integrations/suppliers/mastershop/mastershop.webhooks.js");
const { beginWebhookEvent, finishWebhookEvent } = require("./webhookEvents.js");
const HttpError = require("../Utils/HttpError.js");
const { assertUuid } = require("../Utils/ids.js");
const { createLogger } = require("../Utils/logger.js");

const log = createLogger("mastershop.webhooks.service");

const PROVIDER = SUPPLIER_SLUG.MASTERSHOP;

// Busca el pedido local a partir de los identificadores del webhook. El
// `idOrder` puede venir como interno o como externo; se prueban ambos.
const findLocalOrder = async ({ idOrder, externalOrderId } = {}) => {
  const candidates = [idOrder, externalOrderId].filter(
    (value) => value !== null && value !== undefined && value !== "",
  );
  if (candidates.length === 0) return null;

  const or = [];
  for (const value of candidates) {
    const text = String(value);
    or.push({ msExternalOrderId: text }, { orderNumber: text });
    const numeric = Number(text);
    if (Number.isInteger(numeric) && numeric > 0) {
      or.push({ msIdOrder: numeric });
    }
  }

  return Order.findOne({ where: { [Op.or]: or } });
};

// Cadena logistica canonica. Sirve para "ponerse al dia" cuando el proveedor
// salta estados (por ejemplo, el primer aviso que llega es "Despachado" y el
// pedido local sigue en "paid"): se aplican los pasos intermedios en orden en
// vez de descartar el avance.
const FULFILLMENT_CHAIN = [
  FULFILLMENT_STATUS.PENDING_PAYMENT,
  FULFILLMENT_STATUS.PAID,
  FULFILLMENT_STATUS.PACKING,
  FULFILLMENT_STATUS.SHIPPED,
  FULFILLMENT_STATUS.DELIVERED,
];

const advanceFulfillment = async ({ order, target, transaction, note }) => {
  const changes = [];
  if (!target || target === order.fulfillmentStatus) return changes;

  // Camino directo (incluye cancelaciones).
  if (canTransitionFulfillment(order.fulfillmentStatus, target)) {
    if (
      target === FULFILLMENT_STATUS.SHIPPED &&
      !order.trackingNumber &&
      !order.trackingUrl
    ) {
      changes.push("shipped_sin_guia");
      return changes;
    }
    await transitionFulfillment({
      order,
      to: target,
      transaction,
      actorUserId: null,
      source: STATUS_SOURCE.AUTO_SYNC,
      note,
    });
    changes.push(`fulfillmentStatus:${target}`);
    return changes;
  }

  // Avance por la cadena, paso a paso.
  const fromIndex = FULFILLMENT_CHAIN.indexOf(order.fulfillmentStatus);
  const toIndex = FULFILLMENT_CHAIN.indexOf(target);
  if (fromIndex === -1 || toIndex === -1 || toIndex <= fromIndex) {
    return changes;
  }

  for (let index = fromIndex + 1; index <= toIndex; index += 1) {
    const next = FULFILLMENT_CHAIN[index];
    if (
      next === FULFILLMENT_STATUS.SHIPPED &&
      !order.trackingNumber &&
      !order.trackingUrl
    ) {
      changes.push("shipped_sin_guia");
      break;
    }
    if (!canTransitionFulfillment(order.fulfillmentStatus, next)) break;
    await transitionFulfillment({
      order,
      to: next,
      transaction,
      actorUserId: null,
      source: STATUS_SOURCE.AUTO_SYNC,
      note,
    });
    changes.push(`fulfillmentStatus:${next}`);
  }

  return changes;
};

// Aplica una "foto" de MasterShop al pedido local. Devuelve los cambios.
//
// `remoteOrder` puede venir ya consultado (tests o cron que ya lo tiene); si no,
// se reconsulta aqui. La escritura va dentro de una transaccion con el pedido
// bloqueado para no pisar un cambio manual concurrente.
const refreshMastershopOrderStatus = async ({ orderId, remoteOrder = null } = {}) => {
  assertUuid(orderId, "pedido");

  const current = await Order.findByPk(orderId);
  if (!current) {
    throw new HttpError(404, "Pedido no encontrado");
  }
  if (!current.msIdOrder) {
    return { ok: false, skipped: "sin_pedido_en_mastershop", orderId };
  }

  let remote = remoteOrder;
  if (!remote) {
    try {
      remote = await getOrder({ idOrder: current.msIdOrder });
    } catch (error) {
      log.warn("No se pudo consultar el pedido en MasterShop", {
        orderId,
        msIdOrder: current.msIdOrder,
        error: error.message,
      });
      return { ok: false, orderId, error: error.message, retryable: true };
    }
  }

  if (!remote) {
    return { ok: false, skipped: "pedido_remoto_inexistente", orderId };
  }

  const status = extractRemoteStatus(remote);
  const tracking = extractTracking(remote);

  const changes = [];
  let skipped = null;

  await sequelize.transaction(async (transaction) => {
    const order = await Order.findByPk(orderId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!order) {
      skipped = "pedido_eliminado";
      return;
    }
    if (order.manualOverride) {
      skipped = "manual_override";
      return;
    }

    let dirty = false;

    // La guia va ANTES del estado: marcar "enviado" exige guia.
    if (tracking.trackingNumber && tracking.trackingNumber !== order.trackingNumber) {
      order.trackingNumber = tracking.trackingNumber;
      dirty = true;
      changes.push("trackingNumber");
    }
    if (tracking.trackingUrl && tracking.trackingUrl !== order.trackingUrl) {
      order.trackingUrl = tracking.trackingUrl;
      dirty = true;
      changes.push("trackingUrl");
    }
    if (
      tracking.trackingCarrier &&
      tracking.trackingCarrier !== order.trackingCarrier
    ) {
      order.trackingCarrier = tracking.trackingCarrier;
      dirty = true;
      changes.push("trackingCarrier");
    }

    // El estado crudo se guarda siempre para diagnostico/panel.
    if (status && status !== order.msStatus) {
      order.msStatus = status;
      dirty = true;
      changes.push("msStatus");
    }

    if (dirty) await order.save({ transaction });

    const canonical = mapProviderToCanonical(PROVIDER, status);

    if (
      canonical.paymentState &&
      canonical.paymentState !== order.paymentState &&
      canTransitionPayment(order.paymentState, canonical.paymentState)
    ) {
      await transitionPaymentState({
        order,
        to: canonical.paymentState,
        transaction,
        actorUserId: null,
        source: STATUS_SOURCE.AUTO_SYNC,
        note: `MasterShop: ${status || "sin estado"}`,
      });
      changes.push(`paymentState:${canonical.paymentState}`);
    }

    const target = canonical.fulfillmentStatus;
    if (target && target !== order.fulfillmentStatus) {
      const advanced = await advanceFulfillment({
        order,
        target,
        transaction,
        note: `MasterShop: ${status || "sin estado"}`,
      });
      changes.push(...advanced);
    }
  });

  if (skipped) {
    return { ok: false, skipped, orderId };
  }

  return { ok: true, orderId, msStatus: status, changes, unchanged: changes.length === 0 };
};

// POST /api/webhooks/mastershop
//
// Responde 200 salvo error de programacion: un webhook publico no debe
// devolver 5xx por un fallo de red nuestro (el proveedor reintentaria en vano);
// el cron reconcilia despues.
const handleMastershopWebhook = async ({ body } = {}) => {
  const parsed = parseWebhookBody(body);

  if (!parsed.idOrder && !parsed.externalOrderId) {
    log.warn("Webhook de MasterShop sin pedido identificable", {
      event: parsed.event,
    });
    return { received: true, applied: false, reason: "sin_pedido" };
  }

  const { duplicate, record } = await beginWebhookEvent({
    provider: PROVIDER,
    eventId: parsed.eventId,
    event: parsed.event,
    payload: body,
  });

  if (duplicate) {
    return { received: true, applied: false, reason: "ya_procesado" };
  }

  try {
    const order = await findLocalOrder(parsed);
    if (!order) {
      await finishWebhookEvent(record, { ok: true });
      log.info("Webhook de MasterShop para un pedido local inexistente", {
        event: parsed.event,
        idOrder: parsed.idOrder,
        externalOrderId: parsed.externalOrderId,
      });
      return { received: true, applied: false, reason: "pedido_no_encontrado" };
    }

    const result = await refreshMastershopOrderStatus({ orderId: order.id });

    if (result.ok === false && result.error) {
      await finishWebhookEvent(record, { ok: false, error: result.error });
      return {
        received: true,
        applied: false,
        reason: "reconsulta_fallida",
        orderId: order.id,
      };
    }

    await finishWebhookEvent(record, { ok: true });
    log.info("Webhook de MasterShop aplicado", {
      event: parsed.event,
      orderId: order.id,
      changes: result.changes || [],
    });

    return {
      received: true,
      applied: Boolean(result.ok && (result.changes || []).length > 0),
      reason: result.skipped || null,
      orderId: order.id,
      changes: result.changes || [],
    };
  } catch (error) {
    await finishWebhookEvent(record, { ok: false, error: error.message });
    log.error("No se pudo procesar el webhook de MasterShop", {
      event: parsed.event,
      error: error.message,
    });
    return { received: true, applied: false, reason: "error_interno" };
  }
};

// Reconcilia el estado de los pedidos abiertos contra MasterShop. Es la red de
// seguridad cuando un webhook se pierde (o la cuenta aun no los tiene
// registrados). Se ejecuta desde el cron.
const syncMastershopOrderStatuses = async ({ limit = 20 } = {}) => {
  const rows = await Order.findAll({
    where: {
      msIdOrder: { [Op.ne]: null },
      manualOverride: false,
      fulfillmentStatus: {
        [Op.notIn]: [
          FULFILLMENT_STATUS.DELIVERED,
          FULFILLMENT_STATUS.CANCELLED,
        ],
      },
    },
    order: [["updatedAt", "ASC"]],
    limit: Math.min(Math.max(Number(limit) || 20, 1), 100),
  });

  const results = [];
  for (const order of rows) {
    try {
      const result = await refreshMastershopOrderStatus({ orderId: order.id });
      results.push({ orderId: order.id, ...result });
    } catch (error) {
      log.error("Fallo la reconciliacion del estado de un pedido MasterShop", {
        orderId: order.id,
        error: error.message,
      });
      results.push({ orderId: order.id, ok: false, error: error.message });
    }
  }

  return {
    total: rows.length,
    updated: results.filter((row) => row.ok && (row.changes || []).length > 0)
      .length,
    skipped: results.filter((row) => row.skipped).length,
    failed: results.filter((row) => row.ok === false && !row.skipped).length,
    results,
  };
};

module.exports = {
  PROVIDER,
  findLocalOrder,
  refreshMastershopOrderStatus,
  handleMastershopWebhook,
  syncMastershopOrderStatuses,
};