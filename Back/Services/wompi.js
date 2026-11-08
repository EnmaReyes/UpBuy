const crypto = require("crypto");
const {
  Payment,
  Order,
} = require("../DataBase/models/index.js");
const {
  PAYMENT_STATUS,
  ORDER_STATUS,
} = require("../DataBase/models/enums.js");
const { registerPayment } = require("./payments.js");
const { getOrderForUser } = require("./orders.js");
const HttpError = require("../Utils/HttpError.js");
const { assertUuid } = require("../Utils/ids.js");
const {
  FRONTEND_URL,
  WOMPI_PUBLIC_KEY,
  WOMPI_PRIVATE_KEY,
  WOMPI_INTEGRITY_SECRET,
  WOMPI_EVENTS_SECRET,
  WOMPI_ENV,
  WOMPI_BASE_URL,
  WOMPI_CHECKOUT_URL,
  WOMPI_REDIRECT_URL,
  WOMPI_EVENT_MAX_AGE_SECONDS,
} = require("../config.js");

// ---------------------------------------------------------------------------
// Wompi — Web Checkout + eventos.
//
// Flujo:
//   1. El comprador confirma el pedido (orders.status = pendiente_pago).
//   2. POST /api/orders/:id/payment crea un Payment pendiente con referencia
//      propia y devuelve la URL de checkout firmada.
//   3. Wompi cobra y redirige al sitio; ademas envia el evento
//      transaction.updated a POST /api/payments/webhook.
//   4. El webhook (firma verificada) es la fuente de verdad: aplica el estado
//      sobre el mismo Payment y sobre el pedido.
//
// Nada de esto se activa por si solo: si las llaves no estan configuradas los
// endpoints responden 503 y el pedido sigue su curso manual.
// ---------------------------------------------------------------------------

const PROVIDER_WOMPI = "wompi";

const isCheckoutConfigured = () =>
  Boolean(WOMPI_PUBLIC_KEY && WOMPI_INTEGRITY_SECRET);

const isEventsConfigured = () => Boolean(WOMPI_EVENTS_SECRET);

const isVerifyConfigured = () => Boolean(WOMPI_PRIVATE_KEY);

const sha256 = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

// Log estructurado (una linea JSON) para poder filtrar en Vercel / Neon por
// scope=wompi.webhook. Nunca incluye llaves ni datos del medio de pago.
const logWebhook = (resultado, datos = {}, nivel = "info") => {
  const linea = JSON.stringify({
    scope: "wompi.webhook",
    at: new Date().toISOString(),
    resultado,
    ...datos,
  });

  if (nivel === "warn") console.warn(linea);
  else if (nivel === "error") console.error(linea);
  else console.log(linea);
};

// Un evento con timestamp en el futuro es un reloj mal puesto o un intento de
// saltarse la ventana. Se toleran 5 minutos de desfase.
const FUTURE_TOLERANCE_SECONDS = 300;

// Normaliza la etiqueta de ambiente que manda Wompi. Los valores conocidos son
// "test" y "prod", pero se toleran sinonimos para no descartar eventos reales
// si Wompi cambia la etiqueta (p. ej. "production"/"live"). Un valor
// desconocido se devuelve tal cual para poder avisar en el log.
const normalizeEnvironment = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (["prod", "production", "live"].includes(raw)) return "prod";
  if (["test", "sandbox", "development", "dev"].includes(raw)) return "test";
  return raw;
};

const KNOWN_ENVIRONMENTS = new Set(["prod", "test"]);

// Wompi (su CloudFront/WAF) responde 403 si la URL de retorno apunta a
// localhost o a una IP privada. Se detecta aqui para devolver un mensaje claro
// en lugar de mandar al comprador a una pagina de error de CloudFront.
const isLocalHost = (value) => {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".localhost") ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return false;
  }
};

// Base de la URL de retorno. WOMPI_REDIRECT_URL permite usar un tunel publico
// al probar en local (donde FRONTEND_URL es localhost y Wompi lo bloquea).
const redirectBase = () => (WOMPI_REDIRECT_URL || FRONTEND_URL || "").replace(/\/$/, "");

