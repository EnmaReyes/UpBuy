const { Op, fn, col } = require("sequelize");
const {
  sequelize,
  Order,
  OrderItem,
  Payment,
  OrderStatusHistory,
  Usuarios,
} = require("../DataBase/models/index.js");
const {
  FULFILLMENT_STATUS,
  FULFILLMENT_STATUS_VALUES,
  PAYMENT_STATE,
  PAYMENT_STATE_VALUES,
  PAYMENT_STATUS,
  PAYMENT_METHOD_CODE,
  HISTORY_KIND,
  SALE_CHANNEL_VALUES,
  PAYMENT_METHOD_VALUES,
  STATUS_SOURCE,
} = require("../DataBase/models/enums.js");
const { releaseOrderStock, restoreOrderStock } = require("./orders.js");
const { registerPayment } = require("./payments.js");
const {
  transitionFulfillment,
  applyAccountingTotals,
} = require("./orderService.js");
const { FULFILLMENT_LABELS } = require("./statusMachine.js");
const { pushCurrentStatus } = require("./syncService.js");
const HttpError = require("../Utils/HttpError.js");
const { assertUuid } = require("../Utils/ids.js");
const { parseBogotaDay: parseDay, startOfTodayBogota } = require("../Utils/dates.js");

const STATUS_LABELS = FULFILLMENT_LABELS;

// Consultas y acciones del panel de administracion.
// Toda la informacion sensible del comprador se expone aqui, por eso las
// rutas que usan este servicio estan detras de requireAdmin.

const ADMIN_ORDER_INCLUDE = [
  { model: OrderItem, as: "items" },
  { model: Payment, as: "payments" },
  {
    model: OrderStatusHistory,
    as: "history",
    include: [
      {
        model: Usuarios,
        as: "changedBy",
        attributes: ["id", "username", "email"],
      },
    ],
  },
  {
    model: Usuarios,
    as: "user",
    attributes: ["id", "username", "email", "name", "lastName", "image"],
  },
];

const ADMIN_ORDER_SORT = [
  [{ model: OrderItem, as: "items" }, "createdAt", "ASC"],
  [{ model: Payment, as: "payments" }, "createdAt", "DESC"],
  [{ model: OrderStatusHistory, as: "history" }, "createdAt", "ASC"],
];

// Las fechas del panel se interpretan como dias completos en hora de Colombia
// (ver Utils/dates.js).

const parseLimit = (limit) => Math.min(Math.max(Number(limit) || 20, 1), 100);
const parseOffset = (offset) => Math.max(Number(offset) || 0, 0);

