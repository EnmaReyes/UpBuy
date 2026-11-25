// Orquestador: pago Wompi aprobado -> pedido creado en MasterShop.
//
// Flujo (Fase 4):
//   1. Cargar la orden local por reference de Wompi (única).
//   2. Si ya tiene msIdOrder -> idempotente, no hacer nada.
//   3. Resolver cada item -> id_product/id_variant (Fase 1).
//      Si falta algun mapeo -> no crear pedido parcial;
//      marcar la orden como mastershop_sync_failed y alertar.
//   4. Construir payload y llamar createOrder (Fase 2).
//   5. Guardar msIdOrder, msSyncedAt, msStatus en la orden.
//   6. Duplicado (Código 409) -> exito idempotente: recuperar con
//      GET /api/orders?externalOrderId=... y persistir ese idOrder.
//   7. Registrar el intento en mastershop_order_attempts (request/response
//      redactados).
//
// No crea el pedido dentro del webhook: el webhook de Wompi (Fase 3) solo
// encola una fila en mastershop_order_outbox. Esta se procesa desde aqui
// (llamada directa o via cron/endpoint en Fase 5).
const {
  Order,
  Payment,
  MastershopOrderOutbox,
  MastershopOrderAttempt,
} = require("../DataBase/models/index.js");
const { Op } = require("sequelize");
const {
  PAYMENT_STATUS,
} = require("../DataBase/models/enums.js");
const { resolveOrderItem } = require("./mastershopMapping.service.js");
const {
  buildOrderPayload,
  createOrder,
  getOrder,
} = require("../integrations/suppliers/mastershop/mastershop.orders.js");
const { createLogger } = require("../Utils/logger.js");

const log = createLogger("mastershop.orders.service");

// Estados de sincronizacion permitidos en orders.msSyncState.
const MS_SYNC_STATE = {
  PENDING: "pending",
  SYNCED: "synced",
  NEEDS_REVIEW: "needs_review",
  FAILED: "failed",
  DISABLED: "disabled",
};

// MasterShop exige country = CO y currency = COP para este pais.
const MASTERSHOP_COUNTRY = "CO";
const MASTERSHOP_CURRENCY = "COP";

// Confirmado contra la API real (2026-11-24): first_name/last_name NO admiten
// null ni cadena vacia; exigen "solo letras y espacios". UpBuy no captura el
// nombre separado, asi que se deriva del recipientName congelado. Si no hay
// nombre, queda vacio y MasterShop lo rechaza con 400 -> needs_review (alerta
// accionable), en vez de inventar un dato del cliente.
const splitName = (fullName) => {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return {
    first_name: parts[0] || "",
    last_name: parts.slice(1).join(" ") || parts[0] || "",
  };
};

// TODO: confirmar con api@mastershop.com cual de las opciones validas
// (`cod` | `pia`) corresponde a un pago online confirmado por Wompi. La API
// rechaza cualquier otro valor (incluido "Wompi"/"Tarjeta") con 400.
const MASTERSHOP_PAYMENT_METHOD = "pia";

// Umbral de alarma: si mas de este porcentaje de intentos fallan en la
// ventana, se loguea ERROR para que el operador revise el proveedor.
const FAILURE_RATE_THRESHOLD = 0.5;
const FAILURE_RATE_WINDOW_HOURS = 24;

// Campos que nunca deben grabarse en la bitacora de intentos (redaccion).
const REDACTED_KEYS = new Set(["ms-api-key", "authorization", "card", "cvv", "token"]);

const redactValue = (key, value) => {
  const k = String(key || "").toLowerCase();
  if (REDACTED_KEYS.has(k) || k.includes("apikey") || k.includes("api-key")) {
    return "[REDACTADO]";
  }
  if (k.includes("card") || k.includes("cvv") || k.includes("token")) {
    return "[REDACTADO]";
  }
  // Entrar en objetos/arrays anidados: un secreto puede venir mas adentro.
  if (value && typeof value === "object") {
    return redactObject(value);
  }
  return value;
};

const redactObject = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactObject);
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = redactValue(key, value);
  }
  return result;
};

// ---------------------------------------------------------------------------
// Mapeo de datos de UpBuy al contrato de MasterShop
// ---------------------------------------------------------------------------

