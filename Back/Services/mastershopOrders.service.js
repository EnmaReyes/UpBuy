// Orquestador: pago confirmado -> pedido creado en MasterShop.
//
// El origen del pago NO tiene que ser Wompi: una venta manual, una
// transferencia o un COD recaudado tambien encolan. Lo unico que importa es
// que el pedido este pagado y que todos sus items ruteen a MasterShop.
//
// Flujo (Fase 4):
//   1. Cargar la orden local (por reference de Wompi o por id).
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
  OrderItem,
  Payment,
  MastershopOrderOutbox,
  MastershopOrderAttempt,
} = require("../DataBase/models/index.js");
const { Op } = require("sequelize");
const {
  PAYMENT_STATUS,
  PAYMENT_STATE,
  FULFILLMENT_STATUS,
  SUPPLIER_SLUG,
} = require("../DataBase/models/enums.js");
const { resolveOrderItem } = require("./mastershopMapping.service.js");
const { resolveOrderProvider } = require("./orders/providerRouting.service.js");
const {
  buildOrderPayload,
  createOrder,
  cancelOrder,
  getOrder,
  MASTERSHOP_ORDER_STATUS,
} = require("../integrations/suppliers/mastershop/mastershop.orders.js");
const HttpError = require("../Utils/HttpError.js");
const { assertUuid } = require("../Utils/ids.js");
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

// Estado del push de cancelacion a MasterShop (orders.msCancelState).
//   pending -> hay que reintentar (fallo transitorio)
//   done    -> MasterShop confirmo la cancelacion
//   failed  -> fallo definitivo (400 de esquema, 404, llave): no se reintenta
const MS_CANCEL_STATE = {
  PENDING: "pending",
  DONE: "done",
  FAILED: "failed",
};

// Tope de reintentos automaticos del push de cancelacion. Un fallo
// reintentable (5xx, 429, red) se reintenta desde el cron hasta este tope;
// despues queda `failed` para revision manual (nunca se reintenta sin fin).
const MAX_CANCEL_ATTEMPTS = 5;

// MasterShop exige country = CO y currency = COP para este pais.
const MASTERSHOP_COUNTRY = "CO";
const MASTERSHOP_CURRENCY = "COP";

// Deja SOLO letras (incl. acentos y ñ) y espacios: MasterShop rechaza digitos
// y simbolos en los nombres con 400. Los caracteres invalidos se reemplazan
// por espacio para no pegar palabras ("Juan123Perez" -> "Juan Perez").
const sanitizeName = (value) => {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
};

