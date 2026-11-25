// Orquestador: pago Wompi aprobado -> pedido creado en Venndelo.
//
// Flujo:
//   1. Cargar el pago por `reference` y el pedido con sus items.
//   2. Si el pedido ya tiene `vdIdOrder` -> idempotente, no hacer nada.
//   3. Verificar que el pedido pertenezca a Venndelo (enrutamiento).
//   4. Resolver cada item a su `variation_id` (externalId de la variacion).
//      Si falta algo -> no crear pedido parcial: `needs_review`.
//   5. Construir el payload y llamar `POST /orders`.
//   6. Guardar vdIdOrder/vdStatus/vdSyncedAt y el intento redactado.
//
// El webhook de Wompi NO crea el pedido: solo encola en
// `venndelo_order_outbox`. Este servicio lo procesa desde el cron o un
// reintento manual.
const { Op } = require("sequelize");
const {
  Order,
  OrderItem,
  Payment,
  SupplierProductVariation,
  VenndeloOrderOutbox,
  VenndeloOrderAttempt,
} = require("../DataBase/models/index.js");
const { PAYMENT_STATUS } = require("../DataBase/models/enums.js");
const {
  createVenndeloOrder,
  listVenndeloOrders,
  resolveVenndeloCity,
} = require("./suppliers/venndelo.account.service.js");
const { resolveOrderProvider } = require("./orders/providerRouting.service.js");
const HttpError = require("../Utils/HttpError.js");
const { createLogger } = require("../Utils/logger.js");

const log = createLogger("venndelo.orders.service");

const VD_SYNC_STATE = {
  PENDING: "pending",
  SYNCED: "synced",
  NEEDS_REVIEW: "needs_review",
  FAILED: "failed",
};

const REDACTED_KEYS = new Set(["authorization", "token", "card", "cvv"]);

const redactObject = (value) => {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactObject);
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    const lowered = key.toLowerCase();
    result[key] =
      REDACTED_KEYS.has(lowered) ||
      lowered.includes("token") ||
      lowered.includes("secret")
        ? "[REDACTADO]"
        : redactObject(item);
  }
  return result;
};

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

const positiveNumber = (...values) => {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
};

const dimensionsFrom = (variation) => {
  const raw = variation?.rawData || {};
  return {
    height: positiveNumber(raw.height, raw.alto, raw.dimensions?.height),
    width: positiveNumber(raw.width, raw.ancho, raw.dimensions?.width),
    length: positiveNumber(raw.length, raw.largo, raw.dimensions?.length),
    weight: positiveNumber(raw.weight, raw.peso),
  };
};

// ---------------------------------------------------------------------------
// Mapeo de items
// ---------------------------------------------------------------------------

const resolveVenndeloItems = async (orderItems) => {
  const items = [];
  const failedItems = [];
  const list = Array.isArray(orderItems) ? orderItems : [];

  const variantIds = list.map((item) => item.variantId).filter(Boolean);
  const variations = variantIds.length
    ? await SupplierProductVariation.findAll({
        where: { id: [...new Set(variantIds)] },
      })
    : [];
  const variationById = new Map(variations.map((v) => [v.id, v]));

  for (const item of list) {
    const variation = item.variantId
      ? variationById.get(item.variantId)
      : null;

    if (item.variantId && !variation) {
      failedItems.push({
        itemId: item.id,
        title: item.title,
        reason: "variante_inexistente",
      });
      continue;
    }

    if (
      variation &&
      item.supplierProductId &&
      variation.supplierProductId !== item.supplierProductId
    ) {
      failedItems.push({
        itemId: item.id,
        title: item.title,
        reason: "variante_no_corresponde_al_producto",
      });
      continue;
    }

    const externalId = variation ? Number(variation.externalId) : null;
    const variationId =
      Number.isInteger(externalId) && externalId > 0 ? externalId : null;
    const sku = variation?.sku || item.providerSku || null;

    if (!variationId && !sku) {
      failedItems.push({
        itemId: item.id,
        title: item.title,
        reason: "item_sin_variante_ni_sku",
      });
      continue;
    }

    const dims = dimensionsFrom(variation);
    items.push({
      variation_id: variationId,
      sku,
      name: item.nameSnapshot || item.title || null,
      unit_price: Number(item.unitPrice) || 0,
      quantity: Number(item.quantity) || 1,
      ...dims,
    });
  }

  return { ok: failedItems.length === 0, items, failedItems };
};