// Convierte el addressSnapshot congelado de la orden a las 11 llaves que
// MasterShop exige (pueden ser null, nunca ausentes).
const mapAddress = (snapshot = {}) => {
  const names = splitName(snapshot.recipientName);
  return {
    zip: snapshot.postalCode || null,
    country: MASTERSHOP_COUNTRY,
    city: snapshot.city || null,
    address1: snapshot.address || null,
    address2: null,
    full_name: snapshot.recipientName || null,
    first_name: names.first_name,
    last_name: names.last_name,
    phone: snapshot.phone || null,
    company: null,
    state: snapshot.department || null,
    district: null,
  };
};

// Datos del comprador. documentType/documentNumber no se capturan hoy:
// MasterShop acepta ambos o ninguno, asi que van null/null.
const mapCustomer = (snapshot = {}) => {
  const fullName = snapshot.recipientName || null;
  const names = splitName(fullName);
  return {
    full_name: fullName,
    first_name: names.first_name,
    last_name: names.last_name,
    phone: snapshot.phone || null,
    email: snapshot.email || null,
    documentType: null,
    documentNumber: null,
    tags: ["upbuy", "wompi"],
  };
};

// Resuelve cada OrderItem a id_product/id_variant de MasterShop.
// Devuelve { ok, items[], failedItems[] }.
const resolveOrderItems = async (orderItems) => {
  const items = [];
  const failedItems = [];

  for (const item of orderItems) {
    const resolution = await resolveOrderItem({ orderItem: item });
    if (!resolution.ok) {
      failedItems.push({
        itemId: item.id,
        title: item.title,
        size: item.size,
        shirtColor: item.shirtColor,
        reason: resolution.reason,
        candidates: resolution.candidates || [],
      });
      continue;
    }

    items.push({
      id_product: resolution.idProduct,
      id_variant: resolution.idVariant,
      hasVariants: true,
      quantity: Number(item.quantity) || 1,
      sku: resolution.sku || item.providerSku || null,
      name: item.nameSnapshot || item.title || null,
      // La API real exige peso > 0. La Fase 1 guarda el peso de la variante
      // en rawData; se usa ese, con un minimo seguro si el proveedor lo manda
      // en 0 (por ejemplo la variante por defecto).
      weight: Math.max(
        Number(resolution.variation?.rawData?.weight) ||
          Number(resolution.variation?.weight) ||
          0.01,
        0.01,
      ),
      price: Number(item.unitPrice) || 0,
    });
  }

  return { ok: failedItems.length === 0, items, failedItems };
};

// ---------------------------------------------------------------------------
// Registro de intento (bitacora)
// ---------------------------------------------------------------------------

const recordAttempt = async ({
  orderId,
  attempt,
  action,
  ok,
  httpStatus,
  retryable,
  error,
  msIdOrder,
  requestPayload,
  responseBody,
  durationMs,
}) => {
  await MastershopOrderAttempt.create({
    orderId,
    attempt,
    action,
    ok,
    httpStatus,
    retryable: Boolean(retryable),
    error: error ? String(error).slice(0, 2000) : null,
    msIdOrder,
    requestPayload: redactObject(requestPayload || {}),
    responseBody: redactObject(responseBody || {}),
    durationMs,
  });
};

// ---------------------------------------------------------------------------
// Orquestador principal: syncPaidOrderToMastershop(reference)
// ---------------------------------------------------------------------------

