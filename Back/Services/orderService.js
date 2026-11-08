// Servicio de pedidos: contabilidad, snapshots y transiciones canonicas.
//
// Este modulo es el UNICO lugar donde se decide un cambio de estado de un
// pedido. El panel de administracion, el cron de sincronizacion y los
// webhooks pasan por aqui, asi que las reglas se aplican siempre igual.
//
//   - Services/orders.js        -> alta y baja de pedidos
//   - Services/adminOrders.js   -> cambios manuales del administrador
//   - Services/syncService.js   -> cambios automaticos del proveedor
//   - Services/payments.js      -> ciclo del dinero
//
// Dos ciclos independientes (ver docs/ESTADOS.md):
//   fulfillmentStatus -> donde va el pedido fisicamente.
//   paymentState      -> donde va el dinero.

const {
  OrderStatusHistory,
  AuditLog,
} = require("../DataBase/models/index.js");
const {
  HISTORY_KIND,
  FULFILLMENT_STATUS,
  PAYMENT_STATE,
  STATUS_SOURCE,
} = require("../DataBase/models/enums.js");
const {
  assertFulfillmentTransition,
  assertPaymentTransition,
  applyFulfillmentSideEffects,
  isCodOrder,
} = require("./statusMachine.js");
const HttpError = require("../Utils/HttpError.js");
const { createLogger } = require("../Utils/logger.js");

const log = createLogger("orders.service");

// ---------------------------------------------------------------------------
// Contabilidad
// ---------------------------------------------------------------------------

// Utilidad del pedido.
//
//   netProfit = lo que entra - lo que sale
//
// "Lo que entra" es lo que el cliente pago (total). El subtotal ya trae los
// descuentos por item aplicados, y el descuento manual se resta aparte, asi
// que total == subtotal - descuentoManual + envio.
//
// "Lo que sale" son los tres costos que el negocio asume:
//   providerCost -> lo que cobra el courier por el producto
//   gatewayFee   -> comision de la pasarela de pago
//   providerFee  -> comision adicional del proveedor
//
// Utilidad ganada (pedido entregado) y efectivo recibido (COD liquidado) son
// cosas distintas: el panel las separa.
const calculateNetProfit = ({
  subtotal = 0,
  shippingCost = 0,
  discountTotal = 0,
  total = null,
  providerCost = 0,
  gatewayFee = 0,
  providerFee = 0,
}) => {
  const revenue =
    total !== null && total !== undefined
      ? Number(total)
      : Number(subtotal) + Number(shippingCost) - Number(discountTotal);

  const costos =
    Number(providerCost) + Number(gatewayFee) + Number(providerFee);

  return Math.round(revenue - costos);
};

// Calcula y escribe la utilidad en el pedido. Se llama cada vez que cambia
// un monto del pedido.
const applyAccountingTotals = (order, { transaction } = {}) => {
  order.netProfit = calculateNetProfit({
    subtotal: order.subtotal,
    shippingCost: order.shippingCost,
    discountTotal: order.discountTotal,
    total: order.total,
    providerCost: order.providerCost,
    gatewayFee: order.gatewayFee,
    providerFee: order.providerFee,
  });

  return order.netProfit;
};

// ---------------------------------------------------------------------------
// Snapshot de direccion
// ---------------------------------------------------------------------------

// Congela la direccion del pedido. A partir de aqui el pedido no depende de
// que el usuario cambie (o borre) su direccion en el perfil: el courier ve
// exactamente lo que se compro.
const buildAddressSnapshot = ({
  recipientName = null,
  phone = null,
  email = null,
  address = null,
  city = null,
  department = null,
  postalCode = null,
  reference = null,
  notes = null,
} = {}) => ({
  recipientName,
  phone,
  email,
  address,
  city,
  department,
  postalCode,
  reference,
  notes,
  capturedAt: new Date().toISOString(),
});

// Rellena los campos planos del pedido a partir del snapshot (para cuando el
// pedido se crea con la direccion ya congelada).
const applyAddressSnapshot = (order, snapshot = {}) => {
  if (!snapshot || typeof snapshot !== "object") return order;

  order.recipientName = snapshot.recipientName ?? order.recipientName;
  order.phone = snapshot.phone ?? order.phone;
  order.email = snapshot.email ?? order.email;
  order.address = snapshot.address ?? order.address;
  order.city = snapshot.city ?? order.city;
  order.department = snapshot.department ?? order.department;
  order.postalCode = snapshot.postalCode ?? order.postalCode;
  order.addressSnapshot = { ...snapshot };

  return order;
};

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------

const registrarHistorial = async ({
  orderId,
  kind,
  fromStatus,
  toStatus,
  actorUserId = null,
  note = null,
  transaction,
}) =>
  OrderStatusHistory.create(
    {
      orderId,
      kind,
      fromStatus: fromStatus ?? null,
      toStatus,
      changedByUserId: actorUserId,
      note,
    },
    { transaction },
  );

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------

// Deja rastro de un cambio: quien, que, antes, despues, desde donde.
const registrarAuditoria = async ({
  userId = null,
  entity = "order",
  entityId = null,
  action,
  before = null,
  after = null,
  ip = null,
  requestId = null,
  note = null,
  transaction,
}) => {
  try {
    return await AuditLog.create(
      {
        userId,
        entity,
        entityId,
        action,
        before,
        after,
        ip,
        requestId,
        note,
      },
      { transaction },
    );
  } catch (error) {
    // La auditoria NUNCA debe tumbar la operacion principal: perder el
    // rastro es malo, pero perder el cambio de estado del pedido es peor.
    log.error("No se pudo escribir la auditoria", {
      entity,
      entityId,
      action,
      error: error.message,
    });
    return null;
  }
};