// ---------------------------------------------------------------------------
// Payload (puro, testeable)
// ---------------------------------------------------------------------------

const buildVenndeloOrderPayload = (order, items, city) => {
  const snapshot = order.addressSnapshot || {};
  const names = splitName(snapshot.recipientName);
  const buyerNote = String(order.notes || snapshot.notes || "").trim();
  const externalOrderId = `${order.orderNumber}-VD`;

  const errors = [];
  if (!names.first_name) errors.push("billing_info.first_name es obligatorio");
  if (!snapshot.phone) errors.push("billing_info.phone es obligatorio");
  if (!snapshot.address) errors.push("shipping_info.address_1 es obligatorio");
  if (!city?.code) {
    errors.push(
      `No se pudo resolver la ciudad "${snapshot.city || ""}" en el catálogo de Venndelo`,
    );
  }
  if (!Array.isArray(items) || items.length === 0) {
    errors.push("line_items no puede estar vacio");
  }

  if (errors.length > 0) {
    throw new HttpError(400, `Pedido Venndelo inválido: ${errors.join("; ")}`);
  }

  return {
    external_order_id: externalOrderId,
    payment_method_code: "EXTERNAL_PAYMENT",
    line_items: items.map((item) => ({
      type: "STANDARD",
      ...(item.variation_id ? { variation_id: item.variation_id } : {}),
      ...(item.sku ? { sku: item.sku } : {}),
      name: item.name,
      unit_price: item.unit_price,
      height: item.height || 0,
      width: item.width || 0,
      length: item.length || 0,
      dimensions_unit: "CM",
      weight: item.weight || 0,
      weight_unit: "KG",
      quantity: item.quantity,
    })),
    billing_info: {
      first_name: names.first_name,
      last_name: names.last_name,
      phone: snapshot.phone,
      ...(snapshot.email ? { email: snapshot.email } : {}),
    },
    shipping_info: {
      first_name: names.first_name,
      last_name: names.last_name,
      ...(snapshot.phone ? { phone: snapshot.phone } : {}),
      ...(snapshot.email ? { email: snapshot.email } : {}),
      address_1: snapshot.address,
      city_code: city.code,
      city_name: city.name,
      subdivision_code: city.subdivision_code,
      subdivision_name: city.subdivision_name,
      country_code: "CO",
    },
    ...(buyerNote ? { buyer_note: buyerNote.slice(0, 2000) } : {}),
  };
};

// ---------------------------------------------------------------------------
// Bitacora
// ---------------------------------------------------------------------------

const nextAttemptNumber = async (orderId) => {
  const last = await VenndeloOrderAttempt.findOne({
    where: { orderId },
    order: [["attempt", "DESC"]],
  });
  return Number((last && last.attempt) || 0) + 1;
};

const recordAttempt = async ({
  orderId,
  attempt,
  action,
  ok,
  httpStatus,
  retryable,
  error,
  vdIdOrder,
  requestPayload,
  responseBody,
  durationMs,
}) => {
  await VenndeloOrderAttempt.create({
    orderId,
    attempt,
    action,
    ok,
    httpStatus,
    retryable: Boolean(retryable),
    error: error ? String(error).slice(0, 2000) : null,
    vdIdOrder: vdIdOrder || null,
    requestPayload: redactObject(requestPayload || {}),
    responseBody: redactObject(responseBody || {}),
    durationMs,
  });
};

// ---------------------------------------------------------------------------
// Recuperacion de duplicado
// ---------------------------------------------------------------------------

// Venndelo no expone un filtro simple por external_order_id en nuestro
// adaptador, asi que se revisan las ultimas paginas y se busca el pedido.
const findVenndeloOrderByExternalId = async (externalOrderId) => {
  let pageToken = null;
  for (let page = 0; page < 3; page += 1) {
    const result = await listVenndeloOrders({
      page_size: 100,
      ...(pageToken ? { page_token: pageToken } : {}),
    });
    const payload = result?.orders;
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.items)
        ? payload.items
        : [];
    const match = list.find(
      (order) =>
        String(order?.external_order_id || "") === String(externalOrderId),
    );
    if (match) return match;

    pageToken =
      result?.raw?.next_page_token || payload?.next_page_token || null;
    if (!pageToken || list.length === 0) break;
  }
  return null;
};