// reference: payment.reference de Wompi (unica por intento de pago).
const syncPaidOrderToMastershop = async (reference) => {
  const startedAt = Date.now();
  const correlationId = String(reference || "").slice(0, 120);

  if (!reference) {
    throw new Error("Falta la reference de Wompi");
  }

  // 1. Cargar el pago por reference (única en Wompi).
  const payment = await Payment.findOne({
    where: { provider: "wompi", reference },
  });

  if (!payment) {
    log.error("Orden no encontrada para la reference de Wompi", {
      correlationId,
      reference,
    });
    throw new Error(`No existe pago de Wompi con reference ${reference}`);
  }

  // 2. Cargar la orden con sus items.
  const order = await Order.findByPk(payment.orderId, {
    include: [{ model: require("../DataBase/models/index.js").OrderItem, as: "items" }],
  });
  if (!order) {
    log.error("Orden local inexistente para el pago", {
      correlationId,
      reference,
      orderId: payment.orderId,
    });
    throw new Error(`Orden local inexistente para la reference ${reference}`);
  }

  // Idempotencia: ya se sincronizo con MasterShop.
  if (order.msIdOrder) {
    log.info("Pedido ya sincronizado con MasterShop", {
      correlationId,
      reference,
      orderId: order.id,
      msIdOrder: order.msIdOrder,
    });
    return {
      ok: true,
      idempotent: true,
      idOrder: order.msIdOrder,
      orderId: order.id,
      reason: "ya_sincronizado",
    };
  }

  // Solo crear pedido si el pago esta aprobado.
  if (payment.status !== PAYMENT_STATUS.APROBADO) {
    log.warn("Pago no aprobado, no se crea pedido en MasterShop", {
      correlationId,
      reference,
      orderId: order.id,
      paymentStatus: payment.status,
      wompiStatus: payment.wompiStatus,
    });
    return {
      ok: false,
      idOrder: null,
      orderId: order.id,
      reason: `pago_no_aprobado:${payment.status}`,
    };
  }

  // 3. Resolver items a id_product/id_variant (Fase 1).
  const orderItems = order.items || [];
  const resolution = await resolveOrderItems(orderItems);

  if (!resolution.ok) {
    // No crear pedido parcial: marcar la orden para revision manual.
    await order.update({
      msSyncState: MS_SYNC_STATE.NEEDS_REVIEW,
      msSyncError: JSON.stringify({
        motivo: "faltan_mapeos_de_variante",
        itemsSinResolver: resolution.failedItems,
      }),
    });

    // Reactivar outbox como needs_review para que quede rastro accionable.
    await MastershopOrderOutbox.update(
      { status: "needs_review", lastError: "Faltan mapeos de variante" },
      { where: { orderId: order.id } },
    );

    const attemptNumber = await nextAttemptNumber(order.id);
    await recordAttempt({
      orderId: order.id,
      attempt: attemptNumber,
      action: "create",
      ok: false,
      httpStatus: 400,
      retryable: false,
      error: "Faltan mapeos de variante para todos los items",
      requestPayload: { orderId: order.id, reference, orderNumber: order.orderNumber },
      responseBody: {
        error: "Faltan mapeos de variante",
        failedItems: resolution.failedItems,
      },
      durationMs: Date.now() - startedAt,
    });

    log.error("Faltan mapeos de variante: pedido no creado", {
      correlationId,
      reference,
      orderId: order.id,
      failedItems: resolution.failedItems,
    });

    return {
      ok: false,
      idOrder: null,
      orderId: order.id,
      reason: "faltan_mapeos_de_variante",
      failedItems: resolution.failedItems,
    };
  }

  // 4. Construir payload (Fase 2).
  const snapshot = order.addressSnapshot || {};
  const input = {
    idOrder: order.orderNumber,
    shippingAddress: mapAddress(snapshot),
    billingAddress: mapAddress(snapshot),
    orderTransaction: {
      total: Number(order.total) || 0,
      currency: MASTERSHOP_CURRENCY,
      // Solo `cod` | `pia` son validos (confirmado contra la API real).
      payment_method: MASTERSHOP_PAYMENT_METHOD,
      payment_gateway: "Wompi",
    },
    customer: mapCustomer(snapshot),
    orderItems: resolution.items,
    additionalCharge: [],
    notes: snapshot.notes ? [snapshot.notes] : [],
    tags: ["upbuy", "wompi"],
  };

  const { payload, errors } = buildOrderPayload(input);
  if (errors.length > 0) {
    await order.update({
      msSyncState: MS_SYNC_STATE.NEEDS_REVIEW,
      msSyncError: JSON.stringify({ motivo: "error_de_validacion_de_payload", errors }),
    });
    await MastershopOrderOutbox.update(
      { status: "needs_review", lastError: "Error de validacion de payload" },
      { where: { orderId: order.id } },
    );
    const attemptNumber = await nextAttemptNumber(order.id);
    await recordAttempt({
      orderId: order.id,
      attempt: attemptNumber,
      action: "create",
      ok: false,
      httpStatus: 400,
      retryable: false,
      error: "Error de validacion de payload",
      requestPayload: input,
      responseBody: { errors },
      durationMs: Date.now() - startedAt,
    });
    log.error("Payload invalido para MasterShop", {
      correlationId,
      reference,
      orderId: order.id,
      errors,
    });
    return {
      ok: false,
      idOrder: null,
      orderId: order.id,
      reason: "payload_invalido",
      errors,
    };
  }

  // 5. Llamar a MasterShop.
  let createResult;
  try {
    createResult = await createOrder(payload, {
      correlationId: order.id,
      reference,
    });
  } catch (error) {
    // Excepcion no controlada del cliente: tratar como fallo de red.
    createResult = {
      ok: false,
      idOrder: null,
      status: "unexpected_error",
      raw: null,
      retryable: true,
      error: error.message,
    };
  }

  const durationMs = Date.now() - startedAt;
  const attemptNumber = await nextAttemptNumber(order.id);

  // 6. Procesar el resultado.
  if (createResult.ok) {
    let idOrder = createResult.idOrder;
    let action = "create";

    // Duplicado (Código 409): tratar como exito idempotente y recuperar
    // el idOrder real de MasterShop via externalOrderId.
    if (createResult.status === "duplicate" || createResult.idempotent) {
      action = "recover";
      const existing = await getOrder({ externalOrderId: reference });
      if (existing && existing.idOrder) {
        idOrder = Number(existing.idOrder);
        log.info("Duplicado resuelto: idOrder recuperado de MasterShop", {
          correlationId,
          reference,
          orderId: order.id,
          recoveredIdOrder: idOrder,
        });
      } else {
        log.warn("Duplicado pero no se pudo recuperar idOrder de MasterShop", {
          correlationId,
          reference,
          orderId: order.id,
        });
      }
    }

    await order.update({
      msIdOrder: idOrder || null,
      msExternalOrderId: reference,
      msSyncedAt: new Date(),
      msStatus: createResult.status || null,
      msSyncState: idOrder ? MS_SYNC_STATE.SYNCED : MS_SYNC_STATE.NEEDS_REVIEW,
      msSyncError: idOrder ? null : "No se pudo recuperar idOrder despues del duplicado",
    });

    await MastershopOrderOutbox.update(
      {
        status: idOrder ? "done" : "needs_review",
        lastError: idOrder ? null : "idOrder no recuperado tras duplicado",
      },
      { where: { orderId: order.id } },
    );

    await recordAttempt({
      orderId: order.id,
      attempt: attemptNumber,
      action,
      ok: Boolean(idOrder),
      httpStatus: createResult.ok ? 200 : null,
      retryable: false,
      error: idOrder ? null : createResult.raw
        ? String(createResult.raw.error || createResult.raw.message || "").slice(0, 2000)
        : null,
      msIdOrder: idOrder || null,
      requestPayload: payload,
      responseBody: createResult.raw || {},
      durationMs,
    });

    return {
      ok: Boolean(idOrder),
      idempotent: Boolean(createResult.idempotent),
      idOrder,
      orderId: order.id,
      reason: idOrder ? "creado" : "sin_id_order",
    };
  }

  // Fallo no exito: registrar y marcar la orden.
  let httpStatus = null;
  let retryable = false;
  let newSyncState = MS_SYNC_STATE.FAILED;
  let outboxStatus = "failed";

  if (createResult.status === "config_error") {
    httpStatus = 401;
    retryable = false;
    newSyncState = MS_SYNC_STATE.FAILED;
    outboxStatus = "failed";
  } else if (createResult.status === "rejected") {
    httpStatus = 400;
    retryable = false;
    newSyncState = MS_SYNC_STATE.NEEDS_REVIEW;
    outboxStatus = "needs_review";
  } else if (createResult.retryable) {
    httpStatus = 500;
    retryable = true;
    newSyncState = MS_SYNC_STATE.FAILED;
    outboxStatus = "failed"; // se reintentara desde el outbox/cron
  } else {
    httpStatus = 500;
    retryable = false;
    newSyncState = MS_SYNC_STATE.FAILED;
    outboxStatus = "failed";
  }

  await order.update({
    msSyncState: newSyncState,
    msSyncError: JSON.stringify({
      motivo: createResult.status || "error_desconocido",
      detalle: createResult.raw
        ? String(createResult.raw.error || createResult.raw.message || "").slice(0, 2000)
        : null,
    }),
  });

  await MastershopOrderOutbox.update(
    { status: outboxStatus, lastError: createResult.status || "error_desconocido" },
    { where: { orderId: order.id } },
  );

  await recordAttempt({
    orderId: order.id,
    attempt: attemptNumber,
    action: "create",
    ok: false,
    httpStatus,
    retryable,
    error: createResult.status || "error_desconocido",
    requestPayload: payload,
    responseBody: createResult.raw || {},
    durationMs,
  });

  log.error("Fallo creando pedido en MasterShop", {
    correlationId,
    reference,
    orderId: order.id,
    status: createResult.status,
    retryable,
  });

  // Alarma: tasa de fallos de creacion de pedidos por encima del umbral.
  await checkFailureRate();

  return {
    ok: false,
    idOrder: null,
    orderId: order.id,
    reason: createResult.status || "error_desconocido",
    retryable,
  };
};

