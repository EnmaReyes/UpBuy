const { Op } = require("sequelize");
const {
  sequelize,
  Order,
  OrderItem,
  Payment,
  OrderStatusHistory,
  Product,
  Usuarios,
} = require("../DataBase/models/index.js");
const {
  FULFILLMENT_STATUS,
  FULFILLMENT_STATUS_VALUES,
  PAYMENT_STATE,
  PAYMENT_STATE_VALUES,
  PAYMENT_METHOD_CODE,
  COD_PAYMENT_METHOD_CODES,
  STATUS_SOURCE,
  PAYMENT_STATUS,
  PAYMENT_STATUS_VALUES,
  HISTORY_KIND,
  SALE_CHANNEL,
  SALE_CHANNEL_VALUES,
  PAYMENT_METHOD_VALUES,
  STOCK_RESERVATION_MINUTES,
  DELIVERY_DAYS,
} = require("../DataBase/models/enums.js");
const { buildOrderLines } = require("./pricing.js");
const {
  buildAddressSnapshot,
  applyAccountingTotals,
  transitionFulfillment,
} = require("./orderService.js");
const {
  FULFILLMENT_LABELS,
  PAYMENT_LABELS,
  userFacingMessage,
  canCustomerCancel,
} = require("./statusMachine.js");
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
  return `UPBUY-${new Date().getFullYear()}-${numero}`;
};

const productModel = () => Product;

// El stock son UNIDADES reales: reservar/librar mueve la cantidad, no un flag.
//
// El UPDATE es atomico y condicional (stock >= cantidad): si otro pedido se
// adelanto, `affected` es 0 y el pedido falla en lugar de vender de mas.

// Devuelve las unidades reservadas por un pedido (cancelacion o reserva
// vencida). Solo aplica si la reserva estuvo activa.
const releaseOrderStock = async (order, transaction) => {
  if (!STOCK_RESERVATION_ENABLED) return;

  const items = await OrderItem.findAll({
    where: { orderId: order.id },
    transaction,
  });

  for (const item of items) {
    const Model = productModel(item.productType);
    await sequelize.query(
      `UPDATE "products" SET stock = stock + :qty
        WHERE id = :id`,
      {
        replacements: { qty: Number(item.quantity) || 0, id: item.productId },
        transaction,
      },
    );
  }
};

// Confirma la venta cuando el pago se aprueba.
//
//   - Con la reserva ACTIVA las unidades YA se descontaron al crear el pedido,
//     asi que aqui no hay nada que hacer (no se pueden descontar dos veces).
//   - Sin reserva, este es el primer descuento real de stock (la venta ocurre
//     al aprobarse el pago).
const restoreOrderStock = async (order, transaction) => {
  if (STOCK_RESERVATION_ENABLED) return;

  const items = await OrderItem.findAll({
    where: { orderId: order.id },
    transaction,
  });

  for (const item of items) {
    const Model = productModel(item.productType);
    await Model.update(
      { stock: sequelize.literal(`GREATEST(stock - ${Number(item.quantity) || 0}, 0)`) },
      { where: { id: item.productId }, transaction },
    );
  }
};

// Reserva las unidades de cada producto del pedido dentro de la misma
// transaccion del checkout (control de sobreventa).
const reserveOrderStock = async (lines, transaction) => {
  for (const line of lines) {
    const qty = Number(line.quantity) || 0;
    const [affected] = await Product.update(
      { stock: sequelize.literal(`stock - ${qty}`) },
      {
        where: {
          id: line.productId,
          stock: { [Op.gte]: qty },
        },
        transaction,
      },
    );

    if (affected === 0) {
      throw new HttpError(
        409,
        `"${line.title}" se agotó mientras completabas la compra`,
      );
    }
  }
};