const classifyError = (error) => {
  const providerStatus = Number(error?.providerStatus);
  const message = String(error?.message || "");
  const bodyText = JSON.stringify(error?.providerBody || "").toLowerCase();

  if (/ya existe|duplicad|duplicate/i.test(message)) {
    return {
      status: "duplicate",
      httpStatus: Number.isInteger(providerStatus) ? providerStatus : 409,
      retryable: false,
    };
  }

  // Venndelo devuelve 500 "The entity Order has invalid values" para datos
  // invalidos (p. ej. un telefono rechazado). No es un fallo transitorio:
  // reintentarlo en bucle no cambia nada. Va a revision manual.
  if (
    providerStatus === 500 &&
    /invalid values|invalid|required|not valid|must be/.test(bodyText)
  ) {
    return { status: "rejected", httpStatus: 500, retryable: false };
  }

  if (Number.isInteger(providerStatus) && providerStatus > 0) {
    if (providerStatus === 409) {
      return { status: "duplicate", httpStatus: providerStatus, retryable: false };
    }
    if ([400, 404, 422].includes(providerStatus)) {
      return { status: "rejected", httpStatus: providerStatus, retryable: false };
    }
    if ([401, 403].includes(providerStatus)) {
      return { status: "config_error", httpStatus: providerStatus, retryable: false };
    }
    if (providerStatus === 429 || providerStatus >= 500) {
      return { status: "server_error", httpStatus: providerStatus, retryable: true };
    }
    return { status: "unexpected_error", httpStatus: providerStatus, retryable: false };
  }

  if (error?.name === "HttpError") {
    if (error.status === 400 || error.status === 404) {
      return { status: "rejected", httpStatus: error.status, retryable: false };
    }
    // 503 sin providerStatus = integracion no configurada.
    if (error.status === 502 || error.status === 503) {
      return { status: "config_error", httpStatus: error.status, retryable: false };
    }
  }

  // Error de red/timeout: reintentable.
  return { status: "network_error", httpStatus: null, retryable: true };
};

// ---------------------------------------------------------------------------
// Orquestador principal
// ---------------------------------------------------------------------------