// ---------------------------------------------------------------------------
// Procesador del outbox (Fase 4/5)
// ---------------------------------------------------------------------------

// Numero de siguiente intento para una orden.
const nextAttemptNumber = async (orderId) => {
  const last = await MastershopOrderAttempt.findOne({
    where: { orderId },
    order: [["attempt", "DESC"]],
  });
  return Number((last && last.attempt) || 0) + 1;
};

// Procesa las filas del outbox de MasterShop.
//
// Recoge:
//   1. Filas `pending` cuyo `nextAttemptAt` ya llego (o es null).
//   2. Filas `processing` atascadas (el proceso murio entre tomarlas y
//      terminarlas): se devuelven a `pending` para no perder el pedido.
//
// Reintentos con backoff SOLO para errores reintentables (5xx, 429, timeout,
// red): la fila vuelve a `pending` con un `nextAttemptAt` futuro. Los 400 de
// esquema y los 401/403 de configuracion NO se reintentan: van a `needs_review`
// / `failed` para revision manual.
const processMastershopOutbox = async ({ limit = 20 } = {}) => {
  const now = new Date();

  // 1. Recuperar filas atascadas en `processing` (>15 min sin avanzar).
  const staleLock = new Date(now.getTime() - 15 * 60 * 1000);
  await MastershopOrderOutbox.update(
    { status: "pending", lockedAt: null },
    { where: { status: "processing", lockedAt: { [Op.lte]: staleLock } } },
  );

  // 2. Tomar las pendientes listas para procesar.
  const rows = await MastershopOrderOutbox.findAll({
    where: {
      status: "pending",
      [Op.or]: [
        { nextAttemptAt: null },
        { nextAttemptAt: { [Op.lte]: now } },
      ],
    },
    order: [["nextAttemptAt", "ASC"], ["createdAt", "ASC"]],
    limit: Math.min(Math.max(Number(limit) || 1, 1), 100),
  });

  const results = [];

  for (const row of rows) {
    // Bloqueo optimista: marcar processing para evitar duplicidad entre
    // corridas concurrentes del cron.
    const attempts = (row.attempts || 0) + 1;
    const updated = await MastershopOrderOutbox.update(
      { status: "processing", lockedAt: new Date(), attempts },
      { where: { id: row.id, status: "pending" } },
    );
    if (!updated[0]) continue; // Otra instancia ya lo toma.

    let payment;
    try {
      payment = await Payment.findOne({
        where: { orderId: row.orderId, provider: "wompi", status: PAYMENT_STATUS.APROBADO },
      });
    } catch {
      // Se ignora: el intento abajo marcara error.
    }

    let result;
    if (!payment) {
      result = { ok: false, reason: "pago_wompi_no_aprobado_encontrado" };
    } else {
      result = await syncPaidOrderToMastershop(payment.reference).catch((error) => ({
        ok: false,
        reason: error.message,
        retryable: false,
      }));
    }

    // Sincronizar el estado del outbox con el resultado del servicio.
    if (result.ok && result.idOrder) {
      await row.update({ status: "done", lastError: null, lockedAt: null });
    } else if (
      result.reason === "faltan_mapeos_de_variante" ||
      result.reason === "payload_invalido" ||
      result.reason === "rejected"
    ) {
      // 400 de esquema o falta de mapeo: revision manual, no reintentar solo.
      await row.update({ status: "needs_review", lastError: result.reason, lockedAt: null });
    } else if (result.retryable) {
      // Reintentable: volver a `pending` con backoff exponencial + jitter.
      // Se mantiene en la cola para que el proximo cron lo retome.
      const baseMinutes = Math.min(2 ** attempts, 4 * 60); // tope 4 h
      const jitterMs = Math.floor(Math.random() * 60 * 1000);
      const nextAttempt = new Date(now.getTime() + baseMinutes * 60 * 1000 + jitterMs);
      await row.update({
        status: "pending",
        nextAttemptAt: nextAttempt,
        lastError: result.reason,
        lockedAt: null,
      });
    } else {
      // Fallo no reintentable (config 401/403, etc.).
      await row.update({ status: "failed", lastError: result.reason, lockedAt: null });
    }

    results.push({ orderId: row.orderId, ...result });
  }

  return { processed: results.length, results };
};

