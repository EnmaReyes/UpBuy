// Idempotencia de webhooks.
//
// Los proveedores de pago reintentan sus eventos durante horas (Wompi lo
// hace) y algunos mandan el mismo evento varias veces por su cuenta. El
// indice unico (provider, eventId) es la barrera: el segundo INSERT choca y
// el evento se ignora.
//
// Nunca se responde 4xx por un evento repetido: el proveedor lo
// reinterpretaria como fallo y seguiria reintentando.

const { UniqueConstraintError } = require("sequelize");
const { WebhookEvent } = require("../DataBase/models/index.js");
const { createLogger } = require("../Utils/logger.js");

const log = createLogger("webhooks");

// Registra el evento si es la primera vez que se ve.
//
// Devuelve:
//   { duplicate: true, record }  -> ya estaba; no reprocesar
//   { duplicate: false, record } -> seguir con el procesamiento
const beginWebhookEvent = async ({ provider, eventId, event, payload }) => {
  const id = String(eventId || "").trim();
  if (!id) {
    // Sin identificador no hay idempotencia posible. Se procesa igual (es
    // mejor aplicar un cambio dos veces que perderlo), pero queda el aviso.
    log.warn("Evento de webhook sin id; no se puede deduplicar", { provider });
    return { duplicate: false, record: null };
  }

  try {
    const record = await WebhookEvent.create({
      provider,
      eventId: id.slice(0, 200),
      event: event ? String(event).slice(0, 80) : null,
      payload: payload || {},
      processed: false,
    });
    return { duplicate: false, record };
  } catch (error) {
    if (!(error instanceof UniqueConstraintError)) throw error;

    const existing = await WebhookEvent.findOne({
      where: { provider, eventId: id.slice(0, 200) },
    });

    if (existing?.processed) {
      return { duplicate: true, record: existing };
    }

    // El evento se registro antes pero el procesamiento fallo: se reintenta.
    return { duplicate: false, record: existing };
  }
};

// Marca el evento como procesado (o guarda el error para revisarlo a mano).
const finishWebhookEvent = async (record, { ok = true, error = null } = {}) => {
  if (!record) return null;
  try {
    record.processed = Boolean(ok);
    record.processedAt = ok ? new Date() : null;
    record.error = error ? String(error).slice(0, 2000) : null;
    await record.save();
    return record;
  } catch (saveError) {
    log.error("No se pudo actualizar el registro del webhook", {
      error: saveError.message,
      webhookEventId: record.id,
    });
    return null;
  }
};

module.exports = { beginWebhookEvent, finishWebhookEvent };
