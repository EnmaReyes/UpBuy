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
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  ORDER_STATUS_TRANSITIONS,
  PAYMENT_STATUS,
  PAYMENT_STATUS_VALUES,
  HISTORY_KIND,
  SALE_CHANNEL_VALUES,
  PAYMENT_METHOD_VALUES,
} = require("../DataBase/models/enums.js");
const { releaseOrderStock, restoreOrderStock } = require("./orders.js");
const { registerPayment } = require("./payments.js");
const HttpError = require("../Utils/HttpError.js");
const { assertUuid } = require("../Utils/ids.js");

const STATUS_LABELS = {
  pendiente_pago: "Pendiente de pago",
  pagado: "Pagado",
  en_preparacion: "En preparación",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

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

const BOGOTA_OFFSET = "-05:00";

// Las fechas del panel se interpretan como dias completos en hora de Colombia
// (UTC-5), no en la zona del servidor.
const parseDay = (value, field, endOfDay = false) => {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new HttpError(400, `Fecha inválida en "${field}" (YYYY-MM-DD)`);
  }
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  const date = new Date(`${raw}T${time}${BOGOTA_OFFSET}`);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `Fecha inválida en "${field}"`);
  }
  return date;
};

// Inicio del dia actual en Colombia, expresado en UTC.
const startOfTodayBogota = () => {
  const now = new Date(Date.now() - 5 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 5),
  );
};

const parseLimit = (limit) => Math.min(Math.max(Number(limit) || 20, 1), 100);
const parseOffset = (offset) => Math.max(Number(offset) || 0, 0);

// GET /api/admin/orders
const listOrdersAdmin = async ({
  status,
  paymentStatus,
  channel,
  paymentMethod,
  q,
  from,
  to,
  limit,
  offset,
} = {}) => {
  const where = {};

  if (status) {
    if (!ORDER_STATUS_VALUES.includes(status)) {
      throw new HttpError(400, "Estado de pedido inválido");
    }
    where.status = status;
  }

  if (paymentStatus) {
    if (!PAYMENT_STATUS_VALUES.includes(paymentStatus)) {
      throw new HttpError(400, "Estado de pago inválido");
    }
    where.paymentStatus = paymentStatus;
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
// El estado logistico solo avanza por las transiciones permitidas. Cuando se
// marca como pagado se registra tambien el cambio de estado de pago.
const changeOrderStatus = async ({ orderId, status, note, adminId }) => {
  assertUuid(orderId, "pedido");

  if (!ORDER_STATUS_VALUES.includes(status)) {
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

    const fromStatus = order.status;

    if (fromStatus === status) {
      throw new HttpError(409, `El pedido ya está en estado "${status}"`);
    }

    const allowed = ORDER_STATUS_TRANSITIONS[fromStatus] || [];
    if (!allowed.includes(status)) {
      throw new HttpError(
        409,
        `No se puede pasar de "${fromStatus}" a "${status}"`,
      );
    }

    const cleanNote = note ? String(note).trim().slice(0, 1000) : null;

    order.status = status;

    if (status === ORDER_STATUS.CANCELADO) {
      // Un pedido cancelado devuelve el producto al catalogo.
      await releaseOrderStock(order, transaction);
      order.cancelledAt = new Date();
      order.stockReservedUntil = null;
    }

    if (status === ORDER_STATUS.PAGADO) {
      // El pago se registra en la tabla payments (fuente unica de verdad), no
      // solo en orders.paymentStatus. Ver el bloque posterior al save().
      if (!order.paymentApprovedAt) order.paymentApprovedAt = new Date();
      order.stockReservedUntil = null;
    }

    if (status === ORDER_STATUS.ENVIADO) {
      if (!order.shippedAt) order.shippedAt = new Date();
      order.stockReservedUntil = null;
    }

    if (status === ORDER_STATUS.ENTREGADO) {
      if (!order.deliveredAt) order.deliveredAt = new Date();
      order.stockReservedUntil = null;
    }

    await order.save({ transaction });

    if (status === ORDER_STATUS.PAGADO) {
      // Regla de negocio: una compra aprobada devuelve el producto al catalogo
      // (stock = true) mientras el stock sea booleano.
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

    await OrderStatusHistory.create(
      {
        orderId: order.id,
        kind: HISTORY_KIND.LOGISTICA,
        fromStatus,
        toStatus: status,
        changedByUserId: adminId,
        note: cleanNote,
      },
      { transaction },
    );

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
      to: `/dashboard/pedidos/${order.id}`,
      clave: `pedido:${order.id}:${status}`,
    });
  } catch (error) {
    console.error("No se pudo crear la notificación:", error.message);
  }

  return getOrderAdmin(orderId);
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
  if (order.status === ORDER_STATUS.CANCELADO) {
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
        "status",
        [fn("count", col("id")), "count"],
        [fn("coalesce", fn("sum", col("total")), 0), "total"],
      ],
      group: ["status"],
      raw: true,
    }),
    Order.findAll({
      attributes: [
        "paymentStatus",
        [fn("count", col("id")), "count"],
        [fn("coalesce", fn("sum", col("total")), 0), "total"],
      ],
      group: ["paymentStatus"],
      raw: true,
    }),
    Order.count({ where: { createdAt: { [Op.gte]: startOfTodayBogota() } } }),
  ]);

  const byStatus = ORDER_STATUS_VALUES.reduce((acc, value) => {
    acc[value] = { count: 0, total: 0 };
    return acc;
  }, {});

  for (const row of statusRows) {
    byStatus[row.status] = {
      count: Number(row.count) || 0,
      total: Number(row.total) || 0,
    };
  }

  const byPaymentStatus = PAYMENT_STATUS_VALUES.reduce((acc, value) => {
    acc[value] = { count: 0, total: 0 };
    return acc;
  }, {});

  for (const row of paymentRows) {
    byPaymentStatus[row.paymentStatus] = {
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
    approvedRevenue: byPaymentStatus[PAYMENT_STATUS.APROBADO]?.total || 0,
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
            COALESCE(SUM(total), 0)::bigint AS total
     FROM orders
     WHERE "paymentStatus" = 'aprobado'
       AND status <> 'cancelado'
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
