const {
  sequelize,
  Order,
  Payment,
  OrderStatusHistory,
} = require("../DataBase/models/index.js");
const {
  PAYMENT_STATUS,
  HISTORY_KIND,
  ORDER_STATUS,
} = require("../DataBase/models/enums.js");
const { restoreOrderStock, detectStockConflicts } = require("./orders.js");
const { notifyAdmins } = require("./notifications.js");
const HttpError = require("../Utils/HttpError.js");
const { assertUuid } = require("../Utils/ids.js");

// ---------------------------------------------------------------------------
// Pagos de un pedido.
//
// Un pedido puede tener varios intentos de pago, pero solo uno aprobado (lo
// garantiza el indice unico parcial payments_one_approved_per_order).
//
// En esta fase el unico emisor de pagos es el administrador (transferencia,
// Nequi, efectivo). El servicio ya esta escrito para que el webhook de Wompi
// lo reutilice en la siguiente fase sin duplicar reglas: el webhook solo
// tendra que llamar a `registerPayment` con el estado que reporte el proveedor.
//
// El estado LOGISTICO del pedido (orders.status) no se toca aqui: pago y
// envio son estados separados a proposito.
// ---------------------------------------------------------------------------

// Estados que un administrador puede fijar a mano.
const SETTABLE_STATUSES = [
  PAYMENT_STATUS.PENDIENTE,
  PAYMENT_STATUS.APROBADO,
  PAYMENT_STATUS.RECHAZADO,
  PAYMENT_STATUS.REEMBOLSADO,
  PAYMENT_STATUS.ANULADO,
  // Solo lo fija el proveedor de pagos (Wompi) cuando la transaccion no pudo
  // procesarse; el panel no lo ofrece.
  PAYMENT_STATUS.ERROR,
];

// Transiciones validas de un pago. "rechazado"/"error" vuelven a "pendiente"
// porque el comprador puede reintentar sobre el mismo registro manual.
const ALLOWED_TRANSITIONS = {
  [PAYMENT_STATUS.PENDIENTE]: [
    PAYMENT_STATUS.APROBADO,
    PAYMENT_STATUS.RECHAZADO,
    PAYMENT_STATUS.ERROR,
    PAYMENT_STATUS.ANULADO,
  ],
  [PAYMENT_STATUS.EN_REVISION]: [
    PAYMENT_STATUS.APROBADO,
    PAYMENT_STATUS.RECHAZADO,
    PAYMENT_STATUS.PENDIENTE,
    PAYMENT_STATUS.ANULADO,
  ],
  // "VOIDED" de Wompi sobre un pago ya aprobado se trata como reembolso (ver
  // Services/wompi.js), pero la transicion existe por si el proveedor anula
  // una transaccion aprobada sin devolver el dinero.
  [PAYMENT_STATUS.APROBADO]: [
    PAYMENT_STATUS.REEMBOLSADO,
    PAYMENT_STATUS.ANULADO,
  ],
  [PAYMENT_STATUS.RECHAZADO]: [
    PAYMENT_STATUS.PENDIENTE,
    PAYMENT_STATUS.ANULADO,
  ],
  [PAYMENT_STATUS.ERROR]: [
    PAYMENT_STATUS.PENDIENTE,
    PAYMENT_STATUS.RECHAZADO,
    PAYMENT_STATUS.ANULADO,
  ],
  [PAYMENT_STATUS.ANULADO]: [],
  [PAYMENT_STATUS.REEMBOLSADO]: [],
};

const PROVIDER_MANUAL = "manual";

// Referencia determinista del pago manual: un solo registro por pedido, que
// se reutiliza al reintentar. Wompi usara su propia referencia por intento.
const manualReference = (order) => `MAN-${order.orderNumber}`;

const toCents = (total) => {
  const cents = Math.round(Number(total) * 100);
  // 0 es valido (pedido gratuito manual: queda registrado con monto 0).
  // El cobro en linea de un total 0 lo bloquea wompi.js antes de llegar aqui.
  if (!Number.isFinite(cents) || cents < 0) {
    throw new HttpError(409, "El pedido no tiene un total válido para cobrar");
  }
  return cents;
};

const cleanText = (value, max) => {
  const raw = value === undefined || value === null ? "" : String(value).trim();
  return raw ? raw.slice(0, max) : null;
};

const assertSettableStatus = (status) => {
  if (!SETTABLE_STATUSES.includes(status)) {
    throw new HttpError(400, "Estado de pago inválido");
  }
};