const syncPaidOrderToVenndelo = async (reference) => {
  const startedAt = Date.now();
  const correlationId = String(reference || "").slice(0, 120);

  if (!reference) throw new Error("Falta la reference de Wompi");

  const payment = await Payment.findOne({
    where: { provider: "wompi", reference },
  });
  if (!payment) {
    throw new Error(`No existe pago de Wompi con reference ${reference}`);
  }

  const order = await Order.findByPk(payment.orderId, {
    include: [{ model: OrderItem, as: "items" }],
  });
  if (!order) {
    throw new Error(`Orden local inexistente para la reference ${reference}`);
  }

  if (order.vdIdOrder) {
    log.info("Pedido ya sincronizado con Venndelo", {
      correlationId,
      orderId: order.id,
      vdIdOrder: order.vdIdOrder,
    });
    return {
      ok: true,
      idempotent: true,
      idOrder: order.vdIdOrder,
      orderId: order.id,
      reason: "ya_sincronizado",
    };
  }

  if (payment.status !== PAYMENT_STATUS.APROBADO) {
    return {
      ok: false,
      idOrder: null,
      orderId: order.id,
      reason: `pago_no_aprobado:${payment.status}`,
    };
  }

  const routing = await resolveOrderProvider(order.items || []);
  if (!routing.ok) {
    await order.update({
      vdSyncState: VD_SYNC_STATE.NEEDS_REVIEW,
      vdSyncError: JSON.stringify({
        motivo: routing.reason,
        providers: routing.providers || null,
        provider: routing.provider || null,
      }),
    });
    await VenndeloOrderOutbox.update(
      { status: "needs_review", lastError: routing.reason },
      { where: { orderId: order.id } },
    );
    return {
      ok: false,
      idOrder: null,
      orderId: order.id,
      reason: routing.reason,
      retryable: false,
    };
  }

  if (routing.provider !== "venndelo") {
    await order.update({
      vdSyncState: VD_SYNC_STATE.NEEDS_REVIEW,
      vdSyncError: JSON.stringify({
        motivo: "pedido_no_es_de_venndelo",
        provider: routing.provider,
      }),
    });
    await VenndeloOrderOutbox.update(
      { status: "needs_review", lastError: "pedido_no_es_de_venndelo" },
      { where: { orderId: order.id } },
    );
    return {
      ok: false,
      idOrder: null,
      orderId: order.id,
      reason: "pedido_no_es_de_venndelo",
      retryable: false,
    };
  }

  const resolution = await resolveVenndeloItems(order.items || []);
  if (!resolution.ok) {
    await order.update({
      vdSyncState: VD_SYNC_STATE.NEEDS_REVIEW,
      vdSyncError: JSON.stringify({
        motivo: "faltan_variantes_de_venndelo",
        itemsSinResolver: resolution.failedItems,
      }),
    });
    await VenndeloOrderOutbox.update(
      { status: "needs_review", lastError: "faltan_variantes_de_venndelo" },
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
      error: "Faltan variantes de Venndelo",
      requestPayload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        reference,
      },
      responseBody: { failedItems: resolution.failedItems },
      durationMs: Date.now() - startedAt,
    });
    return {
      ok: false,
      idOrder: null,
      orderId: order.id,
      reason: "faltan_variantes_de_venndelo",
      failedItems: resolution.failedItems,
      retryable: false,
    };
  }

  let payload;
  try {
    const snapshot = order.addressSnapshot || {};
    const city = await resolveVenndeloCity(snapshot.city, snapshot.department);
    if (!city) {
      throw new HttpError(
        400,
        `No se encontró la ciudad "${snapshot.city || ""}" en el catálogo de Venndelo`,
      );
    }
    if (String(city.service_status || "").toUpperCase() === "SUSPENDED") {
      throw new HttpError(
        400,
        city.service_unavailable_message ||
          `Venndelo no está entregando en "${city.name}"`,
      );
    }
    payload = buildVenndeloOrderPayload(order, resolution.items, city);
  } catch (error) {
    await order.update({
      vdSyncState: VD_SYNC_STATE.NEEDS_REVIEW,
      vdSyncError: JSON.stringify({
        motivo: "payload_invalido",
        detalle: error.message,
      }),
    });
    await VenndeloOrderOutbox.update(
      { status: "needs_review", lastError: "payload_invalido" },
      { where: { orderId: order.id } },
    );
    return {
      ok: false,
      idOrder: null,
      orderId: order.id,
      reason: "payload_invalido",
      retryable: false,
    };
  }

  let created = null;
  let failure = null;
  try {
    created = await createVenndeloOrder(payload, {
      idempotencyKey: payload.external_order_id,
    });
  } catch (error) {
    failure = classifyError(error);
    failure.error = error.message;
    if (error.providerBody) {
      failure.error += ` | ${JSON.stringify(error.providerBody).slice(0, 1000)}`;
    }
    failure.raw = error.providerBody || null;
  }

  const durationMs = Date.now() - startedAt;
  const attemptNumber = await nextAttemptNumber(order.id);

  if (created) {
    const wrapper = created.order;
    const first = Array.isArray(wrapper?.items) ? wrapper.items[0] : wrapper;
    const vdIdOrder =
      first?.id !== undefined && first?.id !== null ? String(first.id) : null;

    await order.update({
      vdIdOrder,
      vdExternalOrderId: payload.external_order_id,
      vdSyncedAt: new Date(),
      vdStatus: first?.status || null,
      vdSyncState: vdIdOrder
        ? VD_SYNC_STATE.SYNCED
        : VD_SYNC_STATE.NEEDS_REVIEW,
      vdSyncError: vdIdOrder ? null : "Venndelo no devolvió el id del pedido",
    });

    await VenndeloOrderOutbox.update(
      {
        status: vdIdOrder ? "done" : "needs_review",
        lastError: vdIdOrder ? null : "sin_id_de_pedido",
      },
      { where: { orderId: order.id } },
    );

    await recordAttempt({
      orderId: order.id,
      attempt: attemptNumber,
      action: "create",
      ok: Boolean(vdIdOrder),
      httpStatus: 201,
      retryable: false,
      error: vdIdOrder ? null : "sin_id_de_pedido",
      vdIdOrder,
      requestPayload: payload,
      responseBody: created.raw || {},
      durationMs,
    });

    log.info("Pedido creado en Venndelo", {
      correlationId,
      orderId: order.id,
      vdIdOrder,
    });

    return {
      ok: Boolean(vdIdOrder),
      idOrder: vdIdOrder,
      orderId: order.id,
      reason: vdIdOrder ? "creado" : "sin_id_de_pedido",
    };
  }

  // Duplicado: intentar recuperar el id real del pedido.
  if (failure.status === "duplicate") {
    let recovered = null;
    try {
      recovered = await findVenndeloOrderByExternalId(
        payload.external_order_id,
      );
    } catch (error) {
      failure.status = "server_error";
      failure.retryable = true;
      failure.error = `duplicado; fallo al recuperar: ${error.message}`;
    }

    if (recovered?.id) {
      const vdIdOrder = String(recovered.id);
      await order.update({
        vdIdOrder,
        vdExternalOrderId: payload.external_order_id,
        vdSyncedAt: new Date(),
        vdStatus: recovered.status || null,
        vdSyncState: VD_SYNC_STATE.SYNCED,
        vdSyncError: null,
      });
      await VenndeloOrderOutbox.update(
        { status: "done", lastError: null },
        { where: { orderId: order.id } },
      );
      await recordAttempt({
        orderId: order.id,
        attempt: attemptNumber,
        action: "recover",
        ok: true,
        httpStatus: 409,
        retryable: false,
        vdIdOrder,
        requestPayload: payload,
        responseBody: recovered,
        durationMs,
      });
      return {
        ok: true,
        idempotent: true,
        idOrder: vdIdOrder,
        orderId: order.id,
        reason: "duplicado_recuperado",
      };
    }

    failure.status = "needs_review";
    failure.retryable = false;
  }

  const newSyncState =
    failure.status === "rejected" || failure.status === "duplicate"
      ? VD_SYNC_STATE.NEEDS_REVIEW
      : VD_SYNC_STATE.FAILED;
  const outboxStatus = failure.retryable
    ? "pending"
    : failure.status === "rejected" || failure.status === "duplicate"
      ? "needs_review"
      : "failed";

  await order.update({
    vdSyncState: newSyncState,
    vdSyncError: JSON.stringify({
      motivo: failure.status,
      detalle: failure.error ? String(failure.error).slice(0, 2000) : null,
    }),
  });

  await VenndeloOrderOutbox.update(
    { status: outboxStatus, lastError: failure.status },
    { where: { orderId: order.id } },
  );

  await recordAttempt({
    orderId: order.id,
    attempt: attemptNumber,
    action: "create",
    ok: false,
    httpStatus: failure.httpStatus || null,
    retryable: Boolean(failure.retryable),
    error: failure.error || failure.status,
    requestPayload: payload,
    responseBody: failure.raw || {},
    durationMs,
  });

  log.error("Fallo creando pedido en Venndelo", {
    correlationId,
    orderId: order.id,
    status: failure.status,
    retryable: Boolean(failure.retryable),
  });

  return {
    ok: false,
    idOrder: null,
    orderId: order.id,
    reason: failure.status,
    retryable: Boolean(failure.retryable),
    httpStatus: failure.httpStatus || null,
  };
};