// Alarma: si la tasa de fallos de creacion de pedidos en MasterShop supera
// el umbral en la ventana de tiempo, se loguea ERROR para que el operador
// revise el proveedor (401/403 de llave, 5xx repetidos, etc.).
const checkFailureRate = async () => {
  const since = new Date(Date.now() - FAILURE_RATE_WINDOW_HOURS * 60 * 60 * 1000);
  const attempts = await MastershopOrderAttempt.findAll({
    where: { createdAt: { [Op.gte]: since } },
    attributes: ["ok", "httpStatus", "retryable"],
  });

  if (attempts.length === 0) return;

  const failures = attempts.filter((a) => !a.ok);
  const rate = failures.length / attempts.length;

  if (rate >= FAILURE_RATE_THRESHOLD) {
    const configErrors = failures.filter((a) => a.httpStatus === 401 || a.httpStatus === 403);
    log.error("Tasa de fallos de creacion de pedidos en MasterShop por encima del umbral", {
      windowHours: FAILURE_RATE_WINDOW_HOURS,
      total: attempts.length,
      failures: failures.length,
      rate: Number(rate.toFixed(2)),
      configErrors: configErrors.length, // 401/403 = problema de llave/configuracion
    });
  }
};

// ---------------------------------------------------------------------------
// Conciliacion (Fase 5)
// ---------------------------------------------------------------------------