// Estado que debe quedar en el pedido. Nunca se "rebaja" un pago aprobado o
// reembolsado a pendiente/rechazado; el indice unico lo protege igual.
const orderStatusFor = (current, next) => {
  if (current === PAYMENT_STATUS.REEMBOLSADO) return current;
  if (
    current === PAYMENT_STATUS.APROBADO &&
    next !== PAYMENT_STATUS.REEMBOLSADO
  ) {
    return current;
  }
  return next;
};

// Ejecuta el trabajo en una transaccion propia, o se suma a una existente.
const withTransaction = async (transaction, work) => {
  if (transaction) return work(transaction);

  const own = await sequelize.transaction();
  try {
    const result = await work(own);
    await own.commit();
    return result;
  } catch (error) {
    await own.rollback();
    throw error;
  }
};

// Aviso al administrador cuando el pago entra con productos que ya no estan
// disponibles. Se crea FUERA de la transaccion del pago y nunca la tumba: una
// notificacion fallida no debe deshacer un cobro real.
const notifyStockConflicts = async (order, conflicts) => {
  if (!conflicts?.length) return;

  try {
    const detalle = conflicts
      .map(
        (conflict) =>
          `"${conflict.title}" (${
            conflict.motivo === "eliminado" ? "ya no existe" : "agotado"
          })`,
      )
      .join(", ");

    await notifyAdmins({
      tipo: "pedido",
      titulo: `Posible sobreventa en ${order.orderNumber}`,
      texto: `Se aprobó el pago de ${order.orderNumber}, pero ${detalle}. Revisa el inventario antes de despachar.`,
      to: `/admin/pedidos/${order.id}`,
      claveForAdmin: (adminId) => `stock-conflicto:${order.id}:${adminId}`,
    });
  } catch (error) {
    console.error(
      "No se pudo avisar la posible sobreventa:",
      error.message,
    );
  }
};

// Efectos de un cambio de estado de pago sobre el pedido y su historial.
// Devuelve la lista de productos que ya no estaban disponibles al aprobar.
const applyPaymentStatus = async ({
  order,
  nextStatus,
  previousStatus,
  transaction,
  actorUserId,
  note,
}) => {
  const nextOrderStatus = orderStatusFor(order.paymentStatus, nextStatus);

  if (nextOrderStatus !== order.paymentStatus) {
    order.paymentStatus = nextOrderStatus;
  }

  if (nextStatus === PAYMENT_STATUS.APROBADO && !order.paymentApprovedAt) {
    order.paymentApprovedAt = new Date();
  }

  // Un pago aprobado mueve el pedido de "pendiente_pago" a "pagado": deja de
  // poder cancelarse y el panel lo refleja igual que una venta manual (ver
  // Services/adminOrders.js). Solo se aplica una vez y nunca revierte un estado
  // logistico ya avanzado.
  const promoverAPagado =
    nextStatus === PAYMENT_STATUS.APROBADO &&
    order.status === ORDER_STATUS.PENDIENTE_PAGO;

  if (promoverAPagado) {
    order.status = ORDER_STATUS.PAGADO;
  }

  // Detector de sobreventa: se mira ANTES de devolver el producto al catalogo,
  // porque restoreOrderStock vuelve a poner stock = true.
  const stockConflicts =
    nextStatus === PAYMENT_STATUS.APROBADO
      ? await detectStockConflicts(order, transaction)
      : [];

  // Regla de negocio (stock booleano): un pago aprobado devuelve el producto
  // al catalogo, y un reembolso tambien (el producto existe fisicamente; si
  // se dano, el administrador lo marca agotado a mano).
  if (
    nextStatus === PAYMENT_STATUS.APROBADO ||
    nextStatus === PAYMENT_STATUS.REEMBOLSADO
  ) {
    await restoreOrderStock(order, transaction);
  }

  await order.save({ transaction });

  if (promoverAPagado) {
    await OrderStatusHistory.create(
      {
        orderId: order.id,
        kind: HISTORY_KIND.LOGISTICA,
        fromStatus: ORDER_STATUS.PENDIENTE_PAGO,
        toStatus: ORDER_STATUS.PAGADO,
        changedByUserId: actorUserId || null,
        note: "Pago aprobado.",
      },
      { transaction },
    );
  }

  // La alerta queda tambien en el historial del pedido para que se vea en el
  // panel sin depender de las notificaciones.
  let finalNote = cleanText(note, 1000);
  if (stockConflicts.length) {
    const detalle = stockConflicts
      .map(
        (conflict) =>
          `"${conflict.title}" (${
            conflict.motivo === "eliminado" ? "ya no existe" : "agotado"
          })`,
      )
      .join(", ");
    finalNote = cleanText(
      `${finalNote ? `${finalNote} ` : ""}⚠ Posible sobreventa: ${detalle}.`,
      1000,
    );
  }

  await OrderStatusHistory.create(
    {
      orderId: order.id,
      kind: HISTORY_KIND.PAGO,
      fromStatus: previousStatus,
      toStatus: nextStatus,
      changedByUserId: actorUserId || null,
      note: finalNote,
    },
    { transaction },
  );

  return stockConflicts;
};