const eventAgeSeconds = (timestamp) => {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.floor(Date.now() / 1000 - seconds);
};

// Firma de integridad del checkout:
//   SHA256(reference + amountInCents + currency + integritySecret)
const integritySignature = ({ reference, amountInCents, currency }) =>
  sha256(
    `${reference}${amountInCents}${currency}${WOMPI_INTEGRITY_SECRET}`,
  );

// Referencia unica por intento. Wompi exige que no se repita entre cobros.
const newReference = (order) => {
  const suffix = crypto.randomBytes(4).toString("hex");
  return `${order.orderNumber}-${suffix}`;
};

const buildCheckoutUrl = ({ reference, amountInCents, currency, orderId }) => {
  const params = new URLSearchParams({
    "public-key": WOMPI_PUBLIC_KEY,
    currency,
    "amount-in-cents": String(amountInCents),
    reference,
    "signature:integrity": integritySignature({
      reference,
      amountInCents,
      currency,
    }),
    // Sin cadena de consulta: al volver, Wompi agrega su propio `?id=<id de
    // transacción>`. Si ya hubiera un `?pago=...`, Wompi lo concatenaría mal
    // (quedaría "pago=wompi?id=...") y el cliente no detectaría el retorno.
    // El cliente detecta la vuelta por la presencia de `id`; el webhook sigue
    // siendo la fuente de verdad.
    "redirect-url": `${redirectBase()}/mis-pedidos/${orderId}`,
  });

  return `${WOMPI_CHECKOUT_URL}?${params.toString()}`;
};

// ---------------------------------------------------------------------------
// Eventos (webhook)
// ---------------------------------------------------------------------------

// Lee "transaction.amount_in_cents" dentro de data{}.
const getValueByPath = (source, path) => {
  const keys = String(path).split(".");
  let current = source;
  for (const key of keys) {
    if (current === undefined || current === null) return undefined;
    current = current[key];
  }
  return current;
};

// checksum = SHA256(valores de signature.properties + timestamp + eventsSecret)
const eventChecksum = ({ data, timestamp, properties }) => {
  const values = properties.map((property) => getValueByPath(data, property));
  return sha256(`${values.join("")}${timestamp}${WOMPI_EVENTS_SECRET}`);
};

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

// Verifica la firma del evento. Acepta el checksum del cuerpo o el header
// X-Event-Checksum (Wompi manda ambos); si vienen los dos, deben coincidir.
const verifyEventSignature = (event, headerChecksum) => {
  if (!isEventsConfigured()) return false;

  const signature = event?.signature;
  const properties = signature?.properties;
  if (!Array.isArray(properties) || properties.length === 0) return false;

  const computed = eventChecksum({
    data: event.data,
    timestamp: event.timestamp,
    properties,
  });

  if (signature.checksum && !safeEqual(computed, signature.checksum)) {
    return false;
  }
  if (headerChecksum && !safeEqual(computed, headerChecksum)) {
    return false;
  }

  // Si no vino ningun checksum, no hay nada que verificar.
  return Boolean(signature.checksum || headerChecksum);
};

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

const STATUS_MAP = {
  APPROVED: PAYMENT_STATUS.APROBADO,
  DECLINED: PAYMENT_STATUS.RECHAZADO,
  ERROR: PAYMENT_STATUS.ERROR,
  PENDING: PAYMENT_STATUS.PENDIENTE,
  VOIDED: PAYMENT_STATUS.ANULADO,
};

// VOIDED sobre un pago ya aprobado = el dinero se devolvio: se registra como
// reembolso para no dejar un pedido "aprobado" que en realidad se anulo.
const mapProviderStatus = (providerStatus, currentStatus) => {
  const normalized = String(providerStatus || "").toUpperCase();
  if (
    normalized === "VOIDED" &&
    currentStatus === PAYMENT_STATUS.APROBADO
  ) {
    return PAYMENT_STATUS.REEMBOLSADO;
  }
  return STATUS_MAP[normalized] || null;
};

