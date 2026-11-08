const { Op } = require("sequelize");
const {
  sequelize,
  Order,
  OrderItem,
  Payment,
  OrderStatusHistory,
  Articulos,
  Dtf,
} = require("../DataBase/models/index.js");
const {
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  PAYMENT_STATUS,
  PAYMENT_STATUS_VALUES,
  HISTORY_KIND,
  SALE_CHANNEL,
  SALE_CHANNEL_VALUES,
  PAYMENT_METHOD_VALUES,
  STOCK_RESERVATION_MINUTES,
} = require("../DataBase/models/enums.js");
const { buildOrderLines } = require("./pricing.js");
const { quoteShipping, deliveryDaysForZone } = require("./shipping.js");
const HttpError = require("../Utils/HttpError.js");
const { assertUuid } = require("../Utils/ids.js");
const { STOCK_RESERVATION_ENABLED } = require("../config.js");

const REQUIRED_SHIPPING_FIELDS = [
  "recipientName",
  "email",
  "phone",
  "address",
  "city",
  "department",
];

const trim = (value) =>
  value === undefined || value === null ? "" : String(value).trim();

// Valida y normaliza el snapshot de envio que envia el checkout.
const validateShipping = (shipping = {}) => {
  const data = {
    recipientName: trim(shipping.recipientName || shipping.name).slice(0, 150),
    email: trim(shipping.email).toLowerCase().slice(0, 255),
    phone: trim(shipping.phone).slice(0, 30),
    address: trim(shipping.address).slice(0, 255),
    city: trim(shipping.city).slice(0, 100),
    department: trim(shipping.department).slice(0, 100),
    postalCode: trim(shipping.postalCode).slice(0, 20) || null,
    notes: trim(shipping.notes) || null,
  };

  for (const field of REQUIRED_SHIPPING_FIELDS) {
    if (!data[field]) {
      throw new HttpError(400, `Falta el dato de envío: ${field}`);
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    throw new HttpError(400, "Correo electrónico inválido");
  }
  if (data.phone.replace(/\D/g, "").length < 7) {
    throw new HttpError(400, "Teléfono inválido");
  }

  return data;
};

// Validacion relajada para ventas manuales: nombre y telefono obligatorios;
// correo y direccion solo cuando la entrega es por envio.
const validateManualShipping = (shipping = {}, { requireAddress = true } = {}) => {
  const data = {
    recipientName: trim(shipping.recipientName || shipping.name).slice(0, 150),
    email: trim(shipping.email).toLowerCase().slice(0, 255) || null,
    phone: trim(shipping.phone).slice(0, 30),
    address: trim(shipping.address).slice(0, 255) || null,
    city: trim(shipping.city).slice(0, 100) || null,
    department: trim(shipping.department).slice(0, 100) || null,
    postalCode: trim(shipping.postalCode).slice(0, 20) || null,
    notes: trim(shipping.notes) || null,
  };

  if (!data.recipientName) {
    throw new HttpError(400, "Falta el nombre del comprador");
  }
  if (!data.phone) {
    throw new HttpError(400, "Falta el teléfono del comprador");
  }
  if (data.phone.replace(/\D/g, "").length < 7) {
    throw new HttpError(400, "Teléfono inválido");
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    throw new HttpError(400, "Correo electrónico inválido");
  }

  if (requireAddress) {
    const missing = ["address", "city", "department"].find((f) => !data[f]);
    if (missing) {
      throw new HttpError(
        400,
        "Para envío se requieren dirección, ciudad y departamento",
      );
    }
  }

  return data;
};

const generateOrderNumber = async (transaction) => {
  const [rows] = await sequelize.query(
    "SELECT nextval('order_number_seq') AS n",
    { transaction },
  );
  const numero = String(rows[0].n).padStart(6, "0");
  return `BYG-${new Date().getFullYear()}-${numero}`;
};

const productModel = (productType) =>
  productType === "articulo" ? Articulos : Dtf;

// Libera el stock reservado por un pedido (solo si la reserva esta activa).
//
// Con stock booleano la reserva esta desactivada: el pedido nunca bloqueo el
// producto, asi que no hay nada que devolver. Escribir stock = true aqui
// "reviviria" productos que un administrador marco como agotados.
const releaseOrderStock = async (order, transaction) => {
  if (!STOCK_RESERVATION_ENABLED) return;

  const items = await OrderItem.findAll({
    where: { orderId: order.id },
    transaction,
  });

  for (const item of items) {
    const Model = productModel(item.productType);
    await Model.update(
      { stock: true },
      { where: { id: item.productId }, transaction },
    );
  }
};

// Devuelve el producto al catalogo cuando la compra queda pagada.
//
// Regla de negocio: mientras el stock sea booleano, una compra aprobada deja
// el producto disponible otra vez (stock = true) en lugar de sacarlo del
// catalogo. No confundir con releaseOrderStock, que deshace una RESERVA.
const restoreOrderStock = async (order, transaction) => {
  const items = await OrderItem.findAll({
    where: { orderId: order.id },
    transaction,
  });

  for (const item of items) {
    const Model = productModel(item.productType);
    await Model.update(
      { stock: true },
      { where: { id: item.productId }, transaction },
    );
  }
};

// Reserva el stock de cada producto del pedido. Los productos ya estan
// bloqueados y validados (stock = true) dentro de la misma transaccion.
//
// El UPDATE es condicional (stock = true): si otro pedido se le adelanto, la
// fila ya no cumple la condicion, `affected` es 0 y el pedido falla en lugar
// de vender dos veces el mismo producto (control de sobreventa).
const reserveOrderStock = async (lines, transaction) => {
  for (const line of lines) {
    const Model = productModel(line.productType);
    const [affected] = await Model.update(
      { stock: false },
      { where: { id: line.productId, stock: true }, transaction },
    );

    if (affected === 0) {
      throw new HttpError(
        409,
        `"${line.title}" se agotó mientras completabas la compra`,
      );
    }
  }
};

// Detecta productos del pedido que ya no estan disponibles cuando entra el
// pago. Con stock booleano un pago aprobado devuelve el producto al catalogo
// (restoreOrderStock); si el administrador lo habia marcado agotado, esa
// marca se perderia en silencio. Esto lo convierte en una alerta visible.
//
// Con la reserva activa no hay nada que detectar: el propio pedido dejo el
// stock en false al reservarlo.
const detectStockConflicts = async (order, transaction) => {
  if (STOCK_RESERVATION_ENABLED) return [];

  const items = await OrderItem.findAll({
    where: { orderId: order.id },
    transaction,
  });

  const conflicts = [];

  for (const item of items) {
    const Model = productModel(item.productType);
    const producto = await Model.findByPk(item.productId, {
      transaction,
      attributes: ["id", "stock"],
    });

    if (!producto) {
      conflicts.push({
        productType: item.productType,
        productId: item.productId,
        title: item.title,
        motivo: "eliminado",
      });
    } else if (!producto.stock) {
      conflicts.push({
        productType: item.productType,
        productId: item.productId,
        title: item.title,
        motivo: "agotado",
      });
    }
  }

  return conflicts;
};

// Libera las reservas vencidas (lazy: se ejecuta al crear un pedido).
// No hay cron en Vercel, por eso la expiracion se resuelve bajo demanda.
// Con la reserva desactivada no hay nada que liberar.
const releaseExpiredReservations = async (transaction) => {
  if (!STOCK_RESERVATION_ENABLED) return 0;

  const expired = await Order.findAll({
    where: {
      status: ORDER_STATUS.PENDIENTE_PAGO,
      stockReservedUntil: { [Op.ne]: null, [Op.lt]: new Date() },
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
    skipLocked: true,
  });

  for (const order of expired) {
    await releaseOrderStock(order, transaction);

    order.status = ORDER_STATUS.CANCELADO;
    order.cancelledAt = new Date();
    order.stockReservedUntil = null;
    await order.save({ transaction });

    await OrderStatusHistory.create(
      {
        orderId: order.id,
        kind: HISTORY_KIND.LOGISTICA,
        fromStatus: ORDER_STATUS.PENDIENTE_PAGO,
        toStatus: ORDER_STATUS.CANCELADO,
        note: "Reserva de stock expirada",
      },
      { transaction },
    );
  }

  return expired.length;
};

const ORDER_INCLUDE = [
  { model: OrderItem, as: "items" },
  { model: Payment, as: "payments" },
  { model: OrderStatusHistory, as: "history" },
];

const getOrderForUser = async ({ orderId, userId, admin = false, transaction }) => {
  assertUuid(orderId, "pedido");

  const order = await Order.findOne({
    where: admin ? { id: orderId } : { id: orderId, userId },
    include: ORDER_INCLUDE,
    ...(transaction ? { transaction } : {}),
    order: [
      [{ model: OrderItem, as: "items" }, "createdAt", "ASC"],
      [{ model: Payment, as: "payments" }, "createdAt", "DESC"],
      [{ model: OrderStatusHistory, as: "history" }, "createdAt", "ASC"],
    ],
  });

  if (!order) {
    throw new HttpError(404, "Pedido no encontrado");
  }

  // El comprador no necesita (ni debe ver) el payload crudo del proveedor de
  // pagos: puede contener datos tecnicos del medio de pago. El administrador
  // si lo ve en el panel.
  const json = order.toJSON();
  if (!admin) {
    json.payments = (json.payments || []).map(({ rawPayload, ...safe }) => safe);
  }
  return json;
};

// Filtro opcional por uno o varios estados: "pagado,enviado".
// Se descartan los valores desconocidos para no exponer errores de SQL.
const parseStatusFilter = (status) => {
  if (!status) return null;
  const lista = String(status)
    .split(",")
    .map((valor) => valor.trim())
    .filter((valor) => ORDER_STATUS_VALUES.includes(valor));
  return lista.length ? lista : null;
};

const listOrdersForUser = async ({
  userId,
  admin = false,
  limit = 20,
  offset = 0,
  status,
}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const statusFilter = parseStatusFilter(status);

  const where = admin ? {} : { userId };
  if (statusFilter) where.status = { [Op.in]: statusFilter };

  const { rows, count } = await Order.findAndCountAll({
    where,
    include: [{ model: OrderItem, as: "items" }],
    order: [["createdAt", "DESC"]],
    limit: safeLimit,
    offset: safeOffset,
    distinct: true,
  });

  return { orders: rows, total: count, limit: safeLimit, offset: safeOffset };
};

// Nucleo compartido de creacion de pedidos (checkout web y venta manual):
// precios y stock desde la BD, snapshot completo y reserva de stock.
const createOrderCore = async ({
  userId = null,
  items,
  shipping,
  notes,
  channel = SALE_CHANNEL.WEB,
  deliveryType = "envio",
  initialStatus = ORDER_STATUS.PENDIENTE_PAGO,
  initialPaymentStatus = PAYMENT_STATUS.PENDIENTE,
  paymentMethod = null,
  manualDiscount = 0,
  actorUserId = null,
  notify = true,
  manual = false,
}) => {
  const transaction = await sequelize.transaction();

  try {
    await releaseExpiredReservations(transaction);

    const isPickup = deliveryType === "pickup";
    const shippingData = manual
      ? validateManualShipping(shipping, { requireAddress: !isPickup })
      : validateShipping(shipping);

    const { lines, subtotal, discountTotal: computedDiscount } =
      await buildOrderLines(items, transaction, {
        // La franela solo se exige en el checkout web. Las ventas manuales del
        // administrador siguen aceptando el diseno como se registro antes.
        requireDtfShirt: !manual,
      });

    let shippingCost = 0;
    let shippingZone = null;

    if (!isPickup) {
      const quote = await quoteShipping({
        department: shippingData.department,
        city: shippingData.city,
        lat: shipping?.lat,
        lng: shipping?.lng,
        transaction,
      });
      shippingCost = quote.cost;
      shippingZone = quote.zone;
    }

    // Snapshot del plazo prometido. En recogida (pickup) no hay envio, por
    // eso queda null.
    const estimatedDeliveryDays = isPickup
      ? null
      : deliveryDaysForZone(shippingZone);

    // subtotal ya incluye los descuentos: unitPrice es el precio final.
    const discount = parseDiscount(manualDiscount, subtotal);
    const discountTotal = computedDiscount + discount;
    const total = subtotal - discount + shippingCost;

    // Un total de 0 es valido: un articulo al 100% (o un descuento manual que
    // cubre el subtotal sin envio) produce un pedido gratuito. No se cobra
    // online (Wompi no acepta 0) y se confirma a mano.
    if (total < 0) {
      throw new HttpError(400, "El total del pedido es inválido");
    }

    // La reserva de stock solo se aplica si esta habilitada. Con stock
    // booleano queda apagada (ver STOCK_RESERVATION_ENABLED).
    if (STOCK_RESERVATION_ENABLED) {
      await reserveOrderStock(lines, transaction);
    }

    const order = await Order.create(
      {
        orderNumber: await generateOrderNumber(transaction),
        userId: userId || null,
        channel,
        paymentMethod,
        status: initialStatus,
        paymentStatus: initialPaymentStatus,
        currency: "COP",
        subtotal,
        shippingCost,
        discountTotal,
        total,
        ...shippingData,
        notes: notes ? trim(notes).slice(0, 1000) : shippingData.notes,
        shippingZone,
        estimatedDeliveryDays,
        paymentApprovedAt:
          initialPaymentStatus === PAYMENT_STATUS.APROBADO ? new Date() : null,
        stockReservedUntil:
          STOCK_RESERVATION_ENABLED &&
          initialStatus === ORDER_STATUS.PENDIENTE_PAGO
            ? new Date(Date.now() + STOCK_RESERVATION_MINUTES * 60 * 1000)
            : null,
      },
      { transaction },
    );

    await OrderItem.bulkCreate(
      lines.map((line) => ({ ...line, orderId: order.id })),
      { transaction, validate: true },
    );

    await OrderStatusHistory.create(
      {
        orderId: order.id,
        kind: HISTORY_KIND.LOGISTICA,
        fromStatus: null,
        toStatus: initialStatus,
        changedByUserId: actorUserId,
        note: manual
          ? `Venta registrada manualmente (canal: ${channel}).`
          : STOCK_RESERVATION_ENABLED
            ? `Pedido creado. Stock reservado por ${STOCK_RESERVATION_MINUTES} minutos.`
            : "Pedido creado.",
      },
      { transaction },
    );

    if (manual && initialPaymentStatus === PAYMENT_STATUS.APROBADO) {
      // La venta manual nace pagada: se registra el pago en la tabla payments
      // (fuente unica de verdad, igual que Wompi mas adelante). registerPayment
      // escribe tambien el historial de pago y devuelve el stock al catalogo.
      const { registerPayment } = require("./payments.js");
      await registerPayment({
        orderId: order.id,
        status: PAYMENT_STATUS.APROBADO,
        paymentMethodType: paymentMethod,
        actorUserId,
        note: paymentMethod
          ? `Pago registrado manualmente (método: ${paymentMethod}).`
          : "Pago registrado manualmente.",
        transaction,
      });
    }

    const full = await getOrderForUser({
      orderId: order.id,
      userId,
      admin: !userId,
      transaction,
    });

    await transaction.commit();

    // Notificacion para el cliente (no bloquea si falla). Las ventas manuales
    // no tienen usuario de tienda, por eso se omiten.
    if (notify && userId) {
      try {
        const { createNotification } = require("./notifications.js");
        await createNotification({
          userId,
          tipo: "pedido",
          titulo: `Pedido ${full.orderNumber} registrado`,
          texto:
            "Recibimos tu pedido. Te contactaremos para coordinar el pago y la entrega.",
          to: `/dashboard/pedidos/${full.id}`,
          clave: `pedido:${full.id}:creado`,
        });
      } catch (error) {
        console.error(
          "No se pudo crear la notificación del pedido:",
          error.message,
        );
      }

      // Aviso al administrador por cada compra web. En bloque separado: si
      // la notificación al cliente falla, el admin igual se entera (y al
      // revés), y ninguna de las dos rompe la compra.
      try {
        const { notifyAdminsOfNewOrder } = require("./notifications.js");
        await notifyAdminsOfNewOrder(full);
      } catch (error) {
        console.error(
          "No se pudo avisar la compra al administrador:",
          error.message,
        );
      }
    }

    return full;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// Descuento a nivel de pedido (ventas manuales): entero en pesos, no puede
// superar el subtotal.
const parseDiscount = (value, subtotal) => {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new HttpError(400, "El descuento debe ser un entero en pesos");
  }
  if (parsed > subtotal) {
    throw new HttpError(400, "El descuento no puede superar el subtotal");
  }
  return parsed;
};

// Pedido creado desde el checkout web (mismo comportamiento de siempre).
const createOrder = ({ userId, items, shipping, notes }) =>
  createOrderCore({
    userId,
    items,
    shipping,
    notes,
    channel: SALE_CHANNEL.WEB,
    deliveryType: "envio",
    initialStatus: ORDER_STATUS.PENDIENTE_PAGO,
    initialPaymentStatus: PAYMENT_STATUS.PENDIENTE,
    notify: true,
    manual: false,
  });

// Venta externa registrada por un administrador (sin usuario de tienda).
const createManualOrder = async ({
  adminId,
  items,
  shipping,
  notes,
  channel,
  paymentMethod,
  paymentStatus,
  deliveryType,
  manualDiscount,
}) => {
  const safeChannel = SALE_CHANNEL_VALUES.includes(channel)
    ? channel
    : SALE_CHANNEL.PRESENCIAL;

  const safePaymentStatus = PAYMENT_STATUS_VALUES.includes(paymentStatus)
    ? paymentStatus
    : PAYMENT_STATUS.APROBADO;

  const safePaymentMethod =
    paymentMethod === null || paymentMethod === undefined || paymentMethod === ""
      ? null
      : String(paymentMethod);

  if (
    safePaymentMethod !== null &&
    !PAYMENT_METHOD_VALUES.includes(safePaymentMethod)
  ) {
    throw new HttpError(400, "Método de pago inválido");
  }

  const initialStatus =
    safePaymentStatus === PAYMENT_STATUS.APROBADO
      ? ORDER_STATUS.PAGADO
      : ORDER_STATUS.PENDIENTE_PAGO;

  return createOrderCore({
    userId: null,
    items,
    shipping,
    notes,
    channel: safeChannel,
    deliveryType: deliveryType === "pickup" ? "pickup" : "envio",
    initialStatus,
    initialPaymentStatus: safePaymentStatus,
    paymentMethod: safePaymentMethod,
    manualDiscount,
    actorUserId: adminId,
    notify: false,
    manual: true,
  });
};

// Cancela un pedido pendiente de pago y libera su stock.
const cancelOrder = async ({ orderId, user }) => {
  assertUuid(orderId, "pedido");

  const transaction = await sequelize.transaction();

  try {
    const order = await Order.findByPk(orderId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!order) {
      throw new HttpError(404, "Pedido no encontrado");
    }
    if (!user.admin && order.userId !== user.id) {
      throw new HttpError(403, "No tienes permisos sobre este pedido");
    }
    if (
      order.paymentStatus === PAYMENT_STATUS.APROBADO ||
      order.paymentStatus === PAYMENT_STATUS.REEMBOLSADO
    ) {
      throw new HttpError(409, "No se puede cancelar un pedido con pago aprobado");
    }
    if (order.status !== ORDER_STATUS.PENDIENTE_PAGO) {
      throw new HttpError(409, "Solo se pueden cancelar pedidos pendientes de pago");
    }

    await releaseOrderStock(order, transaction);

    order.status = ORDER_STATUS.CANCELADO;
    order.cancelledAt = new Date();
    order.stockReservedUntil = null;
    await order.save({ transaction });

    await OrderStatusHistory.create(
      {
        orderId: order.id,
        kind: HISTORY_KIND.LOGISTICA,
        fromStatus: ORDER_STATUS.PENDIENTE_PAGO,
        toStatus: ORDER_STATUS.CANCELADO,
        changedByUserId: user.id,
        note: user.admin ? "Cancelado por administrador" : "Cancelado por el cliente",
      },
      { transaction },
    );

    const full = await getOrderForUser({
      orderId: order.id,
      userId: order.userId,
      // Si quien cancela es un administrador ve el payload del proveedor;
      // si es el comprador, no.
      admin: Boolean(user.admin),
      transaction,
    });

    await transaction.commit();

    try {
      const { createNotification } = require("./notifications.js");
      await createNotification({
        userId: order.userId,
        tipo: "pedido",
        titulo: `Pedido ${full.orderNumber} cancelado`,
        texto:
          "Tu pedido fue cancelado. Si quieres, puedes volver a comprar cuando quieras.",
        to: `/dashboard/pedidos/${full.id}`,
        clave: `pedido:${full.id}:cancelado`,
      });
    } catch (error) {
      console.error(
        "No se pudo crear la notificación del pedido:",
        error.message,
      );
    }

    return full;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

module.exports = {
  createOrder,
  createManualOrder,
  cancelOrder,
  getOrderForUser,
  listOrdersForUser,
  releaseExpiredReservations,
  releaseOrderStock,
  restoreOrderStock,
  detectStockConflicts,
  validateShipping,
  validateManualShipping,
};