// Lleva un pago existente a otro estado. No crea pagos.
const transitionPayment = async ({
  order,
  payment,
  nextStatus,
  paymentMethodType,
  statusMessage,
  failureCode,
  providerTransactionId,
  wompiStatus,
  rawPayload,
  actorUserId = null,
  note = null,
  transaction,
}) => {
  assertSettableStatus(nextStatus);

  if (
    providerTransactionId &&
    payment.providerTransactionId &&
    payment.providerTransactionId !== providerTransactionId
  ) {
    throw new HttpError(
      409,
      "El pago ya está asociado a otra transacción del proveedor",
    );
  }

  const previousStatus = payment.status;

  if (previousStatus === nextStatus) {
    // Nada que cambiar, pero se completan los datos de diagnostico que hayan
    // llegado despues (mensaje o codigo del medio de pago).
    let touched = false;
    if (statusMessage && !payment.statusMessage) {
      payment.statusMessage = cleanText(statusMessage, 255);
      touched = true;
    }
    if (failureCode && !payment.failureCode) {
      payment.failureCode = cleanText(failureCode, 100);
      touched = true;
    }
    if (paymentMethodType && !payment.paymentMethodType) {
      payment.paymentMethodType = cleanText(paymentMethodType, 50);
      touched = true;
    }
    if (providerTransactionId && !payment.providerTransactionId) {
      payment.providerTransactionId = cleanText(providerTransactionId, 100);
      touched = true;
    }
    if (wompiStatus && !payment.wompiStatus) {
      payment.wompiStatus = cleanText(wompiStatus, 50);
      touched = true;
    }
    if (rawPayload && !payment.rawPayload) {
      payment.rawPayload = rawPayload;
      touched = true;
    }
    if (touched) await payment.save({ transaction });
    return { payment, order, stockConflicts: [] };
  }

  const allowed = ALLOWED_TRANSITIONS[previousStatus] || [];
  if (!allowed.includes(nextStatus)) {
    throw new HttpError(
      409,
      `No se puede pasar el pago de "${previousStatus}" a "${nextStatus}"`,
    );
  }

  if (nextStatus === PAYMENT_STATUS.APROBADO) {
    // El indice unico parcial es la ultima red; este chequeo da un mensaje
    // claro antes de chocar con el.
    const approved = await Payment.findOne({
      where: { orderId: order.id, status: PAYMENT_STATUS.APROBADO },
      transaction,
    });
    if (approved && approved.id !== payment.id) {
      throw new HttpError(409, "El pedido ya tiene un pago aprobado");
    }
  }

  payment.status = nextStatus;
  if (paymentMethodType !== undefined) {
    payment.paymentMethodType = cleanText(paymentMethodType, 50);
  }
  if (statusMessage !== undefined) {
    payment.statusMessage = cleanText(statusMessage, 255);
  }
  if (failureCode !== undefined) {
    payment.failureCode = cleanText(failureCode, 100);
  }
  if (providerTransactionId) {
    payment.providerTransactionId = cleanText(providerTransactionId, 100);
  }
  if (wompiStatus !== undefined) {
    payment.wompiStatus = cleanText(wompiStatus, 50);
  }
  if (rawPayload !== undefined && rawPayload !== null) {
    payment.rawPayload = rawPayload;
  }
  payment.processedAt = new Date();
  await payment.save({ transaction });

  const stockConflicts = await applyPaymentStatus({
    order,
    nextStatus,
    previousStatus,
    transaction,
    actorUserId,
    note: note || `Pago ${nextStatus} registrado por administrador`,
  });

  return { payment, order, stockConflicts };
};