// ---------------------------------------------------------------------------
// Consulta directa a la API de Wompi (respaldo del webhook)
// ---------------------------------------------------------------------------

const fetchTransaction = async (transactionId) => {
  if (!isVerifyConfigured()) {
    throw new HttpError(503, "La verificación de pagos no está configurada");
  }

  const id = String(transactionId || "").trim();
  if (!id) {
    throw new HttpError(400, "Falta el id de la transacción");
  }

  const response = await fetch(
    `${WOMPI_BASE_URL}/transactions/${encodeURIComponent(id)}`,
    {
      headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` },
    },
  );

  if (response.status === 404) {
    throw new HttpError(404, "Transacción no encontrada en Wompi");
  }
  if (!response.ok) {
    const detalle = await response.text().catch(() => "");
    console.error("Wompi respondió", response.status, detalle.slice(0, 300));
    throw new HttpError(502, "No se pudo consultar la transacción en Wompi");
  }

  const body = await response.json();
  return body?.data || null;
};

// ---------------------------------------------------------------------------
// Aplicar una transaccion al pago/pedido
// ---------------------------------------------------------------------------

// Devuelve { applied, reason } sin lanzar por eventos que no nos incumben:
// el webhook debe responder 200 para que Wompi no reintente eternamente.
const applyProviderTransaction = async ({
  providerTransaction,
  event = null,
  transaction,
}) => {
  const reference = providerTransaction?.reference;
  if (!reference) return { applied: false, reason: "sin_referencia" };

  const payment = await Payment.findOne({
    where: { reference },
    transaction,
  });

  if (!payment) return { applied: false, reason: "referencia_desconocida" };
  if (payment.provider !== PROVIDER_WOMPI) {
    return { applied: false, reason: "pago_no_wompi" };
  }

  const providerTransactionId = String(providerTransaction.id || "");
  if (
    payment.providerTransactionId &&
    payment.providerTransactionId !== providerTransactionId
  ) {
    return { applied: false, reason: "otra_transaccion" };
  }

  // El monto y la moneda tienen que coincidir con lo que se le pidio cobrar.
  const amount = Number(providerTransaction.amount_in_cents);
  if (Number(payment.amountInCents) !== amount) {
    logWebhook(
      "rechazado",
      {
        motivo: "monto_no_coincide",
        reference,
        orderId: payment.orderId,
        esperado: Number(payment.amountInCents),
        recibido: amount,
      },
      "error",
    );
    return { applied: false, reason: "monto_no_coincide" };
  }
  if (
    providerTransaction.currency &&
    providerTransaction.currency !== payment.currency
  ) {
    logWebhook(
      "rechazado",
      {
        motivo: "moneda_no_coincide",
        reference,
        orderId: payment.orderId,
        esperado: payment.currency,
        recibido: providerTransaction.currency,
      },
      "error",
    );
    return { applied: false, reason: "moneda_no_coincide" };
  }

  const nextStatus = mapProviderStatus(
    providerTransaction.status,
    payment.status,
  );
  if (!nextStatus) return { applied: false, reason: "estado_desconocido" };

  // Idempotencia: mismo estado -> solo se completan datos que falten.
  if (payment.status === nextStatus) {
    return { applied: false, reason: "ya_procesado", payment, status: nextStatus };
  }

  const result = await registerPayment({
    orderId: payment.orderId,
    provider: PROVIDER_WOMPI,
    reference,
    status: nextStatus,
    providerTransactionId,
    wompiStatus: providerTransaction.status,
    statusMessage: providerTransaction.status_message,
    paymentMethodType: providerTransaction.payment_method_type,
    rawPayload: event || providerTransaction,
    note: "Estado actualizado automáticamente por Wompi",
    transaction,
  });

  return {
    applied: true,
    reason: "aplicado",
    status: nextStatus,
    payment: result.payment,
    order: result.order,
  };
};

// ---------------------------------------------------------------------------
// API publica del servicio
// ---------------------------------------------------------------------------

// POST /api/orders/:id/payment — crea (o reutiliza) el intento de pago y
// devuelve la URL de Web Checkout.
const createCheckoutForOrder = async ({ orderId, userId }) => {
  assertUuid(orderId, "pedido");

  if (!isCheckoutConfigured()) {
    throw new HttpError(503, "El pago en línea no está disponible todavía");
  }

  const base = redirectBase();
  if (!base) {
    // Sin esto Wompi redirigiria a "undefined/mis-pedidos/..." tras el cobro.
    throw new HttpError(
      503,
      "Falta configurar FRONTEND_URL (o WOMPI_REDIRECT_URL) en el servidor",
    );
  }
  if (isLocalHost(base)) {
    // Wompi responde 403 en el checkout cuando el redirect es localhost.
    throw new HttpError(
      503,
      "Wompi bloquea el pago cuando la URL de retorno es localhost. Configura WOMPI_REDIRECT_URL con una URL pública (por ejemplo un túnel) para probar el pago en línea.",
    );
  }

  const order = await Order.findOne({ where: { id: orderId, userId } });
  if (!order) {
    throw new HttpError(404, "Pedido no encontrado");
  }
  if (order.status !== ORDER_STATUS.PENDIENTE_PAGO) {
    throw new HttpError(409, "El pedido ya no está pendiente de pago");
  }
  if (
    [PAYMENT_STATUS.APROBADO, PAYMENT_STATUS.REEMBOLSADO].includes(
      order.paymentStatus,
    )
  ) {
    throw new HttpError(409, "Este pedido ya está pagado");
  }

  // Un pedido de total $0 (articulo al 100%) no se cobra en linea: Wompi no
  // acepta montos en cero. Se confirma manualmente.
  if (Number(order.total) <= 0) {
    throw new HttpError(
      409,
      "Este pedido es gratuito (total $0): no se cobra en línea, confírmalo manualmente",
    );
  }

  // Reutiliza el intento pendiente si existe: recargar la pagina no debe
  // llenar la tabla de pagos ni cambiar la referencia que ya se mostro.
  let payment = await Payment.findOne({
    where: {
      orderId: order.id,
      provider: PROVIDER_WOMPI,
      status: PAYMENT_STATUS.PENDIENTE,
    },
    order: [["createdAt", "DESC"]],
  });

  if (!payment) {
    const created = await registerPayment({
      orderId: order.id,
      provider: PROVIDER_WOMPI,
      reference: newReference(order),
      status: PAYMENT_STATUS.PENDIENTE,
      note: "Intento de pago en línea iniciado",
    });
    payment = created.payment;
  }

  const amountInCents = Number(payment.amountInCents);

  return {
    url: buildCheckoutUrl({
      reference: payment.reference,
      amountInCents,
      currency: payment.currency,
      orderId: order.id,
    }),
    reference: payment.reference,
    amountInCents,
    currency: payment.currency,
    env: WOMPI_ENV,
  };
};

// POST /api/payments/webhook — Wompi avisa el resultado del cobro.
//
// Todos los caminos quedan registrados con un log estructurado (aplicado /
// ignorado / rechazado) para poder reconstruir un cobro sin mirar la base.
const handleWebhook = async (event, headerChecksum) => {
  const providerTransaction = event?.data?.transaction;
  const resumen = {
    event: event?.event || null,
    environment: event?.environment || null,
    reference: providerTransaction?.reference || null,
    transactionId: providerTransaction?.id || null,
    providerStatus: providerTransaction?.status || null,
    timestamp: event?.timestamp ?? null,
  };

  if (!isEventsConfigured()) {
    logWebhook("rechazado", { ...resumen, motivo: "sin_secreto" }, "warn");
    throw new HttpError(503, "Los eventos de pago no están configurados");
  }

  if (!verifyEventSignature(event, headerChecksum)) {
    logWebhook("rechazado", { ...resumen, motivo: "firma_invalida" }, "warn");
    throw new HttpError(401, "Firma del evento inválida");
  }

  // Ventana anti-replay. Un evento del futuro es una anomalia y se rechaza;
  // uno viejo solo se marca, porque Wompi puede tardar horas en reintentar
  // tras una caida nuestra y perder un pago real es peor que aceptar un
  // evento repetido (que de todos modos es idempotente).
  const edad = eventAgeSeconds(event.timestamp);

  if (edad !== null && edad < -FUTURE_TOLERANCE_SECONDS) {
    logWebhook(
      "rechazado",
      { ...resumen, motivo: "timestamp_futuro", edadSegundos: edad },
      "warn",
    );
    throw new HttpError(401, "El evento tiene una marca de tiempo inválida");
  }

  if (edad !== null && edad > WOMPI_EVENT_MAX_AGE_SECONDS) {
    logWebhook(
      "aviso",
      { ...resumen, motivo: "evento_antiguo", edadSegundos: edad },
      "warn",
    );
  }

  // Solo interesa el cambio de estado de una transaccion.
  if (event.event !== "transaction.updated") {
    logWebhook("ignorado", { ...resumen, motivo: "evento_no_soportado" });
    return { received: true, ignored: "evento_no_soportado" };
  }

  // Un evento del sandbox no debe tocar datos de produccion ni al reves.
  const eventEnv = normalizeEnvironment(event.environment);
  const expectedEnv = normalizeEnvironment(WOMPI_ENV);
  if (eventEnv && eventEnv !== expectedEnv) {
    // Si el valor no es uno conocido, la firma (firmada con el secreto del
    // ambiente) ya garantiza que el evento es del ambiente correcto: se deja
    // pasar y solo se deja constancia en el log.
    if (KNOWN_ENVIRONMENTS.has(eventEnv)) {
      logWebhook("ignorado", { ...resumen, motivo: "ambiente_distinto" });
      return { received: true, ignored: "ambiente_distinto" };
    }
    logWebhook(
      "aviso",
      { ...resumen, motivo: "ambiente_desconocido", environment: eventEnv },
      "warn",
    );
  }

  if (!providerTransaction) {
    logWebhook("rechazado", { ...resumen, motivo: "sin_transaccion" }, "warn");
    throw new HttpError(400, "Evento sin transacción");
  }

  const result = await applyProviderTransaction({
    providerTransaction,
    event,
  });

  if (result.applied) {
    logWebhook("aplicado", {
      ...resumen,
      orderId: result.order?.id || null,
      status: result.status,
    });
  } else {
    logWebhook("ignorado", { ...resumen, motivo: result.reason });
  }

  return {
    received: true,
    applied: result.applied,
    reason: result.reason,
    status: result.status || null,
  };
};

// POST /api/orders/:id/payment/verify — respaldo del webhook (y util para
// probar en localhost, donde Wompi no puede alcanzar el webhook).
const verifyOrderPayment = async ({ orderId, userId, transactionId }) => {
  assertUuid(orderId, "pedido");

  const order = await Order.findOne({ where: { id: orderId, userId } });
  if (!order) {
    throw new HttpError(404, "Pedido no encontrado");
  }

  const providerTransaction = await fetchTransaction(transactionId);

  if (!providerTransaction) {
    throw new HttpError(404, "Wompi no devolvió la transacción");
  }

  const payment = await Payment.findOne({
    where: { reference: providerTransaction.reference },
  });

  if (!payment || payment.orderId !== order.id) {
    throw new HttpError(409, "La transacción no pertenece a este pedido");
  }

  const result = await applyProviderTransaction({ providerTransaction });

  return {
    applied: result.applied,
    reason: result.reason,
    status: result.status || payment.status,
    order: await getOrderForUser({
      orderId: order.id,
      userId,
      admin: false,
    }),
  };
};

module.exports = {
  PROVIDER_WOMPI,
  isCheckoutConfigured,
  isEventsConfigured,
  isVerifyConfigured,
  integritySignature,
  eventChecksum,
  verifyEventSignature,
  mapProviderStatus,
  fetchTransaction,
  applyProviderTransaction,
  createCheckoutForOrder,
  handleWebhook,
  verifyOrderPayment,
};
