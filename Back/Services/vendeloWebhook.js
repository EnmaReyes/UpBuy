// Webhook de pagos de Vendelo.
//
// Vendelo puede confirmar un cobro por su propio checkout. La forma exacta
// del payload no esta documentada en este repo, asi que se lee de forma
// defensiva (varias claves posibles) y, sobre todo, NUNCA se confia en el
// monto que llega: el monto real se relee desde el Payment de Upbuy.
//
// Igual que Wompi:
//   - la firma se verifica con VENDELO_WEBHOOK_SECRET (HMAC-SHA256),
//   - el evento es idempotente via WebhookEvent(provider, eventId),
//   - se responde 200 siempre que el evento sea autentico, para que el
//     proveedor no reintente eternamente.

const crypto = require("crypto");
const { Payment } = require("../DataBase/models/index.js");
const { PAYMENT_STATUS } = require("../DataBase/models/enums.js");
const { VENDELO_WEBHOOK_SECRET } = require("../config.js");
const { registerPayment } = require("./payments.js");
const { beginWebhookEvent, finishWebhookEvent } = require("./webhookEvents.js");
const HttpError = require("../Utils/HttpError.js");
const { createLogger } = require("../Utils/logger.js");

const log = createLogger("webhook.vendelo");

const PROVIDER_VENDELO = "vendelo";

const isConfigured = () => Boolean(VENDELO_WEBHOOK_SECRET);

// Estado de Vendelo -> ciclo del INTENTO de pago (payments.status).
const STATUS_MAP = {
  approved: PAYMENT_STATUS.APROBADO,
  aprobado: PAYMENT_STATUS.APROBADO,
  paid: PAYMENT_STATUS.APROBADO,
  success: PAYMENT_STATUS.APROBADO,
  completed: PAYMENT_STATUS.APROBADO,
  settled: PAYMENT_STATUS.APROBADO,

  pending: PAYMENT_STATUS.PENDIENTE,
  processing: PAYMENT_STATUS.PENDIENTE,
  en_revision: PAYMENT_STATUS.EN_REVISION,

  declined: PAYMENT_STATUS.RECHAZADO,
  rechazado: PAYMENT_STATUS.RECHAZADO,
  failed: PAYMENT_STATUS.RECHAZADO,
  rejected: PAYMENT_STATUS.RECHAZADO,

  voided: PAYMENT_STATUS.ANULADO,
  anulado: PAYMENT_STATUS.ANULADO,
  cancelled: PAYMENT_STATUS.ANULADO,
  canceled: PAYMENT_STATUS.ANULADO,

  refunded: PAYMENT_STATUS.REEMBOLSADO,
  reembolsado: PAYMENT_STATUS.REEMBOLSADO,

  error: PAYMENT_STATUS.ERROR,
};

const mapStatus = (status) => {
  const key = String(status || "").trim().toLowerCase();
  return STATUS_MAP[key] || null;
};

const pick = (data, keys) => {
  for (const key of keys) {
    const value = key.split(".").reduce((acc, part) => acc?.[part], data);
    if (value !== undefined && value !== null) return value;
  }
  return null;
};

const extractReference = (body) =>
  pick(body, [
    "reference",
    "payment.reference",
    "data.reference",
    "data.payment.reference",
    "transaction.reference",
    "data.transaction.reference",
  ]);

const extractStatus = (body) =>
  pick(body, [
    "status",
    "payment.status",
    "data.status",
    "data.payment.status",
    "transaction.status",
    "data.transaction.status",
  ]);

const extractEventId = (body, reference, status) => {
  const explicit = pick(body, [
    "id",
    "eventId",
    "event_id",
    "data.id",
    "data.eventId",
    "payment.id",
    "data.payment.id",
  ]);
  if (explicit) return String(explicit);
  // Sin id explicito, la clave estable es referencia + estado: un reintento
  // del mismo cambio se deduplica; una transicion distinta no.
  return crypto
    .createHash("sha256")
    .update(`${reference || ""}|${status || ""}`)
    .digest("hex");
};

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

// El proveedor puede firmar el cuerpo con HMAC-SHA256 en el header
// `x-vendelo-signature` (hex) o `x-signature`. Si no hay header, se rechaza:
// un webhook de dinero sin firma no se procesa.
const verifySignature = ({ body, headers = {} }) => {
  if (!isConfigured()) return false;

  const received =
    headers["x-vendelo-signature"] ||
    headers["x-signature"] ||
    headers["x-webhook-secret"];
  if (!received) return false;

  const raw = typeof body === "string" ? body : JSON.stringify(body || {});
  const expected = crypto
    .createHmac("sha256", VENDELO_WEBHOOK_SECRET)
    .update(raw)
    .digest("hex");

  return safeEqual(received, expected) || safeEqual(received, VENDELO_WEBHOOK_SECRET);
};

const handleVendeloWebhook = async ({ body, headers } = {}) => {
  if (!isConfigured()) {
    throw new HttpError(503, "El webhook de Vendelo no está configurado");
  }

  if (!verifySignature({ body, headers })) {
    log.warn("Firma del webhook inválida");
    throw new HttpError(401, "Firma del evento inválida");
  }

  const reference = extractReference(body);
  const providerStatus = extractStatus(body);

  if (!reference) {
    return { received: true, applied: false, reason: "sin_referencia" };
  }

  const eventId = extractEventId(body, reference, providerStatus);

  const { duplicate, record } = await beginWebhookEvent({
    provider: PROVIDER_VENDELO,
    eventId,
    event: pick(body, ["event", "type", "data.event"]) || "payment.updated",
    payload: body,
  });

  if (duplicate) {
    return { received: true, applied: false, reason: "ya_procesado" };
  }

  try {
    const payment = await Payment.findOne({ where: { reference } });
    if (!payment) {
      await finishWebhookEvent(record, { ok: true });
      return { received: true, applied: false, reason: "referencia_desconocida" };
    }
    if (payment.provider !== PROVIDER_VENDELO) {
      await finishWebhookEvent(record, { ok: true });
      return { received: true, applied: false, reason: "pago_no_vendelo" };
    }

    const nextStatus = mapStatus(providerStatus);
    if (!nextStatus) {
      await finishWebhookEvent(record, { ok: true });
      return { received: true, applied: false, reason: "estado_desconocido" };
    }

    if (payment.status === nextStatus) {
      await finishWebhookEvent(record, { ok: true });
      return { received: true, applied: false, reason: "ya_procesado" };
    }

    const result = await registerPayment({
      orderId: payment.orderId,
      provider: PROVIDER_VENDELO,
      reference,
      status: nextStatus,
      providerTransactionId: pick(body, [
        "transactionId",
        "transaction.id",
        "data.transaction.id",
        "payment.transactionId",
      ]),
      statusMessage: pick(body, [
        "statusMessage",
        "message",
        "data.message",
      ]),
      paymentMethodType: pick(body, [
        "paymentMethod",
        "payment_method",
        "data.paymentMethod",
      ]),
      // El monto del webhook NO se usa: registerPayment lo toma del pedido.
      rawPayload: body,
      note: "Estado actualizado automáticamente por Vendelo",
    });

    await finishWebhookEvent(record, { ok: true });

    return {
      received: true,
      applied: true,
      reason: "aplicado",
      status: nextStatus,
      orderId: result.order?.id || null,
    };
  } catch (error) {
    await finishWebhookEvent(record, { ok: false, error: error.message });
    throw error;
  }
};

module.exports = {
  PROVIDER_VENDELO,
  isConfigured,
  verifySignature,
  mapStatus,
  handleVendeloWebhook,
  STATUS_MAP,
};