// ---------------------------------------------------------------------------
// Transiciones
// ---------------------------------------------------------------------------

// Cambia el estado de CUMPLIMIENTO del pedido.
//
// Aplica las reglas:
//   - valida la transicion (422 si no es valida),
//   - "shipped" exige guia (422 si no la hay),
//   - en COD, "shipped" promueve el pago a pending_collection y
//     "delivered" a collected,
//   - deja historial y (opcionalmente) auditoria.
//
// Devuelve { order, before, after, cambios }.
const transitionFulfillment = async ({
  order,
  to,
  transaction,
  actorUserId = null,
  source = STATUS_SOURCE.MANUAL_ADMIN,
  note = null,
  ip = null,
  requestId = null,
  trackingNumber = undefined,
  trackingUrl = undefined,
  audit = true,
}) => {
  assertFulfillmentTransition(order.fulfillmentStatus, to);

  // La guia puede venir en el mismo cambio de estado (típico: el admin
  // marca "enviado" y pega la guía de una vez).
  if (trackingNumber !== undefined) order.trackingNumber = trackingNumber;
  if (trackingUrl !== undefined) order.trackingUrl = trackingUrl;

  const efectos = applyFulfillmentSideEffects(order, to);

  const before = {
    fulfillmentStatus: order.fulfillmentStatus,
    paymentState: order.paymentState,
  };

  order.fulfillmentStatus = efectos.fulfillmentStatus;

  // El pago SOLO se toca si el efecto lateral lo pide (COD).
  if (efectos.paymentState !== order.paymentState) {
    assertPaymentTransition(order.paymentState, efectos.paymentState);
    order.paymentState = efectos.paymentState;
  }

  order.statusSource = source;

  // Un cambio manual del administrador bloquea el auto-sync: el cron no
  // puede pisar una decision humana.
  if (
    source === STATUS_SOURCE.MANUAL_ADMIN ||
    source === STATUS_SOURCE.MANUAL_ADMIN_PUSHED
  ) {
    order.manualOverride = true;
  }

  // Marcas de tiempo.
  const ahora = new Date();
  if (to === FULFILLMENT_STATUS.SHIPPED && !order.shippedAt) {
    order.shippedAt = ahora;
  }
  if (to === FULFILLMENT_STATUS.DELIVERED && !order.deliveredAt) {
    order.deliveredAt = ahora;
  }
  if (to === FULFILLMENT_STATUS.CANCELLED && !order.cancelledAt) {
    order.cancelledAt = ahora;
  }

  await order.save({ transaction });

  await registrarHistorial({
    orderId: order.id,
    kind: HISTORY_KIND.LOGISTICA,
    fromStatus: before.fulfillmentStatus,
    toStatus: to,
    actorUserId,
    note,
    transaction,
  });

  // El cambio de dinero que provoque el COD queda en su propio historial.
  for (const pendiente of efectos.pendientes || []) {
    await registrarHistorial({
      orderId: order.id,
      kind: HISTORY_KIND.PAGO,
      fromStatus: pendiente.from,
      toStatus: pendiente.paymentState,
      actorUserId,
      note: `Automático al pasar el pedido a "${to}".`,
      transaction,
    });
  }

  const after = {
    fulfillmentStatus: order.fulfillmentStatus,
    paymentState: order.paymentState,
  };

  if (audit) {
    await registrarAuditoria({
      userId: actorUserId,
      entity: "order",
      entityId: order.id,
      action: "fulfillment_status_changed",
      before,
      after,
      ip,
      requestId,
      note,
      transaction,
    });
  }

  return { order, before, after };
};

// Cambia el estado del DINERO del pedido (sin tocar el de cumplimiento).
const transitionPaymentState = async ({
  order,
  to,
  transaction,
  actorUserId = null,
  source = STATUS_SOURCE.MANUAL_ADMIN,
  note = null,
  ip = null,
  requestId = null,
  audit = true,
}) => {
  assertPaymentTransition(order.paymentState, to);

  const before = { paymentState: order.paymentState };

  order.paymentState = to;
  order.statusSource = source;

  if (
    source === STATUS_SOURCE.MANUAL_ADMIN ||
    source === STATUS_SOURCE.MANUAL_ADMIN_PUSHED
  ) {
    order.manualOverride = true;
  }

  await order.save({ transaction });

  await registrarHistorial({
    orderId: order.id,
    kind: HISTORY_KIND.PAGO,
    fromStatus: before.paymentState,
    toStatus: to,
    actorUserId,
    note,
    transaction,
  });

  if (audit) {
    await registrarAuditoria({
      userId: actorUserId,
      entity: "order",
      entityId: order.id,
      action: "payment_state_changed",
      before,
      after: { paymentState: order.paymentState },
      ip,
      requestId,
      note,
      transaction,
    });
  }

  return { order, before, after: { paymentState: order.paymentState } };
};

// Un pedido COD no se despacha con el dinero "en linea": se despacha igual,
// pero el cobro lo hace el courier.
const assertDispatchable = (order) => {
  if (order.fulfillmentStatus === FULFILLMENT_STATUS.CANCELLED) {
    throw new HttpError(409, "El pedido está cancelado");
  }
  if (isCodOrder(order) && order.paymentState === PAYMENT_STATE.REFUNDED) {
    throw new HttpError(409, "El pago del pedido fue reembolsado");
  }
  return true;
};

module.exports = {
  calculateNetProfit,
  applyAccountingTotals,
  buildAddressSnapshot,
  applyAddressSnapshot,
  registrarHistorial,
  registrarAuditoria,
  transitionFulfillment,
  transitionPaymentState,
  assertDispatchable,
};