// GET /api/admin/orders
const listOrdersAdmin = async ({
  status,
  paymentStatus,
  channel,
  paymentMethod,
  paymentMethodCode,
  provider,
  q,
  from,
  to,
  limit,
  offset,
} = {}) => {
  const where = {};

  if (status) {
    if (!FULFILLMENT_STATUS_VALUES.includes(status)) {
      throw new HttpError(400, "Estado de pedido inválido");
    }
    where.fulfillmentStatus = status;
  }

  if (paymentStatus) {
    if (!PAYMENT_STATE_VALUES.includes(paymentStatus)) {
      throw new HttpError(400, "Estado de pago inválido");
    }
    where.paymentState = paymentStatus;
  }

  if (channel) {
    if (!SALE_CHANNEL_VALUES.includes(channel)) {
      throw new HttpError(400, "Canal de venta inválido");
    }
    where.channel = channel;
  }

  if (paymentMethod) {
    if (!PAYMENT_METHOD_VALUES.includes(paymentMethod)) {
      throw new HttpError(400, "Método de pago inválido");
    }
    where.paymentMethod = paymentMethod;
  }

  if (paymentMethodCode) {
    if (!Object.values(PAYMENT_METHOD_CODE).includes(paymentMethodCode)) {
      throw new HttpError(400, "Método de pago inválido");
    }
    where.paymentMethodCode = paymentMethodCode;
  }

  if (provider) {
    if (!["vendelo", "dropi"].includes(provider)) {
      throw new HttpError(400, "Proveedor inválido");
    }
    where.provider = provider;
  }

  const search = String(q || "").trim();
  if (search) {
    const term = `%${search}%`;
    where[Op.or] = [
      { orderNumber: { [Op.iLike]: term } },
      { email: { [Op.iLike]: term } },
      { phone: { [Op.iLike]: term } },
      { recipientName: { [Op.iLike]: term } },
    ];
  }

  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt[Op.gte] = parseDay(from, "from");
    if (to) where.createdAt[Op.lte] = parseDay(to, "to", true);
  }

  const safeLimit = parseLimit(limit);
  const safeOffset = parseOffset(offset);

  const { rows, count } = await Order.findAndCountAll({
    where,
    include: [
      { model: OrderItem, as: "items" },
      {
        model: Usuarios,
        as: "user",
        attributes: ["id", "username", "email"],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit: safeLimit,
    offset: safeOffset,
    distinct: true,
  });

  return {
    orders: rows,
    total: count,
    limit: safeLimit,
    offset: safeOffset,
  };
};

// GET /api/admin/orders/:id
const getOrderAdmin = async (orderId) => {
  assertUuid(orderId, "pedido");

  const order = await Order.findByPk(orderId, {
    include: ADMIN_ORDER_INCLUDE,
    order: ADMIN_ORDER_SORT,
  });

  if (!order) {
    throw new HttpError(404, "Pedido no encontrado");
  }
  return order;
};

// PATCH /api/admin/orders/:id/status
//
// El estado logistico solo avanza por las transiciones permitidas. Cuando se
// marca como pagado se registra tambien el cambio de estado de pago.
//
// Todas las reglas viven en Services/orderService.js (la misma que usa el
// cron y los webhooks): transicion invalida -> 422, "enviado" exige guia, y
// en COD el pago se mueve solo.
const changeOrderStatus = async ({
  orderId,
  status,
  note,
  adminId,
  trackingNumber,
  trackingUrl,
  pushToProvider = false,
  ip = null,
  requestId = null,
}) => {
  assertUuid(orderId, "pedido");

  if (!FULFILLMENT_STATUS_VALUES.includes(status)) {
    throw new HttpError(400, "Estado de pedido inválido");
  }

  const transaction = await sequelize.transaction();
  // Se declara fuera del try para poder usarlo al notificar, despues del commit.
  let order = null;

  try {
    order = await Order.findByPk(orderId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!order) {
      throw new HttpError(404, "Pedido no encontrado");
    }

    const cleanNote = note ? String(note).trim().slice(0, 1000) : null;

    // Un pedido cancelado devuelve el producto al catalogo.
    if (status === FULFILLMENT_STATUS.CANCELLED) {
      await releaseOrderStock(order, transaction);
    }

    // La transicion valida, los efectos (guia, COD) y la auditoria los
    // aplica el servicio de pedidos.
    await transitionFulfillment({
      order,
      to: status,
      transaction,
      actorUserId: adminId,
      source: STATUS_SOURCE.MANUAL_ADMIN,
      note: cleanNote,
      trackingNumber,
      trackingUrl,
      ip,
      requestId,
    });

    if (status === FULFILLMENT_STATUS.PAID) {
      // El pago se registra en la tabla payments (fuente unica de verdad),
      // no solo en orders.paymentState.
      await restoreOrderStock(order, transaction);

      const approved = await Payment.findOne({
        where: { orderId: order.id, status: PAYMENT_STATUS.APROBADO },
        transaction,
      });

      if (!approved) {
        await registerPayment({
          orderId: order.id,
          status: PAYMENT_STATUS.APROBADO,
          paymentMethodType: order.paymentMethod,
          actorUserId: adminId,
          note: "Pago confirmado manualmente por administrador",
          transaction,
        });
      }
    }

    // La utilidad se recalcula por si el cambio de estado afecta los
    // costos (un pedido entregado ya no tiene costo de envio pendiente).
    applyAccountingTotals(order);
    await order.save({ transaction });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  // Notificacion al cliente sobre el cambio de estado.
  try {
    const { createNotification } = require("./notifications.js");
    await createNotification({
      userId: order.userId,
      tipo: "pedido",
      titulo: `Pedido ${order.orderNumber}: ${STATUS_LABELS[status] || status}`,
      texto: "El estado de tu pedido cambió. Toca para ver el detalle.",
      to: `/pedido/${order.id}`,
      clave: `pedido:${order.id}:${status}`,
    });
  } catch (error) {
    console.error("No se pudo crear la notificación:", error.message);
  }

  // Empujar el cambio al proveedor es OPCIONAL y nunca revierte lo local:
  // si falla, el pedido queda con providerOutOfSync para que el panel lo
  // muestre.
  let providerPush = null;
  if (pushToProvider) {
    const fresh = await Order.findByPk(order.id);
    providerPush = await pushCurrentStatus({
      order: fresh,
      actorUserId: adminId,
    });
  }

  const result = await getOrderAdmin(orderId);
  if (providerPush) {
    result.dataValues.providerPush = providerPush;
  }
  return result;
};

// PATCH /api/admin/orders/:id/tracking
const updateTracking = async ({
  orderId,
  trackingCarrier,
  trackingNumber,
}) => {
  assertUuid(orderId, "pedido");

  const order = await Order.findByPk(orderId);

  if (!order) {
    throw new HttpError(404, "Pedido no encontrado");
  }
  if (order.fulfillmentStatus === FULFILLMENT_STATUS.CANCELLED) {
    throw new HttpError(
      409,
      "No se puede editar el envío de un pedido cancelado",
    );
  }

  const carrier =
    trackingCarrier === undefined
      ? order.trackingCarrier
      : String(trackingCarrier || "").trim().slice(0, 100) || null;
  const number =
    trackingNumber === undefined
      ? order.trackingNumber
      : String(trackingNumber || "").trim().slice(0, 100) || null;

  if (carrier === null && number === null) {
    throw new HttpError(400, "Indica al menos la transportadora o la guía");
  }

  order.trackingCarrier = carrier;
  order.trackingNumber = number;
  await order.save();

  return getOrderAdmin(orderId);
};

// GET /api/admin/orders/stats — resumen para el tablero
const orderStats = async () => {
  const [statusRows, paymentRows, ordersToday] = await Promise.all([
    Order.findAll({
      attributes: [
        "fulfillmentStatus",
        [fn("count", col("id")), "count"],
        [fn("coalesce", fn("sum", col("total")), 0), "total"],
        [fn("coalesce", fn("sum", col("netProfit")), 0), "profit"],
      ],
      group: ["fulfillmentStatus"],
      raw: true,
    }),
    Order.findAll({
      attributes: [
        "paymentState",
        [fn("count", col("id")), "count"],
        [fn("coalesce", fn("sum", col("total")), 0), "total"],
      ],
      group: ["paymentState"],
      raw: true,
    }),
    Order.count({ where: { createdAt: { [Op.gte]: startOfTodayBogota() } } }),
  ]);

  const byStatus = FULFILLMENT_STATUS_VALUES.reduce((acc, value) => {
    acc[value] = { count: 0, total: 0, profit: 0 };
    return acc;
  }, {});

  for (const row of statusRows) {
    byStatus[row.fulfillmentStatus] = {
      count: Number(row.count) || 0,
      total: Number(row.total) || 0,
      profit: Number(row.profit) || 0,
    };
  }

  const byPaymentStatus = PAYMENT_STATE_VALUES.reduce((acc, value) => {
    acc[value] = { count: 0, total: 0 };
    return acc;
  }, {});

  for (const row of paymentRows) {
    byPaymentStatus[row.paymentState] = {
      count: Number(row.count) || 0,
      total: Number(row.total) || 0,
    };
  }

  const totalOrders = Object.values(byStatus).reduce(
    (sum, item) => sum + item.count,
    0,
  );

  return {
    totalOrders,
    ordersToday,
    byStatus,
    byPaymentStatus,
    // Alias en espanol para no romper el panel actual.
    approvedRevenue: byPaymentStatus[PAYMENT_STATE.SETTLED]?.total || 0,
    // Utilidad ganada: pedidos entregados.
    earnedProfit:
      byStatus[FULFILLMENT_STATUS.DELIVERED]?.profit || 0,
    // Efectivo ya cobrado al cliente (en transito + liquidado).
    cashIn:
      (byPaymentStatus[PAYMENT_STATE.SETTLED]?.total || 0) +
      (byPaymentStatus[PAYMENT_STATE.COLLECTED]?.total || 0),
    // Dinero que viene en camino: COD entregado, pendiente de liquidacion.
    pendingCash: byPaymentStatus[PAYMENT_STATE.PENDING_COLLECTION]?.total || 0,
  };
};

// GET /api/admin/orders/ventas?periodo=dia|semana|mes|anio
// Contabilidad de ventas: solo pedidos con pago aprobado y no cancelados.
const salesByPeriod = async ({ periodo } = {}) => {
  const periodosValidos = ["dia", "semana", "mes", "anio"];
  const p = periodosValidos.includes(periodo) ? periodo : "mes";
  const bucket = { dia: "day", semana: "week", mes: "month", anio: "year" }[p];
  const n = { dia: 30, semana: 12, mes: 12, anio: 5 }[p];

  const BOGOTA = 5 * 60 * 60 * 1000;
  const toBogota = (d) => new Date(d.getTime() - BOGOTA);
  const fromBogota = (d) => new Date(d.getTime() + BOGOTA);

  const truncBogota = (d) => {
    const b = toBogota(d);
    if (bucket === "day") b.setUTCHours(0, 0, 0, 0);
    else if (bucket === "week") {
      const day = b.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day;
      b.setUTCDate(b.getUTCDate() + diff);
      b.setUTCHours(0, 0, 0, 0);
    } else if (bucket === "month") {
      b.setUTCDate(1);
      b.setUTCHours(0, 0, 0, 0);
    } else {
      b.setUTCMonth(0, 1);
      b.setUTCHours(0, 0, 0, 0);
    }
    return fromBogota(b);
  };

  const now = new Date();
  const currentStart = truncBogota(now);
  const buckets = [];
  const seen = new Set();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(currentStart);
    if (bucket === "day") d.setUTCDate(d.getUTCDate() - i);
    else if (bucket === "week") d.setUTCDate(d.getUTCDate() - i * 7);
    else if (bucket === "month") d.setUTCMonth(d.getUTCMonth() - i);
    else d.setUTCFullYear(d.getUTCFullYear() - i);
    const b = truncBogota(d);
    const key = b.toISOString();
    if (seen.has(key)) continue;
    seen.add(key);
    buckets.push(b);
  }
  const desde = buckets[0];

  const { QueryTypes } = require("sequelize");
  const queryResult = await sequelize.query(
    `SELECT (date_trunc(:bucket, "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')) AS bucket,
            COUNT(*)::int AS count,
            COALESCE(SUM(total), 0)::bigint AS total,
            COALESCE(SUM("netProfit"), 0)::bigint AS profit
     FROM orders
     WHERE "paymentState" = 'settled'
       AND "fulfillmentStatus" <> 'cancelled'
       AND "createdAt" >= :desde
     GROUP BY bucket
     ORDER BY bucket ASC`,
    { replacements: { bucket, desde }, type: QueryTypes.SELECT },
  );

  // QueryTypes.SELECT devuelve las filas directamente; algunas versiones
  // envuelven el resultado en [rows, metadata]. Se acepta cualquiera.
  const rows = Array.isArray(queryResult?.[0])
    ? queryResult[0]
    : queryResult || [];

  const map = new Map();
  for (const row of rows || []) {
    const bogDate = new Date(row.bucket);
    const realDate = fromBogota(bogDate);
    map.set(realDate.toISOString(), {
      count: Number(row.count) || 0,
      total: Number(row.total) || 0,
    });
  }

  const serie = buckets.map((b) => {
    const v = map.get(b.toISOString()) || { count: 0, total: 0 };
    return {
      label: formatBucketLabel(b, bucket),
      total: v.total,
      count: v.count,
      fecha: b.toISOString(),
    };
  });

  const actual = serie[serie.length - 1] || { label: "", total: 0, count: 0 };
  const anterior =
    serie.length >= 2
      ? serie[serie.length - 2]
      : { label: "", total: 0, count: 0 };

  const totalPeriodo = serie.reduce((s, x) => s + x.total, 0);
  const countPeriodo = serie.reduce((s, x) => s + x.count, 0);

  return {
    periodo: p,
    actual,
    anterior,
    serie,
    total: totalPeriodo,
    count: countPeriodo,
  };
};

function formatBucketLabel(d, bucket) {
  const bog = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  if (bucket === "day" || bucket === "week") {
    return new Intl.DateTimeFormat("es-CO", {
      day: "2-digit",
      month: "short",
    }).format(bog);
  }
  if (bucket === "month") {
    return new Intl.DateTimeFormat("es-CO", {
      month: "short",
      year: "numeric",
    }).format(bog);
  }
  return new Intl.DateTimeFormat("es-CO", { year: "numeric" }).format(bog);
}

module.exports = {
  listOrdersAdmin,
  getOrderAdmin,
  changeOrderStatus,
  updateTracking,
  orderStats,
  salesByPeriod,
};