// ---------------------------------------------------------------------------
// Procesador del outbox
// ---------------------------------------------------------------------------

const processVenndeloOutbox = async ({ limit = 20, orderId = null } = {}) => {
  const now = new Date();

  const staleLock = new Date(now.getTime() - 15 * 60 * 1000);
  await VenndeloOrderOutbox.update(
    { status: "pending", lockedAt: null },
    { where: { status: "processing", lockedAt: { [Op.lte]: staleLock } } },
  );

  const rows = await VenndeloOrderOutbox.findAll({
    where: {
      ...(orderId ? { orderId } : {}),
      status: "pending",
      [Op.or]: [{ nextAttemptAt: null }, { nextAttemptAt: { [Op.lte]: now } }],
    },
    order: [["nextAttemptAt", "ASC"], ["createdAt", "ASC"]],
    limit: Math.min(Math.max(Number(limit) || 1, 1), 100),
  });

  const results = [];

  for (const row of rows) {
    const attempts = (row.attempts || 0) + 1;
    const updated = await VenndeloOrderOutbox.update(
      { status: "processing", lockedAt: new Date(), attempts },
      { where: { id: row.id, status: "pending" } },
    );
    if (!updated[0]) continue;

    let payment;
    try {
      payment = await Payment.findOne({
        where: {
          orderId: row.orderId,
          provider: "wompi",
          status: PAYMENT_STATUS.APROBADO,
        },
      });
    } catch {
      // Se ignora: el resultado de abajo marca el error.
    }

    let result;
    if (!payment) {
      result = { ok: false, reason: "pago_wompi_no_aprobado_encontrado" };
    } else {
      result = await syncPaidOrderToVenndelo(payment.reference).catch((error) => ({
        ok: false,
        reason: error.message,
        retryable: false,
      }));
    }

    if (result.ok && result.idOrder) {
      await row.update({ status: "done", lastError: null, lockedAt: null });
    } else if (
      result.reason === "faltan_variantes_de_venndelo" ||
      result.reason === "payload_invalido" ||
      result.reason === "pedido_no_es_de_venndelo" ||
      result.reason === "pedido_mixto" ||
      result.reason === "rejected" ||
      result.reason === "duplicate"
    ) {
      await row.update({
        status: "needs_review",
        lastError: result.reason,
        lockedAt: null,
      });
    } else if (result.retryable) {
      const baseMinutes = Math.min(2 ** attempts, 4 * 60);
      const jitterMs = Math.floor(Math.random() * 60 * 1000);
      const nextAttempt = new Date(
        now.getTime() + baseMinutes * 60 * 1000 + jitterMs,
      );
      await row.update({
        status: "pending",
        nextAttemptAt: nextAttempt,
        lastError: result.reason,
        lockedAt: null,
      });
    } else {
      await row.update({
        status: "failed",
        lastError: result.reason,
        lockedAt: null,
      });
    }

    results.push({ orderId: row.orderId, ...result });
  }

  return { processed: results.length, results };
};