// Confirmado contra la API real (2026-11-24): first_name/last_name NO admiten
// null ni cadena vacia; exigen "solo letras y espacios". UpBuy no captura el
// nombre separado, asi que se deriva del recipientName congelado (ya saneado).
// Si no hay nombre, queda vacio y MasterShop lo rechaza con 400 ->
// needs_review (alerta accionable), en vez de inventar un dato del cliente.
const splitName = (fullName) => {
  const parts = sanitizeName(fullName).split(/\s+/).filter(Boolean);
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
    full_name: sanitizeName(snapshot.recipientName) || null,
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
  const fullName = sanitizeName(snapshot.recipientName) || null;
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

    const hasVariant =
      resolution.idVariant !== null && resolution.idVariant !== undefined;

    items.push({
      id_product: resolution.idProduct,
      // Sin variaciones vendibles se omite `id_variant` y `hasVariants` es
      // false; MasterShop acepta el pedido solo con `id_product`.
      ...(hasVariant ? { id_variant: resolution.idVariant } : {}),
      hasVariants: hasVariant,
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
// Carga y estado de pago
// ---------------------------------------------------------------------------

const loadOrderWithItems = (orderId) =>
  Order.findByPk(orderId, {
    include: [{ model: OrderItem, as: "items" }],
  });

// Un pedido esta pagado cuando el dinero ya ingreso: liquidado (Wompi,
// transferencia, Nequi...) o recaudado (COD entregado). Es la condicion para
// crear el pedido en el proveedor, sin importar quien lo cobro.
const isOrderPaid = (order) =>
  [PAYMENT_STATE.SETTLED, PAYMENT_STATE.COLLECTED].includes(order.paymentState);

// ---------------------------------------------------------------------------
// Encolado: todos los origenes de pago
// ---------------------------------------------------------------------------

// Deja una fila `pending` en el outbox para un pedido ya pagado que rutea a
// MasterShop. No llama a la API: el cron (`processMastershopOutbox`) hace el
// POST. Es idempotente y respeta un pedido ya creado o cancelado.
//
// Lo llaman: la venta manual del panel, el registro de pagos y el cambio de
// estado a pagado. Wompi sigue encolando desde su webhook.
const enqueueMastershopOrderIfNeeded = async ({ orderId } = {}) => {
  assertUuid(orderId, "pedido");

  const order = await loadOrderWithItems(orderId);
  if (!order) return { enqueued: false, reason: "pedido_no_encontrado" };

  if (order.fulfillmentStatus === FULFILLMENT_STATUS.CANCELLED) {
    return { enqueued: false, reason: "pedido_cancelado" };
  }
  if (order.msIdOrder) {
    return {
      enqueued: false,
      reason: "ya_sincronizado",
      idOrder: order.msIdOrder,
    };
  }
  if (!isOrderPaid(order)) {
    return {
      enqueued: false,
      reason: `pedido_no_pagado:${order.paymentState || "sin_estado"}`,
    };
  }

  const routing = await resolveOrderProvider(order.items || []);
  if (!routing.ok) {
    return {
      enqueued: false,
      reason: routing.reason,
      provider: routing.provider || null,
    };
  }
  if (routing.provider !== SUPPLIER_SLUG.MASTERSHOP) {
    return {
      enqueued: false,
      reason: "otro_proveedor",
      provider: routing.provider,
    };
  }

  const [row, created] = await MastershopOrderOutbox.findOrCreate({
    where: { orderId: order.id },
    defaults: { status: "pending", attempts: 0 },
  });

  // Una fila `processing` la esta tomando el cron ahora mismo: no se toca.
  // Una fila `done` ya se proceso (o se cerro por cancelacion): no se reabre
  // sola; el reintento explicito del panel es el unico camino.
  if (!created && row.status === "processing") {
    return { enqueued: false, reason: "en_proceso" };
  }
  if (!created && row.status === "done") {
    return { enqueued: false, reason: "outbox_cerrado" };
  }
  if (!created) {
    await row.update({
      status: "pending",
      attempts: 0,
      nextAttemptAt: null,
      lockedAt: null,
      lastError: null,
    });
  }

  await order.update({
    msSyncState: MS_SYNC_STATE.PENDING,
    msSyncError: null,
  });

  log.info("Pedido encolado para MasterShop", {
    orderId: order.id,
    orderNumber: order.orderNumber,
    outbox: created ? "nueva" : "reactivada",
  });

  return { enqueued: true, reason: "encolado", orderId: order.id };
};

// ---------------------------------------------------------------------------
// Orquestador principal: syncPaidOrderToMastershop(reference)
// ---------------------------------------------------------------------------

// Nucleo compartido: crea el pedido en MasterShop para una orden ya pagada.
// `reference` es la reference de Wompi cuando existe; en ventas manuales se usa
// el orderNumber solo para trazabilidad (logs y cabecera de correlacion).
const createMastershopOrder = async ({ order, reference }) => {
  const startedAt = Date.now();
  const correlationId = String(reference || order.orderNumber || order.id).slice(0, 120);

  // Un pedido cancelado en UpBuy no debe nacer en MasterShop: se evita
  // despachar algo que el negocio (o el comprador) ya anulo. El outbox lo
  // cierra como `done` en processMastershopOutbox.
  if (order.fulfillmentStatus === FULFILLMENT_STATUS.CANCELLED) {
    log.info("Pedido cancelado: no se crea en MasterShop", {
      correlationId,
      reference,
      orderId: order.id,
    });
    return {
      ok: false,
      skipped: true,
      orderId: order.id,
      reason: "pedido_cancelado",
    };
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
  // MasterShop exige total = Σ(price×qty) + Σ(additional_charge.value). El
  // subtotal de UpBuy ya es Σ(unitPrice×qty); el envio debe viajar aqui para
  // que el total cuadre. El descuento manual no es representable (los cargos
  // no pueden ser negativos): si existiera, el payload no cuadraria y el
  // pedido iria a needs_review en vez de enviar un total incorrecto.
  const shippingCost = Number(order.shippingCost) || 0;
  const additionalCharge = shippingCost > 0
    ? [{ type_charge: "shipping", value: shippingCost }]
    : [];

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
    additionalCharge,
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
    // el idOrder real de MasterShop via externalOrderId. El externalOrderId
    // que MasterShop guarda es el `id_order` enviado (= order.orderNumber),
    // NO la reference de Wompi.
    if (createResult.status === "duplicate" || createResult.idempotent) {
      action = "recover";
      const existing = await getOrder({ externalOrderId: order.orderNumber });
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
      // El externalOrderId es el `id_order` que se manda a MasterShop; coincide
      // con orderNumber (la reference de Wompi es otra cosa y va en Payment).
      msExternalOrderId: order.orderNumber,
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

    // Carrera creacion/cancelacion: si el pedido se cancelo mientras se
    // creaba en MasterShop, ya existe alla y hay que cancelarlo. Se relee para
    // no confiar en el estado que se cargo antes del POST.
    if (idOrder) {
      try {
        const fresh = await Order.findByPk(order.id);
        if (fresh && fresh.fulfillmentStatus === FULFILLMENT_STATUS.CANCELLED) {
          await cancelMastershopOrder({ orderId: order.id });
        }
      } catch (error) {
        log.error("No se pudo cancelar en MasterShop tras crearlo (carrera)", {
          orderId: order.id,
          error: error.message,
        });
      }
    }

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

// Compatibilidad: entrada por reference de Wompi (webhook y outbox historico).
const syncPaidOrderToMastershop = async (reference) => {
  if (!reference) {
    throw new Error("Falta la reference de Wompi");
  }

  const payment = await Payment.findOne({
    where: { provider: "wompi", reference },
  });
  if (!payment) {
    log.error("Orden no encontrada para la reference de Wompi", { reference });
    throw new Error(`No existe pago de Wompi con reference ${reference}`);
  }

  const order = await loadOrderWithItems(payment.orderId);
  if (!order) {
    log.error("Orden local inexistente para el pago", {
      reference,
      orderId: payment.orderId,
    });
    throw new Error(`Orden local inexistente para la reference ${reference}`);
  }

  // Solo crear pedido si el pago esta aprobado.
  if (payment.status !== PAYMENT_STATUS.APROBADO) {
    log.warn("Pago no aprobado, no se crea pedido en MasterShop", {
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

  return createMastershopOrder({ order, reference });
};

// Entrada por id de pedido: sirve para cualquier origen de pago (venta
// manual, transferencia, Nequi, COD recaudado). Exige que el pedido este
// pagado; no depende de que exista un pago de Wompi.
const syncOrderToMastershopByOrderId = async (orderId) => {
  assertUuid(orderId, "pedido");

  const order = await loadOrderWithItems(orderId);
  if (!order) {
    throw new Error(`Orden local inexistente: ${orderId}`);
  }

  if (!isOrderPaid(order)) {
    await order
      .update({
        msSyncState: MS_SYNC_STATE.NEEDS_REVIEW,
        msSyncError: JSON.stringify({
          motivo: "pedido_no_pagado",
          paymentState: order.paymentState || null,
        }),
      })
      .catch(() => {});
    return {
      ok: false,
      idOrder: null,
      orderId: order.id,
      reason: `pedido_no_pagado:${order.paymentState || "sin_estado"}`,
      retryable: false,
    };
  }

  return createMastershopOrder({ order, reference: order.orderNumber });
};

// ---------------------------------------------------------------------------
// Push de cancelacion (PUT /api/orders/{idOrder} {idStatus:9})
// ---------------------------------------------------------------------------
//
// Cuando un pedido se cancela en UpBuy y ya existe en MasterShop (msIdOrder),
// se empuja la cancelacion para que el proveedor no lo despache. UpBuy es la
// fuente de verdad: un fallo del push NUNCA revierte lo local; queda en
// msCancelState = pending (reintentable) o failed (definitivo) para el panel.
const cancelMastershopOrder = async ({ orderId } = {}) => {
  assertUuid(orderId, "pedido");
  const startedAt = Date.now();

  const order = await Order.findByPk(orderId);
  if (!order) {
    throw new HttpError(404, "Pedido no encontrado");
  }

  // Sin pedido en MasterShop no hay nada que cancelar alla.
  if (!order.msIdOrder) {
    return { ok: false, skipped: true, orderId: order.id, reason: "sin_pedido_en_mastershop" };
  }

  // Idempotencia: ya se confirmo la cancelacion con MasterShop.
  if (order.msCancelState === MS_CANCEL_STATE.DONE || order.msCancelledAt) {
    return {
      ok: true,
      orderId: order.id,
      idOrder: order.msIdOrder,
      idempotent: true,
      reason: "ya_cancelado_en_mastershop",
    };
  }

  let result;
  try {
    result = await cancelOrder(order.msIdOrder, {
      correlationId: order.id,
      reference: order.orderNumber,
    });
  } catch (error) {
    // Excepcion no controlada del cliente: fallo de red reintentable.
    result = {
      ok: false,
      status: "unexpected_error",
      raw: null,
      retryable: true,
      error: error.message,
    };
  }

  const attemptNumber = await nextAttemptNumber(order.id);
  const durationMs = Date.now() - startedAt;
  const requestPayload = {
    idOrder: order.msIdOrder,
    idStatus: MASTERSHOP_ORDER_STATUS.CANCELADA,
  };

  if (result.ok) {
    await order.update({
      msCancelState: MS_CANCEL_STATE.DONE,
      msCancelledAt: new Date(),
      msCancelError: null,
      msCancelNextAttemptAt: null,
      msCancelAttempts: 0,
    });

    await recordAttempt({
      orderId: order.id,
      attempt: attemptNumber,
      action: "cancel",
      ok: true,
      httpStatus: 200,
      retryable: false,
      msIdOrder: order.msIdOrder,
      requestPayload,
      responseBody: result.raw || {},
      durationMs,
    });

    log.info("Pedido cancelado en MasterShop", {
      orderId: order.id,
      msIdOrder: order.msIdOrder,
      idempotent: Boolean(result.idempotent),
    });

    return {
      ok: true,
      orderId: order.id,
      idOrder: order.msIdOrder,
      reason: result.status || "cancelado",
    };
  }

  // Fallo: decidir si se reintenta desde el cron o queda para revision.
  const attempts = Number(order.msCancelAttempts || 0) + 1;
  const willRetry = Boolean(result.retryable) && attempts < MAX_CANCEL_ATTEMPTS;
  const cancelError = JSON.stringify({
    motivo: result.status || "error_desconocido",
    detalle: result.raw
      ? String(result.raw.error || result.raw.message || "").slice(0, 2000)
      : result.error || null,
  });

  if (willRetry) {
    // Backoff exponencial + jitter (mismo criterio que el outbox de creacion).
    const baseMinutes = Math.min(2 ** attempts, 4 * 60);
    const jitterMs = Math.floor(Math.random() * 60 * 1000);
    await order.update({
      msCancelState: MS_CANCEL_STATE.PENDING,
      msCancelAttempts: attempts,
      msCancelError: cancelError,
      msCancelNextAttemptAt: new Date(Date.now() + baseMinutes * 60 * 1000 + jitterMs),
    });
  } else {
    await order.update({
      msCancelState: MS_CANCEL_STATE.FAILED,
      msCancelAttempts: attempts,
      msCancelError: cancelError,
      msCancelNextAttemptAt: null,
    });
  }

  await recordAttempt({
    orderId: order.id,
    attempt: attemptNumber,
    action: "cancel",
    ok: false,
    httpStatus: result.status === "config_error" ? 401 : result.status === "rejected" ? 400 : 500,
    retryable: willRetry,
    error: result.status || "error_desconocido",
    msIdOrder: order.msIdOrder,
    requestPayload,
    responseBody: result.raw || {},
    durationMs,
  });

  log.error("Fallo cancelando pedido en MasterShop", {
    orderId: order.id,
    msIdOrder: order.msIdOrder,
    status: result.status,
    retryable: willRetry,
  });

  return {
    ok: false,
    orderId: order.id,
    idOrder: order.msIdOrder,
    reason: result.status || "error_desconocido",
    retryable: willRetry,
  };
};

// Reintenta los pushes de cancelacion pendientes (los toma el cron).
// Solo mira pedidos cancelados con pedido en MasterShop y estado `pending`
// cuyo backoff ya vencio.
const retryPendingMastershopCancellations = async ({ limit = 20 } = {}) => {
  const now = new Date();
  const rows = await Order.findAll({
    where: {
      fulfillmentStatus: FULFILLMENT_STATUS.CANCELLED,
      msIdOrder: { [Op.ne]: null },
      msCancelState: MS_CANCEL_STATE.PENDING,
      [Op.or]: [
        { msCancelNextAttemptAt: null },
        { msCancelNextAttemptAt: { [Op.lte]: now } },
      ],
    },
    order: [["msCancelNextAttemptAt", "ASC"]],
    limit: Math.min(Math.max(Number(limit) || 1, 1), 100),
  });

  const results = [];
  for (const order of rows) {
    try {
      results.push(await cancelMastershopOrder({ orderId: order.id }));
    } catch (error) {
      results.push({ orderId: order.id, ok: false, error: error.message });
    }
  }

  return { processed: results.length, results };
};

// ---------------------------------------------------------------------------
// Panel: pedidos de MasterShop que necesitan atencion
// ---------------------------------------------------------------------------
//
// Junta los dos motivos por los que un pedido queda colgado:
//   - creacion fallida o en revision (msSyncState = needs_review | failed);
//   - cancelacion que no se pudo empujar (msCancelState = pending | failed).
// El pedido cancelado sin pedido en MasterShop no se muestra: no hay nada que
// recrear ni cancelar.
const ATTENTION_SYNC_STATES = [MS_SYNC_STATE.NEEDS_REVIEW, MS_SYNC_STATE.FAILED];
const ATTENTION_CANCEL_STATES = [MS_CANCEL_STATE.PENDING, MS_CANCEL_STATE.FAILED];

const attentionWhere = (issue) => {
  const syncIssue = {
    msSyncState: { [Op.in]: ATTENTION_SYNC_STATES },
    fulfillmentStatus: { [Op.ne]: FULFILLMENT_STATUS.CANCELLED },
  };
  const cancelIssue = {
    fulfillmentStatus: FULFILLMENT_STATUS.CANCELLED,
    msIdOrder: { [Op.ne]: null },
    msCancelState: { [Op.in]: ATTENTION_CANCEL_STATES },
  };
  if (issue === "sync") return syncIssue;
  if (issue === "cancel") return cancelIssue;
  return { [Op.or]: [syncIssue, cancelIssue] };
};

const countMastershopAttention = async () => {
  const [needsReview, failed, cancelPending, cancelFailed] = await Promise.all([
    Order.count({
      where: {
        msSyncState: MS_SYNC_STATE.NEEDS_REVIEW,
        fulfillmentStatus: { [Op.ne]: FULFILLMENT_STATUS.CANCELLED },
      },
    }),
    Order.count({
      where: {
        msSyncState: MS_SYNC_STATE.FAILED,
        fulfillmentStatus: { [Op.ne]: FULFILLMENT_STATUS.CANCELLED },
      },
    }),
    Order.count({
      where: {
        fulfillmentStatus: FULFILLMENT_STATUS.CANCELLED,
        msIdOrder: { [Op.ne]: null },
        msCancelState: MS_CANCEL_STATE.PENDING,
      },
    }),
    Order.count({
      where: {
        fulfillmentStatus: FULFILLMENT_STATUS.CANCELLED,
        msIdOrder: { [Op.ne]: null },
        msCancelState: MS_CANCEL_STATE.FAILED,
      },
    }),
  ]);

  return {
    needsReview,
    failed,
    cancelPending,
    cancelFailed,
    total: needsReview + failed + cancelPending + cancelFailed,
  };
};

const listMastershopAttentionOrders = async ({
  issue = "all",
  q = "",
  limit = 20,
  offset = 0,
} = {}) => {
  const safeIssue = issue === "sync" || issue === "cancel" ? issue : "all";
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  let where = attentionWhere(safeIssue);
  const term = String(q || "").trim();
  if (term) {
    const like = `%${term}%`;
    where = {
      [Op.and]: [
        where,
        {
          [Op.or]: [
            { orderNumber: { [Op.iLike]: like } },
            { recipientName: { [Op.iLike]: like } },
            { email: { [Op.iLike]: like } },
          ],
        },
      ],
    };
  }

  const { rows, count } = await Order.findAndCountAll({
    where,
    order: [["updatedAt", "DESC"]],
    limit: safeLimit,
    offset: safeOffset,
  });

  // Ultimo intento por pedido, en una sola consulta.
  const ids = rows.map((row) => row.id);
  const lastAttemptByOrder = new Map();
  if (ids.length) {
    const attempts = await MastershopOrderAttempt.findAll({
      where: { orderId: { [Op.in]: ids } },
      order: [["createdAt", "DESC"]],
    });
    for (const attempt of attempts) {
      if (!lastAttemptByOrder.has(attempt.orderId)) {
        lastAttemptByOrder.set(attempt.orderId, attempt);
      }
    }
  }

  const orders = rows.map((order) => {
    const isCancelIssue =
      order.fulfillmentStatus === FULFILLMENT_STATUS.CANCELLED &&
      ATTENTION_CANCEL_STATES.includes(order.msCancelState);
    const attempt = lastAttemptByOrder.get(order.id) || null;

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      recipientName: order.recipientName,
      email: order.email,
      phone: order.phone,
      total: order.total,
      currency: order.currency,
      fulfillmentStatus: order.fulfillmentStatus,
      paymentState: order.paymentState,
      msIdOrder: order.msIdOrder,
      msExternalOrderId: order.msExternalOrderId,
      msStatus: order.msStatus,
      msSyncState: order.msSyncState,
      msSyncError: order.msSyncError,
      msCancelState: order.msCancelState,
      msCancelAttempts: order.msCancelAttempts,
      msCancelNextAttemptAt: order.msCancelNextAttemptAt,
      msCancelError: order.msCancelError,
      msCancelledAt: order.msCancelledAt,
      issue: isCancelIssue ? "cancel" : "sync",
      lastAttempt: attempt
        ? {
            action: attempt.action,
            ok: attempt.ok,
            httpStatus: attempt.httpStatus,
            retryable: attempt.retryable,
            error: attempt.error,
            createdAt: attempt.createdAt,
          }
        : null,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    total: count,
    limit: safeLimit,
    offset: safeOffset,
    counts: await countMastershopAttention(),
    orders,
  };
};

// Reintenta un pedido desde el panel.
//
//   - cancelacion pendiente/fallida -> vuelve a empujar `PUT {idStatus:9}`;
//   - creacion needs_review/failed  -> reactiva el outbox y crea el pedido;
//   - pedido cancelado sin pedido en MasterShop -> no se recrea.
//
// Fuerza un intento nuevo aunque se haya alcanzado el tope de reintentos.
const retryMastershopOrder = async ({ orderId } = {}) => {
  assertUuid(orderId, "pedido");
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw new HttpError(404, "Pedido no encontrado");
  }

  // 1) Cancelacion: reintentar el push de cancelacion.
  if (order.fulfillmentStatus === FULFILLMENT_STATUS.CANCELLED) {
    if (!order.msIdOrder) {
      // Nunca llego a crearse en MasterShop: se cierra el outbox y se deja de
      // reintentar (no hay nada que cancelar alla).
      await MastershopOrderOutbox.update(
        { status: "done", lastError: "pedido_cancelado", lockedAt: null },
        { where: { orderId: order.id } },
      );
      await order.update({
        msSyncState: MS_SYNC_STATE.DISABLED,
        msSyncError: null,
        msCancelState: null,
        msCancelNextAttemptAt: null,
      });
      return {
        ok: true,
        action: "none",
        orderId: order.id,
        reason: "pedido_cancelado_sin_pedido_en_mastershop",
      };
    }

    // El operador fuerza el intento: se reinicia el contador para que un
    // fallo transitorio vuelva a quedar en `pending`.
    await order.update({ msCancelAttempts: 0, msCancelNextAttemptAt: null });
    const result = await cancelMastershopOrder({ orderId: order.id });
    return { action: "cancel", ...result };
  }

  // 2) Ya existe en MasterShop: no hay nada que recrear.
  if (order.msIdOrder) {
    return {
      ok: true,
      action: "none",
      orderId: order.id,
      idOrder: order.msIdOrder,
      reason: "ya_creado_en_mastershop",
    };
  }

  // 3) Creacion: el pedido debe estar pagado, sin importar el medio (Wompi,
  // transferencia, Nequi o COD recaudado).
  if (!isOrderPaid(order)) {
    return {
      ok: false,
      action: "create",
      orderId: order.id,
      reason: `pedido_no_pagado:${order.paymentState || "sin_estado"}`,
    };
  }

  // Reactivar el outbox (exista o no la fila) y limpiar el error anterior.
  const [row] = await MastershopOrderOutbox.findOrCreate({
    where: { orderId: order.id },
    defaults: { status: "pending", attempts: 0 },
  });
  await row.update({
    status: "pending",
    attempts: 0,
    nextAttemptAt: null,
    lockedAt: null,
    lastError: null,
  });
  await order.update({ msSyncState: MS_SYNC_STATE.PENDING, msSyncError: null });

  try {
    const result = await syncOrderToMastershopByOrderId(order.id);
    return { action: "create", ...result };
  } catch (error) {
    return {
      ok: false,
      action: "create",
      orderId: order.id,
      reason: error.message,
    };
  }
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

    // Cualquier origen de pago vale: la funcion valida que el pedido este
    // pagado y que sus items ruteen a MasterShop.
    const result = await syncOrderToMastershopByOrderId(row.orderId).catch(
      (error) => ({
        ok: false,
        reason: error.message,
        retryable: false,
      }),
    );

    // Sincronizar el estado del outbox con el resultado del servicio.
    if (result.ok && result.idOrder) {
      await row.update({ status: "done", lastError: null, lockedAt: null });
    } else if (result.reason === "pedido_cancelado") {
      // El pedido se anulo antes de llegar a MasterShop: no se crea y se
      // cierra la fila para no reintentar.
      await row.update({ status: "done", lastError: result.reason, lockedAt: null });
    } else if (
      result.reason === "faltan_mapeos_de_variante" ||
      result.reason === "payload_invalido" ||
      result.reason === "rejected"
    ) {
      // 400 de esquema o falta de mapeo: revision manual, no reintentar solo.
      await row.update({ status: "needs_review", lastError: result.reason, lockedAt: null });
    } else if (String(result.reason || "").startsWith("pedido_no_pagado")) {
      // Un pago reembolsado/anulado ya no habilita crear el pedido.
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
// Un pedido es "de MasterShop" solo si todos sus items enrutan a ese proveedor.
// Evita que la conciliacion cuente pedidos de Venndelo (o manuales) como
// "pagos aprobados sin pedido en MasterShop".
const orderIsMastershop = async (orderId) => {
  const items = await OrderItem.findAll({ where: { orderId } });
  if (items.length === 0) return false;
  const routing = await resolveOrderProvider(items);
  return routing.ok && routing.provider === SUPPLIER_SLUG.MASTERSHOP;
};

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

  const approvedWithoutMsOrder = [];
  for (const payment of approvedPayments) {
    const order = ordersById.get(payment.orderId);
    if (!order || order.msIdOrder) continue;
    // Solo pedidos de MasterShop: uno de Venndelo no es un desajuste de esta
    // integracion (cada proveedor tiene su propio outbox y su propio informe).
    if (!(await orderIsMastershop(order.id))) continue;
    approvedWithoutMsOrder.push({
      orderId: order.id,
      orderNumber: order.orderNumber,
      reference: payment.reference,
      paymentCreatedAt: payment.createdAt,
      msSyncState: order.msSyncState || null,
    });
  }

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

  // Cancelaciones que no se pudieron empujar a MasterShop (pending/failed).
  const pendingCancellations = await Order.findAll({
    where: {
      fulfillmentStatus: FULFILLMENT_STATUS.CANCELLED,
      msIdOrder: { [Op.ne]: null },
      msCancelState: { [Op.in]: [MS_CANCEL_STATE.PENDING, MS_CANCEL_STATE.FAILED] },
    },
    order: [["updatedAt", "DESC"]],
    limit,
  });

  const report = {
    generatedAt,
    includeRemote: Boolean(includeRemote),
    approvedWithoutMsOrder,
    failedOrders: failedOrders.map(toOrderRef),
    needsReviewOrders: needsReviewOrders.map(toOrderRef),
    pendingCancellations: pendingCancellations.map((order) => ({
      orderId: order.id,
      orderNumber: order.orderNumber,
      msIdOrder: order.msIdOrder,
      msCancelState: order.msCancelState,
      msCancelAttempts: order.msCancelAttempts,
      msCancelNextAttemptAt: order.msCancelNextAttemptAt,
      msCancelError: order.msCancelError || null,
    })),
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
  syncOrderToMastershopByOrderId,
  enqueueMastershopOrderIfNeeded,
  isOrderPaid,
  processMastershopOutbox,
  cancelMastershopOrder,
  retryPendingMastershopCancellations,
  listMastershopAttentionOrders,
  retryMastershopOrder,
  checkFailureRate,
  buildReconciliationReport,
  MS_SYNC_STATE,
  MS_CANCEL_STATE,
  MAX_CANCEL_ATTEMPTS,
  mapAddress,
  mapCustomer,
  redactObject,
};