// Carga el pedido (y opcionalmente su pago) dentro de la transaccion, con
// bloqueo de fila para que dos peticiones no se pisen.
const loadOrder = async ({ orderId, transaction }) => {
  assertUuid(orderId, "pedido");

  const order = await Order.findByPk(orderId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!order) {
    throw new HttpError(404, "Pedido no encontrado");
  }
  return order;
};

// Punto unico de escritura de pagos. Devuelve { payment, order }.
//
// - Idempotente por `reference`: si ya existe, se actualiza en lugar de crear
//   otro registro (un doble clic del administrador o un webhook repetido no
//   duplican nada).
// - Si el pago ya esta en ese estado, no pasa nada y devuelve lo que hay.
const registerPayment = async ({
  orderId,
  status,
  provider = PROVIDER_MANUAL,
  reference,
  paymentMethodType,
  statusMessage,
  failureCode,
  providerTransactionId,
  wompiStatus,
  rawPayload,
  actorUserId = null,
  note = null,
  transaction,
}) => {
  assertSettableStatus(status);

  const result = await withTransaction(transaction, async (tx) => {
    const order = await loadOrder({ orderId, transaction: tx });

    if (order.status === ORDER_STATUS.CANCELADO) {
      throw new HttpError(409, "El pedido está cancelado");
    }

    const ref = cleanText(reference, 100) || manualReference(order);

    let payment = await Payment.findOne({
      where: { reference: ref },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });

    if (payment && payment.orderId !== order.id) {
      throw new HttpError(409, "La referencia ya pertenece a otro pedido");
    }

    if (!payment) {
      payment = await Payment.create(
        {
          orderId: order.id,
          provider,
          reference: ref,
          status: PAYMENT_STATUS.PENDIENTE,
          amountInCents: toCents(order.total),
          currency: order.currency || "COP",
          paymentMethodType: cleanText(paymentMethodType, 50),
          statusMessage: cleanText(statusMessage, 255),
          failureCode: cleanText(failureCode, 100),
          providerTransactionId: cleanText(providerTransactionId, 100),
          wompiStatus: cleanText(wompiStatus, 50),
          rawPayload: rawPayload || null,
        },
        { transaction: tx },
      );
    }

    return transitionPayment({
      order,
      payment,
      nextStatus: status,
      paymentMethodType,
      statusMessage,
      failureCode,
      providerTransactionId,
      wompiStatus,
      rawPayload,
      actorUserId,
      note,
      transaction: tx,
    });
  });

  // El aviso al administrador va despues del commit: si el pago se deshace,
  // no queda una alerta huerfana.
  if (!transaction && result.stockConflicts?.length) {
    await notifyStockConflicts(result.order, result.stockConflicts);
  }

  return result;
};

// Cambia el estado de un pago concreto (reembolso, anulacion, correccion).
const changePaymentStatus = async ({
  orderId,
  paymentId,
  status,
  paymentMethodType,
  statusMessage,
  failureCode,
  actorUserId = null,
  note = null,
}) => {
  assertSettableStatus(status);
  assertUuid(paymentId, "pago");

  return withTransaction(null, async (tx) => {
    const order = await loadOrder({ orderId, transaction: tx });

    const payment = await Payment.findOne({
      where: { id: paymentId, orderId: order.id },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });

    if (!payment) {
      throw new HttpError(404, "Pago no encontrado");
    }

    const result = await transitionPayment({
      order,
      payment,
      nextStatus: status,
      paymentMethodType,
      statusMessage,
      failureCode,
      actorUserId,
      note,
      transaction: tx,
    });

    return result;
  }).then(async (result) => {
    if (result.stockConflicts?.length) {
      await notifyStockConflicts(result.order, result.stockConflicts);
    }
    return result;
  });
};

// GET /api/admin/orders/:id/payments — historial de intentos del pedido.
const listOrderPayments = async (orderId) => {
  assertUuid(orderId, "pedido");

  const order = await Order.findByPk(orderId);
  if (!order) {
    throw new HttpError(404, "Pedido no encontrado");
  }

  const payments = await Payment.findAll({
    where: { orderId },
    order: [["createdAt", "DESC"]],
  });

  return {
    orderId,
    orderNumber: order.orderNumber,
    paymentStatus: order.paymentStatus,
    paymentApprovedAt: order.paymentApprovedAt,
    payments,
  };
};

module.exports = {
  registerPayment,
  changePaymentStatus,
  listOrderPayments,
  manualReference,
  PROVIDER_MANUAL,
  SETTABLE_STATUSES,
  ALLOWED_TRANSITIONS,
};
