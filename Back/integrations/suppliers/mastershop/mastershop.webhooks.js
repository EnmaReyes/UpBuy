// Webhooks de estado/tracking de MasterShop.
//
// Dos responsabilidades:
//   1. Registrar/gestionar las suscripciones (`POST/PUT /api/webhooks`) y
//      persistir el `idProductWebhook`, que MasterShop no vuelve a exponer.
//   2. Interpretar (de forma defensiva) el cuerpo que MasterShop envia. El
//      cuerpo NO trae firma HMAC, asi que NUNCA se usa como fuente de verdad:
//      solo sirve para saber que pedido reconsultar con `GET /api/orders`.
//
// El payload exacto no esta documentado campo por campo. Por eso la lectura
// acepta varias formas y siempre cae a la reconsulta.
const crypto = require("crypto");
const { requestJson, assertConfigured } = require("./mastershop.client.js");
const { createLogger } = require("../../../Utils/logger.js");

const log = createLogger("mastershop.webhooks");

// Eventos que expone el contrato de MasterShop.
const WEBHOOK_EVENTS = {
  ORDER_STATUS: 16,
  CARRIER_STATUS: 17,
  DELIVERED: 18,
};

const WEBHOOK_EVENT_VALUES = Object.values(WEBHOOK_EVENTS);

// Lectura defensiva: devuelve el primer valor no nulo de una lista de rutas.
const pick = (data, keys) => {
  for (const key of keys) {
    const value = key
      .split(".")
      .reduce((acc, part) => (acc === null || acc === undefined ? acc : acc[part]), data);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
};

const asString = (value) =>
  value === null || value === undefined ? null : String(value);

// Extrae lo minimo para identificar el pedido. Todo lo demas se reconsulta.
const parseWebhookBody = (body) => {
  const idWebhook = Number(
    pick(body, [
      "idWebhook",
      "id_webhook",
      "webhookId",
      "webhook.idWebhook",
      "data.idWebhook",
    ]),
  );

  const idOrder = asString(
    pick(body, [
      "idOrder",
      "id_order",
      "order.idOrder",
      "order.id",
      "data.idOrder",
      "data.order.idOrder",
      "data.order.id",
    ]),
  );

  const externalOrderId = asString(
    pick(body, [
      "externalOrderId",
      "external_order_id",
      "order.externalOrderId",
      "data.externalOrderId",
      "data.order.externalOrderId",
    ]),
  );

  const explicitEventId = pick(body, [
    "eventId",
    "event_id",
    "data.eventId",
    "data.event_id",
  ]);

  // Sin id explicito: hash del cuerpo completo. Un reintento identico se
  // deduplica; un cambio nuevo (otro cuerpo) no.
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(body || {}))
    .digest("hex");
  const eventId = explicitEventId
    ? String(explicitEventId)
    : `${Number.isFinite(idWebhook) ? idWebhook : "evento"}|${idOrder || externalOrderId || ""}|${hash}`;

  return {
    idWebhook: Number.isFinite(idWebhook) && idWebhook > 0 ? idWebhook : null,
    idOrder,
    externalOrderId,
    eventId: eventId.slice(0, 200),
    event:
      Number.isFinite(idWebhook) && idWebhook > 0
        ? `idWebhook:${idWebhook}`
        : "desconocido",
  };
};

// Estado crudo del pedido que devuelve GET /api/orders.
const extractRemoteStatus = (remoteOrder) =>
  asString(
    pick(remoteOrder, [
      "status",
      "orderStatus",
      "order_status",
      "order.status",
      "data.status",
    ]),
  );

// Logistica/tracking: se aceptan varias formas porque el contrato no esta
// documentado campo por campo. Se prefiere la ultima entrada con guia.
const toArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const extractTracking = (remoteOrder) => {
  const candidates = [
    ...toArray(remoteOrder?.order_logistics),
    ...toArray(remoteOrder?.orderLogistics),
    ...toArray(remoteOrder?.logistics),
    ...toArray(remoteOrder?.shipment),
    ...toArray(remoteOrder?.order?.order_logistics),
    ...toArray(remoteOrder?.order?.logistics),
  ];

  let trackingNumber = asString(
    pick(remoteOrder, [
      "trackingNumber",
      "tracking_number",
      "carrier_tracking_code",
      "order.trackingNumber",
      "data.trackingNumber",
    ]),
  );
  let trackingUrl = asString(
    pick(remoteOrder, [
      "trackingUrl",
      "tracking_url",
      "url_tracking",
      "order.trackingUrl",
      "data.trackingUrl",
    ]),
  );
  let trackingCarrier = asString(
    pick(remoteOrder, [
      "trackingCarrier",
      "tracking_carrier",
      "carrier_name",
      "carrier",
      "order.trackingCarrier",
      "data.trackingCarrier",
    ]),
  );

  for (const entry of candidates) {
    const number = asString(
      pick(entry, [
        "carrier_tracking_code",
        "trackingNumber",
        "tracking_number",
        "numero_guia",
        "guide",
        "guia",
      ]),
    );
    const url = asString(
      pick(entry, ["url_tracking", "trackingUrl", "tracking_url", "url"]),
    );
    const carrier = asString(
      pick(entry, ["carrier_name", "carrier", "transportadora", "courier"]),
    );

    if (number) trackingNumber = number;
    if (url) trackingUrl = url;
    if (carrier) trackingCarrier = carrier;
  }

  return { trackingNumber, trackingUrl, trackingCarrier };
};

// ---------------------------------------------------------------------------
// Suscripciones
// ---------------------------------------------------------------------------

const buildSubscriptionBody = ({ idWebhook, url, name }) => {
  const safeName = String(name || `UPBUY pedidos ${idWebhook}`).slice(0, 120);
  return {
    idWebhook,
    url,
    name: safeName,
    // El contrato pide ambos; `idProduct` se ignora.
    webhookName: safeName,
  };
};

const createSubscription = async ({ idWebhook, url, name }) => {
  assertConfigured();
  const data = await requestJson("POST", "/api/webhooks", {
    body: buildSubscriptionBody({ idWebhook, url, name }),
  });
  const idProductWebhook =
    data?.idProductWebhook ??
    data?.id_product_webhook ??
    data?.data?.idProductWebhook ??
    data?.id ??
    null;

  log.info("Suscripcion de webhook creada", {
    idWebhook,
    idProductWebhook: idProductWebhook != null ? String(idProductWebhook) : null,
  });

  return {
    ok: true,
    idProductWebhook:
      idProductWebhook != null ? String(idProductWebhook) : null,
    raw: data || {},
  };
};

const setSubscriptionEnabled = async (idProductWebhook, isEnable) => {
  assertConfigured();
  const data = await requestJson("PUT", "/api/webhooks", {
    body: { idProductWebhook, isEnable: Boolean(isEnable) },
  });
  return { ok: true, raw: data || {} };
};

module.exports = {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_VALUES,
  pick,
  parseWebhookBody,
  extractRemoteStatus,
  extractTracking,
  buildSubscriptionBody,
  createSubscription,
  setSubscriptionEnabled,
};