// Detecta productos del pedido que ya no tienen unidades cuando entra el
// pago. Sin reserva, el stock solo se descuenta al aprobar el pago: si otro
// pedido consumio las unidades, aqui queda una alerta visible en lugar de un
// stock negativo.
//
// Con la reserva activa no hay nada que detectar: el propio pedido ya dejo
// las unidades descontadas al reservarlas.
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
    } else if (Number(producto.stock) <= 0) {
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
      fulfillmentStatus: FULFILLMENT_STATUS.PENDING_PAYMENT,
      stockReservedUntil: { [Op.ne]: null, [Op.lt]: new Date() },
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
    skipLocked: true,
  });

  for (const order of expired) {
    await releaseOrderStock(order, transaction);

    order.fulfillmentStatus = FULFILLMENT_STATUS.CANCELLED;
    order.cancelledAt = new Date();
    order.stockReservedUntil = null;
    await order.save({ transaction });

    await OrderStatusHistory.create(
      {
        orderId: order.id,
        kind: HISTORY_KIND.LOGISTICA,
        fromStatus: FULFILLMENT_STATUS.PENDING_PAYMENT,
        toStatus: FULFILLMENT_STATUS.CANCELLED,
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
  // El backend decide si el pedido es cancelable; el front solo pinta el
  // boton. Asi la regla vive en un solo lugar.
  json.canCancel = canCustomerCancel(order);
  return json;
};

// Filtro opcional por uno o varios estados: "paid,shipped".
// Se descartan los valores desconocidos para no exponer errores de SQL.
const parseStatusFilter = (status) => {
  if (!status) return null;
  const lista = String(status)
    .split(",")
    .map((valor) => valor.trim())
    .filter((valor) => FULFILLMENT_STATUS_VALUES.includes(valor));
  return lista.length ? lista : null;
};

// Filtro opcional por estado del dinero: "unpaid,pending_collection".
const parsePaymentFilter = (paymentState) => {
  if (!paymentState) return null;
  const lista = String(paymentState)
    .split(",")
    .map((valor) => valor.trim())
    .filter((valor) => PAYMENT_STATE_VALUES.includes(valor));
  return lista.length ? lista : null;
};

const listOrdersForUser = async ({
  userId,
  admin = false,
  limit = 20,
  offset = 0,
  status,
  paymentState,
}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const statusFilter = parseStatusFilter(status);
  const paymentFilter = parsePaymentFilter(paymentState);

  const where = admin ? {} : { userId };
  if (statusFilter) where.fulfillmentStatus = { [Op.in]: statusFilter };
  if (paymentFilter) where.paymentState = { [Op.in]: paymentFilter };

  const { rows, count } = await Order.findAndCountAll({
    where,
    include: [{ model: OrderItem, as: "items" }],
    order: [["createdAt", "DESC"]],
    limit: safeLimit,
    offset: safeOffset,
    distinct: true,
  });

  // `canCancel` en cada fila para que el listado pueda ofrecer la accion sin
  // duplicar la regla en el front.
  const orders = rows.map((row) => ({
    ...row.toJSON(),
    canCancel: canCustomerCancel(row),
  }));

  return { orders, total: count, limit: safeLimit, offset: safeOffset };
};

// Nucleo compartido de creacion de pedidos (checkout web y venta manual):
// precios y stock desde la BD, snapshot completo y reserva de stock.
//
// Los estados que nacen son los canonicos: el pedido arranca en
// pending_payment / unpaid. Que se libere el cumplimiento (paid) o no
// depende de como se cobre: el pago online lo libera al confirmarse, el
// COD al confirmar el pedido (lo libera el courier).
const createOrderCore = async ({
  userId = null,
  items,
  shipping,
  notes,
  channel = SALE_CHANNEL.WEB,
  deliveryType = "envio",
  initialFulfillmentStatus = FULFILLMENT_STATUS.PENDING_PAYMENT,
  initialPaymentState = PAYMENT_STATE.UNPAID,
  paymentMethod = null,
  paymentMethodCode = null,
  provider = null,
  manualDiscount = 0,
  actorUserId = null,
  notify = true,
  manual = false,
  // Referencia externa (idempotencia de la importacion CSV).
  externalRef = null,
  // Costo proveedor del pedido (lo que UpBuy pago por el producto).
  providerCost = 0,
  // Guia y transportadora (importacion CSV de pedidos ya despachados).
  trackingNumber = null,
  trackingCarrier = null,
  // Fecha de la venta. Por defecto es el momento de la creacion.
  createdAt = null,
  // No reserva stock (importacion de ventas ya ocurridas).
  skipStockReservation = false,
  // Conserva tal cual el estado de cumplimiento recibido (importacion CSV):
  // un pago aprobado no debe promoverlo a "paid" por su cuenta.
  preserveFulfillmentStatus = false,
  // Nota que queda en el historial logistico.
  historyNote = null,
  // Opciones de construccion de lineas (importacion CSV).
  pricingOptions = {},
}) => {
  const transaction = await sequelize.transaction();

  try {
    await releaseExpiredReservations(transaction);

    const isPickup = deliveryType === "pickup";
    const shippingData = manual
      ? validateManualShipping(shipping, { requireAddress: !isPickup })
      : validateShipping(shipping);

    const { lines, subtotal, discountTotal: computedDiscount } =
      await buildOrderLines(items, transaction, pricingOptions);

    let shippingCost = 0;
    let shippingZone = "nacional";

    if (!isPickup) {
      // Tarifa de envío simple: zona nacional fija.
      // Se puede extender con cálculo por distancia desde la bodega.
      shippingCost = 0;
      shippingZone = "nacional";
    }

    // Snapshot del plazo prometido. En recogida (pickup) no hay envío, por
    // eso queda null. Zona nacional = 10 días hábiles.
    const estimatedDeliveryDays = isPickup
      ? null
      : DELIVERY_DAYS.NACIONAL;

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
    //
    // `skipStockEffects` la usa la importacion CSV: registra ventas que ya
    // ocurrieron, noeducta el inventario vigente del catalogo.
    if (STOCK_RESERVATION_ENABLED && !skipStockReservation) {
      await reserveOrderStock(lines, transaction);
    }

    // Marcas de tiempo segun el estado con el que nace el pedido.
    const shippedAt =
      initialFulfillmentStatus === FULFILLMENT_STATUS.SHIPPED ||
      initialFulfillmentStatus === FULFILLMENT_STATUS.DELIVERED
        ? createdAt || new Date()
        : null;
    const deliveredAt =
      initialFulfillmentStatus === FULFILLMENT_STATUS.DELIVERED
        ? createdAt || new Date()
        : null;
    const cancelledAt =
      initialFulfillmentStatus === FULFILLMENT_STATUS.CANCELLED
        ? createdAt || new Date()
        : null;

    const order = await Order.create(
      {
        orderNumber: await generateOrderNumber(transaction),
        userId: userId || null,
        channel,
        paymentMethod,
        paymentMethodCode,
        provider,
        externalRef: externalRef || null,
        providerCost: Number(providerCost) || 0,
        trackingNumber: trackingNumber || null,
        trackingCarrier: trackingCarrier || null,
        fulfillmentStatus: initialFulfillmentStatus,
        paymentState: initialPaymentState,
        currency: "COP",
        subtotal,
        shippingCost,
        discountTotal,
        total,
        ...shippingData,
        // Direccion congelada: el pedido no depende de que el usuario
        // cambie despues su direccion en el perfil.
        addressSnapshot: buildAddressSnapshot({
          ...shippingData,
          notes: notes ? trim(notes).slice(0, 1000) : shippingData.notes,
        }),
        notes: notes ? trim(notes).slice(0, 1000) : shippingData.notes,
        shippingZone,
        estimatedDeliveryDays,
        shippedAt,
        deliveredAt,
        cancelledAt,
        // La fecha de la venta: en la importacion CSV es la fecha del
        // archivo, no el momento de la importacion.
        ...(createdAt ? { createdAt, updatedAt: createdAt } : {}),
        paymentApprovedAt:
          initialPaymentState === PAYMENT_STATE.SETTLED
            ? createdAt || new Date()
            : null,
        stockReservedUntil:
          STOCK_RESERVATION_ENABLED &&
          !skipStockReservation &&
          initialFulfillmentStatus === FULFILLMENT_STATUS.PENDING_PAYMENT
            ? new Date(Date.now() + STOCK_RESERVATION_MINUTES * 60 * 1000)
            : null,
      },
      { transaction },
    );

    // Utilidad del pedido (subtotal + envio - costos del proveedor y la
    // pasarela). Se calcula en el servidor, nunca la manda el front.
    applyAccountingTotals(order);
    await order.save({ transaction });

    await OrderItem.bulkCreate(
      lines.map((line) => ({ ...line, orderId: order.id })),
      { transaction, validate: true },
    );

    await OrderStatusHistory.create(
      {
        orderId: order.id,
        kind: HISTORY_KIND.LOGISTICA,
        fromStatus: null,
        toStatus: initialFulfillmentStatus,
        changedByUserId: actorUserId,
        note: historyNote
          ? trim(historyNote).slice(0, 1000)
          : manual
            ? `Venta registrada manualmente (canal: ${channel}).`
            : STOCK_RESERVATION_ENABLED
              ? `Pedido creado. Stock reservado por ${STOCK_RESERVATION_MINUTES} minutos.`
              : "Pedido creado.",
      },
      { transaction },
    );

    const paymentStatusForState = PAYMENT_STATUS_BY_STATE[initialPaymentState];

    if (manual && paymentStatusForState) {
      // La venta manual nace con el dinero en algun punto del ciclo: se
      // registra el pago en la tabla payments (fuente unica de verdad, igual
      // que Wompi mas adelante). registerPayment escribe tambien el historial
      // de pago.
      const { registerPayment } = require("./payments.js");
      await registerPayment({
        orderId: order.id,
        status: paymentStatusForState,
        paymentMethodType: paymentMethod,
        actorUserId,
        note: paymentMethod
          ? `Pago registrado manualmente (método: ${paymentMethod}).`
          : "Pago registrado manualmente.",
        transaction,
        paymentState: initialPaymentState,
        skipStockEffects: skipStockReservation,
        promoteFulfillment: !preserveFulfillmentStatus,
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
          to: `/pedido/${full.id}`,
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

// Rellena los datos de envio que falten con el perfil y la direccion
// principal. El checkout puede mandar todo (invitado no: exige sesion) o solo
// los items y dejar que el servidor use lo que el comprador ya guardo.
const hydrateShippingFromProfile = async (userId, shipping = {}) => {
  if (!userId) return shipping;

  const { getDefaultAddress } = require("./addresses.js");
  const user = await Usuarios.findByPk(userId, {
    attributes: ["id", "name", "lastName", "email", "phone", "address"],
  });
  if (!user) return shipping;

  const address = await getDefaultAddress(userId);

  const fullName = [user.name, user.lastName].filter(Boolean).join(" ").trim();

  const pick = (value, fallback) => {
    const clean = trim(value);
    return clean || fallback || "";
  };

  return {
    ...shipping,
    recipientName: pick(
      shipping.recipientName || shipping.name,
      fullName,
    ),
    email: pick(shipping.email, user.email),
    phone: pick(shipping.phone, user.phone),
    address: pick(shipping.address, address?.address || user.address),
    city: pick(shipping.city, address?.city),
    department: pick(shipping.department, address?.department),
    postalCode: pick(shipping.postalCode, null),
    reference: pick(shipping.reference, address?.reference),
  };
};

// Pedido creado desde el checkout web.
//
// El metodo de pago lo elige el comprador:
//   - Wompi: nace pending_payment / unpaid. El webhook lo lleva a paid / settled.
//   - Contra entrega (COD): el cumplimiento se libera al confirmar (paid) y el
//     dinero entra al entregar (pending_collection). Ver statusMachine.js.
//
// Solo se aceptan los metodos que el checkout web puede ofrecer. Cualquier
// otro valor cae a Wompi en vez de guardar un codigo invalido en el pedido.
const WEB_PAYMENT_METHODS = [
  PAYMENT_METHOD_CODE.WOMPI,
  ...COD_PAYMENT_METHOD_CODES,
];

const createOrder = async ({
  userId,
  items,
  shipping,
  notes,
  paymentMethodCode = PAYMENT_METHOD_CODE.WOMPI,
  provider = null,
}) => {
  const filledShipping = await hydrateShippingFromProfile(userId, shipping);

  const code = WEB_PAYMENT_METHODS.includes(paymentMethodCode)
    ? paymentMethodCode
    : PAYMENT_METHOD_CODE.WOMPI;
  const isCod = COD_PAYMENT_METHOD_CODES.includes(code);

  return createOrderCore({
    userId,
    items,
    shipping: filledShipping,
    notes,
    channel: SALE_CHANNEL.WEB,
    deliveryType: "envio",
    initialFulfillmentStatus: isCod
      ? FULFILLMENT_STATUS.PAID
      : FULFILLMENT_STATUS.PENDING_PAYMENT,
    initialPaymentState: isCod
      ? PAYMENT_STATE.PENDING_COLLECTION
      : PAYMENT_STATE.UNPAID,
    paymentMethodCode: code,
    provider,
    notify: true,
    manual: false,
  });
};

// ---------------------------------------------------------------------------
// Previsualizacion de una venta manual (ADM-3).
//
// Calcula el total SIN escribir nada: es lo que el panel muestra mientras el
// administrador arma el pedido. El precio sale del catalogo (nunca del
// navegador) y aplican las mismas reglas de la creacion, para que lo que se ve
// sea lo que se guarda.
// ---------------------------------------------------------------------------
const previewManualOrder = async ({
  items,
  manualDiscount = 0,
  deliveryType = "envio",
  pricingOptions = {},
}) => {
  const { lines, subtotal, discountTotal: computedDiscount } =
    await buildOrderLines(items, undefined, pricingOptions);

  const discount = parseDiscount(manualDiscount, subtotal);
  const discountTotal = computedDiscount + discount;
  const shippingCost = 0;
  const total = subtotal - discount + shippingCost;

  if (total < 0) {
    throw new HttpError(400, "El total del pedido es inválido");
  }

  return {
    lines: lines.map((line) => ({
      productId: line.productId,
      title: line.title,
      size: line.size,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
    })),
    subtotal,
    shippingCost,
    discountTotal,
    total,
    currency: "COP",
    pickup: deliveryType === "pickup",
  };
};

// Estado canonico del dinero -> estado del intento de pago que lo registra.
// El pago es la fuente unica de verdad: cada estado canonico del dinero se
// apoya en una fila de la tabla payments.
//
// "pending_collection" y "unpaid" NO generan fila: el dinero todavia no se
// movio (es el caso de un COD por cobrar). Es el mismo criterio que usa el
// ciclo de vida de los pedidos de la tienda.
const PAYMENT_STATUS_BY_STATE = {
  [PAYMENT_STATE.SETTLED]: PAYMENT_STATUS.APROBADO,
  [PAYMENT_STATE.COLLECTED]: PAYMENT_STATUS.APROBADO,
  [PAYMENT_STATE.REFUNDED]: PAYMENT_STATUS.ANULADO,
};

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
  externalRef = null,
  providerCost = 0,
  initialFulfillmentStatus = null,
  initialPaymentState = null,
  trackingNumber = null,
  trackingCarrier = null,
  createdAt = null,
  historyNote = null,
  skipStockReservation = false,
  pricingOptions = {},
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

  // El pago ya esta: el cumplimiento se libera (paid) y el dinero esta
  // liquidado (settled). Si no, el pedido queda pendiente de pago.
  const yaEstaPagado = safePaymentStatus === PAYMENT_STATUS.APROBADO;

  // El importador CSV puede fijar los estados canonicos (trae la foto de una
  // venta que ya ocurrio). El panel manual usa los de aqui.
  const estados =
    initialFulfillmentStatus && initialPaymentState
      ? {
          fulfillmentStatus: initialFulfillmentStatus,
          paymentState: initialPaymentState,
          explicit: true,
        }
      : yaEstaPagado
        ? {
            fulfillmentStatus: FULFILLMENT_STATUS.PAID,
            paymentState: PAYMENT_STATE.SETTLED,
            explicit: false,
          }
        : {
            fulfillmentStatus: FULFILLMENT_STATUS.PENDING_PAYMENT,
            paymentState: PAYMENT_STATE.UNPAID,
            explicit: false,
          };

  const fulfillmentStatus = estados.fulfillmentStatus;
  const paymentState = estados.paymentState;

  if (!FULFILLMENT_STATUS_VALUES.includes(fulfillmentStatus)) {
    throw new HttpError(400, "Estado de cumplimiento inválido");
  }
  if (!PAYMENT_STATE_VALUES.includes(paymentState)) {
    throw new HttpError(400, "Estado de pago inválido");
  }

  return createOrderCore({
    userId: null,
    items,
    shipping,
    notes,
    channel: safeChannel,
    deliveryType: deliveryType === "pickup" ? "pickup" : "envio",
    initialFulfillmentStatus: fulfillmentStatus,
    initialPaymentState: paymentState,
    paymentMethod: safePaymentMethod,
    manualDiscount,
    externalRef,
    providerCost,
    trackingNumber,
    trackingCarrier,
    createdAt,
    historyNote,
    skipStockReservation,
    preserveFulfillmentStatus: Boolean(
      fulfillmentStatus && paymentState && estados.explicit,
    ),
    pricingOptions,
    actorUserId: adminId,
    notify: false,
    manual: true,
  });
};

// Cancela un pedido pendiente de pago y libera su stock.
// Solo el dueño: el administrador cancela desde el panel administrativo, que
// revalida su rol contra la base. Nunca se autoriza por un claim del JWT.
const cancelOrder = async ({ orderId, userId }) => {
  assertUuid(orderId, "pedido");
  assertUuid(userId, "usuario");

  const transaction = await sequelize.transaction();

  try {
    const order = await Order.findByPk(orderId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!order) {
      throw new HttpError(404, "Pedido no encontrado");
    }
    if (order.userId !== userId) {
      // 404 y no 403: no se revela la existencia de pedidos ajenos.
      throw new HttpError(404, "Pedido no encontrado");
    }
    if (
      order.paymentState === PAYMENT_STATE.SETTLED ||
      order.paymentState === PAYMENT_STATE.REFUNDED ||
      order.paymentState === PAYMENT_STATE.COLLECTED
    ) {
      throw new HttpError(409, "No se puede cancelar un pedido con pago aprobado o cobrado");
    }
    if (!canCustomerCancel(order)) {
      throw new HttpError(
        409,
        "Solo se pueden cancelar pedidos que aún no están en preparación",
      );
    }

    await releaseOrderStock(order, transaction);

    // El cliente cancela: no es un cambio del administrador, asi que no
    // bloquea el auto-sync (manualOverride).
    await transitionFulfillment({
      order,
      to: FULFILLMENT_STATUS.CANCELLED,
      transaction,
      actorUserId: userId,
      source: STATUS_SOURCE.CUSTOMER,
      note: "Cancelado por el cliente",
      audit: true,
    });

    order.stockReservedUntil = null;
    await order.save({ transaction });

    const full = await getOrderForUser({
      orderId: order.id,
      userId: order.userId,
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
        to: `/pedido/${full.id}`,
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

// Tracking publico: lo consulta el comprador (o quien tenga el enlace) sin
// iniciar sesion. Por eso NO devuelve la direccion, el correo ni el telefono:
// solo el estado, la guia y las fechas.
//
// Se exige que el telefono o el correo coincidan con el pedido. Sin eso, el
// id (que es un UUID) seria la unica barrera y cualquiera con el enlace veria
// el pedido de otra persona.
const getPublicTracking = async ({ orderId, phone, email }) => {
  assertUuid(orderId, "pedido");

  const order = await Order.findByPk(orderId, {
    attributes: [
      "id",
      "orderNumber",
      "fulfillmentStatus",
      "paymentState",
      "paymentMethodCode",
      "trackingCarrier",
      "trackingNumber",
      "trackingUrl",
      "estimatedDeliveryDays",
      "shippedAt",
      "deliveredAt",
      "cancelledAt",
      "createdAt",
      "phone",
      "email",
    ],
  });

  if (!order) {
    throw new HttpError(404, "Pedido no encontrado");
  }

  const digits = (value) => String(value || "").replace(/\D/g, "");
  const phoneOk =
    phone && digits(order.phone) && digits(phone).slice(-10) === digits(order.phone).slice(-10);
  const emailOk =
    email &&
    order.email &&
    String(email).trim().toLowerCase() === String(order.email).trim().toLowerCase();

  if (!phoneOk && !emailOk) {
    // Mismo 404 que "no existe": no se confirma si el pedido existe.
    throw new HttpError(404, "Pedido no encontrado");
  }

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentState: order.paymentState,
    fulfillmentLabel: FULFILLMENT_LABELS[order.fulfillmentStatus] || null,
    paymentLabel: PAYMENT_LABELS[order.paymentState] || null,
    message: userFacingMessage(order),
    tracking: {
      carrier: order.trackingCarrier,
      number: order.trackingNumber,
      url: order.trackingUrl,
    },
    estimatedDeliveryDays: order.estimatedDeliveryDays,
    dates: {
      createdAt: order.createdAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
    },
  };
};

module.exports = {
  createOrder,
  createManualOrder,
  previewManualOrder,
  cancelOrder,
  getOrderForUser,
  listOrdersForUser,
  getPublicTracking,
  releaseExpiredReservations,
  releaseOrderStock,
  restoreOrderStock,
  detectStockConflicts,
  validateShipping,
  validateManualShipping,
};