// ---------------------------------------------------------------------------
// Administracion del outbox
// ---------------------------------------------------------------------------

const listVenndeloOutbox = async ({ status = null, limit = 50 } = {}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const rows = await VenndeloOrderOutbox.findAll({
    where: status ? { status: String(status) } : {},
    order: [["createdAt", "DESC"]],
    limit: safeLimit,
  });

  const orderIds = [...new Set(rows.map((row) => row.orderId))];
  const orders = orderIds.length
    ? await Order.findAll({
        where: { id: orderIds },
        attributes: [
          "id",
          "orderNumber",
          "paymentState",
          "fulfillmentStatus",
          "vdSyncState",
          "vdIdOrder",
        ],
      })
    : [];
  const orderById = new Map(orders.map((order) => [order.id, order.toJSON()]));

  return rows.map((row) => ({
    ...row.toJSON(),
    order: orderById.get(row.orderId) || null,
  }));
};

const retryVenndeloOutbox = async (orderId) => {
  const row = await VenndeloOrderOutbox.findOne({ where: { orderId } });
  if (!row) {
    throw new HttpError(404, "No hay una fila de outbox para ese pedido");
  }

  await row.update({
    status: "pending",
    attempts: 0,
    nextAttemptAt: new Date(),
    lockedAt: null,
    lastError: null,
  });

  const processed = await processVenndeloOutbox({ limit: 1, orderId });
  const fresh = await VenndeloOrderOutbox.findByPk(row.id);

  return {
    orderId,
    outbox: (fresh || row).toJSON(),
    result: processed.results[0] || null,
  };
};

module.exports = {
  VD_SYNC_STATE,
  resolveVenndeloItems,
  buildVenndeloOrderPayload,
  syncPaidOrderToVenndelo,
  processVenndeloOutbox,
  findVenndeloOrderByExternalId,
  listVenndeloOutbox,
  retryVenndeloOutbox,
};