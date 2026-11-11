// Webhook de eventos de pedido/envio de Venndelo (chatbot connections).
//
// Venndelo avisa cambios del ciclo logistico de un pedido:
//   ORDER_CREATED, ORDER_CANCELLED, ORDER_CONFIRMATION_REQUESTED,
//   ORDER_PREPARED, READY_FOR_PICKUP, ORDER_SHIPPED, ORDER_DELIVERED,
//   SHIPMENT_EXCEPTION_CREATED, SHIPMENT_STATUS_UPDATED
//
// IMPORTANTE: este webhook NO es la confirmacion de un pago de cliente. El
// dinero del comprador lo confirma Wompi (Services/wompi.js). Aqui solo se
// registra el evento y se deja preparado el enganche con la base de Upbuy.
//
// Reglas:
//   - Si VENNDELO_WEBHOOK_SECRET esta configurado, se exige una firma HMAC
//     SHA-256 valida. Si no, el evento se acepta y se deja un aviso en el log
//     (nunca se rompe la integracion por una variable faltante).
//   - Idempotencia via WebhookEvent(provider = "venndelo", eventId).
//   - Siempre se responde 200 a un evento autentico: el proveedor reintenta
//     durante horas y un fallo nuestro no debe convertirse en una tormenta.
const crypto = require("crypto");
const { VENNDELO_WEBHOOK_SECRET } = require("../config.js");
const { beginWebhookEvent, finishWebhookEvent } = require("./webhookEvents.js");
const HttpError = require("../Utils/HttpError.js");
const { createLogger } = require("../Utils/logger.js");

const log = createLogger("webhook.venndelo");
const PROVIDER = "venndelo";

// Estados que el chatbot de Venndelo puede emitir. Se usa solo para el log;
// un evento desconocido se registra igual (no se descarta a ciegas).
const KNOWN_EVENTS = new Set([
  "ORDER_CREATED",
  "ORDER_CANCELLED",
  "ORDER_CONFIRMATION_REQUESTED",
  "ORDER_PREPARED",
  "READY_FOR_PICKUP",
  "ORDER_SHIPPED",
  "ORDER_DELIVERED",
  "SHIPMENT_EXCEPTION_CREATED",
  "SHIPMENT_STATUS_UPDATED",
]);

const isConfigured = () => Boolean(VENNDELO_WEBHOOK_SECRET);

// Lectura defensiva del payload: distintas variantes del mismo campo.
const pick = (data, keys) => {
  for (const key of keys) {
    const value = key.split(".").reduce((acc, part) => acc?.[part], data);
    if (value !== undefined && value !== null) return value;
  }
  return null;
};

const extractEvent = (body) =>
  pick(body, ["event", "type", "event_type", "data.event", "data.type"]);

const extractOrderId = (body) =>
  pick(body, [
    "order_id",
    "orderId",
    "data.order_id",
    "data.orderId",
    "order.id",
    "data.order.id",
  ]);

const extractEventId = (body, event, orderId) => {
  const explicit = pick(body, [
    "event_id",
    "eventId",
    "id",
    "data.event_id",
    "data.eventId",
    "data.id",
  ]);
  if (explicit) return String(explicit);
  // Sin id explicito: clave estable por tipo + pedido + timestamp. Un
  // reintento del mismo evento se deduplica; una transicion nueva no.
  const stamp = pick(body, ["timestamp", "created_at", "data.timestamp"]);
  return crypto
    .createHash("sha256")
    .update(`${event || ""}|${orderId || ""}|${stamp || ""}`)
    .digest("hex");
};

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

// Firma HMAC-SHA256 del cuerpo. Se acepta el header `x-venndelo-signature` o
// `x-signature`, en hex o base64.
// TODO: confirmar contra la doc de Venndelo el header y el algoritmo exactos.
const verifySignature = ({ body, headers = {} }) => {
  if (!isConfigured()) return null; // sin secreto: no se puede verificar

  const received =
    headers["x-venndelo-signature"] ||
    headers["x-signature"] ||
    headers["x-webhook-secret"];
  if (!received) return false;

  const raw = typeof body === "string" ? body : JSON.stringify(body || {});
  const digest = crypto
    .createHmac("sha256", VENNDELO_WEBHOOK_SECRET)
    .update(raw)
    .digest();

  return (
    safeEqual(received, digest.toString("hex")) ||
    safeEqual(received, digest.toString("base64")) ||
    safeEqual(received, VENNDELO_WEBHOOK_SECRET)
  );
};

// POST /api/webhooks/venndelo
const handleVenndeloWebhook = async ({ body, headers } = {}) => {
  const signature = verifySignature({ body, headers });
  if (signature === false) {
    log.warn("Firma del webhook de Venndelo inválida");
    throw new HttpError(401, "Firma del evento inválida");
  }
  if (signature === null) {
    log.warn(
      "VENNDELO_WEBHOOK_SECRET no configurado: el evento se acepta sin verificar firma",
    );
  }

  const event = extractEvent(body);
  const orderId = extractOrderId(body);
  const eventId = extractEventId(body, event, orderId);

  if (event && !KNOWN_EVENTS.has(String(event))) {
    log.warn("Evento de Venndelo no reconocido", { event });
  }

  const { duplicate, record } = await beginWebhookEvent({
    provider: PROVIDER,
    eventId,
    event: event ? String(event) : "desconocido",
    payload: body,
  });

  if (duplicate) {
    log.info("Evento de Venndelo repetido; se ignora", { event, orderId });
    return { received: true, applied: false, reason: "ya_procesado" };
  }

  try {
    // Aqui se enganchara la actualizacion del pedido en Upbuy. Por ahora solo
    // se registra el evento completo (WebhookEvent) y un resumen en el log.
    // TODO: mapear ORDER_* a los estados canonicos de Upbuy y actualizar
    // `orders`/`OrderStatusHistory` cuando se confirme el payload exacto.
    log.info("Evento de Venndelo recibido", {
      event,
      orderId,
      eventId,
    });

    await finishWebhookEvent(record, { ok: true });

    return {
      received: true,
      applied: false,
      reason: "registrado",
      event: event || null,
      orderId: orderId || null,
    };
  } catch (error) {
    await finishWebhookEvent(record, { ok: false, error: error.message });
    throw error;
  }
};

module.exports = {
  PROVIDER,
  KNOWN_EVENTS,
  isConfigured,
  verifySignature,
  handleVenndeloWebhook,
  extractEvent,
  extractOrderId,
  extractEventId,
};