// Lista los desajustes entre UpBuy y MasterShop para repararlos a mano.
//
//   - approvedWithoutMsOrder: pagos Wompi aprobados sin pedido en MasterShop
//     (deberia haberse creado). Es el sintoma mas grave: el comprador pago y
//     el pedido no existe en el proveedor.
//   - failedOrders: pedidos con msSyncState = failed (reintentos agotados).
//   - needsReviewOrders: pedidos con msSyncState = needs_review (falta mapeo
//     o MasterShop rechazo el esquema).
//   - stuckOutbox: filas del outbox en pending/processing viejas (el proceso
//     murio sin terminar). Se pueden reintentar.
//   - remoteWithoutLocal: pedidos que existen en MasterShop (ultimos 7 dias)
//     y cuyo externalOrderId no corresponde a ningun pago local. Requiere
//     `includeRemote: true` porque llama a la API (red).
//   - msStatusMismatch: pedidos locales ya sincronizados cuyo msStatus local
//     no coincide con el que reporta MasterShop. Requiere `includeRemote`.
const buildReconciliationReport = async ({
  includeRemote = false,
  limit = 500,
} = {}) => {
  const now = new Date();
  const generatedAt = now.toISOString();

  // Pagos Wompi aprobados cuyo pedido no tiene msIdOrder.
  const approvedPayments = await Payment.findAll({
    where: { provider: "wompi", status: PAYMENT_STATUS.APROBADO },
    order: [["createdAt", "DESC"]],
    limit,
  });

  const approvedOrderIds = [...new Set(approvedPayments.map((p) => p.orderId))];
  const approvedOrders = approvedOrderIds.length
    ? await Order.findAll({ where: { id: approvedOrderIds } })
    : [];
  const ordersById = new Map(approvedOrders.map((o) => [o.id, o]));

  const approvedWithoutMsOrder = approvedPayments
    .map((p) => ({ payment: p, order: ordersById.get(p.orderId) }))
    .filter(({ order }) => order && !order.msIdOrder)
    .map(({ payment, order }) => ({
      orderId: order.id,
      orderNumber: order.orderNumber,
      reference: payment.reference,
      paymentCreatedAt: payment.createdAt,
      msSyncState: order.msSyncState || null,
    }));

  // Pedidos que fallaron o quedaron para revision.
  const failedOrders = await Order.findAll({
    where: { msSyncState: MS_SYNC_STATE.FAILED },
    order: [["updatedAt", "DESC"]],
    limit,
  });
  const needsReviewOrders = await Order.findAll({
    where: { msSyncState: MS_SYNC_STATE.NEEDS_REVIEW },
    order: [["updatedAt", "DESC"]],
    limit,
  });

  const toOrderRef = (order) => ({
    orderId: order.id,
    orderNumber: order.orderNumber,
    msSyncState: order.msSyncState,
    msSyncError: order.msSyncError || null,
    msIdOrder: order.msIdOrder || null,
  });

  // Filas del outbox atascadas: pending/processing con mas de 1 hora.
  const staleLimit = new Date(now.getTime() - 60 * 60 * 1000);
  const stuckOutbox = await MastershopOrderOutbox.findAll({
    where: {
      status: ["pending", "processing"],
      updatedAt: { [Op.lte]: staleLimit },
    },
    order: [["updatedAt", "ASC"]],
    limit,
  });

  const report = {
    generatedAt,
    includeRemote: Boolean(includeRemote),
    approvedWithoutMsOrder,
    failedOrders: failedOrders.map(toOrderRef),
    needsReviewOrders: needsReviewOrders.map(toOrderRef),
    stuckOutbox: stuckOutbox.map((row) => ({
      orderId: row.orderId,
      status: row.status,
      attempts: row.attempts,
      nextAttemptAt: row.nextAttemptAt,
      lastError: row.lastError || null,
      updatedAt: row.updatedAt,
    })),
    remoteWithoutLocal: [],
    msStatusMismatch: [],
    remoteError: null,
  };

  // Comprobacion en vivo contra MasterShop (opcional: requiere red).
  if (includeRemote) {
    try {
      const { listOrders } = require("../integrations/suppliers/mastershop/mastershop.orders.js");
      const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const finalDate = now.toISOString().slice(0, 10);
      const remote = await listOrders({ page: 1, limit: 50, startDate, finalDate });
      const remoteOrders = Array.isArray(remote)
        ? remote
        : Array.isArray(remote?.results)
          ? remote.results
          : [];

      // externalOrderId -> pedido remoto
      const remoteByExternal = new Map();
      for (const order of remoteOrders) {
        if (order?.externalOrderId) {
          remoteByExternal.set(String(order.externalOrderId), order);
        }
      }

      // Pedidos locales ya sincronizados, para comparar msStatus.
      const synced = await Order.findAll({
        where: { msSyncState: MS_SYNC_STATE.SYNCED },
        limit,
      });
      const localExternal = new Set(
        synced.map((o) => o.msExternalOrderId).filter(Boolean),
      );

      for (const [externalOrderId, remoteOrder] of remoteByExternal) {
        if (!localExternal.has(externalOrderId)) {
          report.remoteWithoutLocal.push({
            externalOrderId,
            msIdOrder: remoteOrder.idOrder || null,
            status: remoteOrder.status || null,
          });
        }
      }

      for (const order of synced) {
        const remoteOrder = order.msExternalOrderId
          ? remoteByExternal.get(String(order.msExternalOrderId))
          : null;
        if (!remoteOrder) continue;
        if (remoteOrder.status && remoteOrder.status !== order.msStatus) {
          report.msStatusMismatch.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            msIdOrder: order.msIdOrder,
            localStatus: order.msStatus,
            remoteStatus: remoteOrder.status,
          });
        }
      }
    } catch (error) {
      report.remoteError = error.message;
    }
  }

  return report;
};

module.exports = {
  syncPaidOrderToMastershop,
  processMastershopOutbox,
  checkFailureRate,
  buildReconciliationReport,
  MS_SYNC_STATE,
  mapAddress,
  mapCustomer,
  redactObject,
};
