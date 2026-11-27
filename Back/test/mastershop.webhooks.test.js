// Pruebas de los webhooks de estado/tracking de MasterShop.
//
// - Parte pura: parseo defensivo del cuerpo, extraccion de tracking y mapeo de
//   estados crudos a los canonicos de UpBuy.
// - Parte de integracion (base local; se salta si no hay): actualizacion del
//   pedido con una reconsulta simulada, respeto a manualOverride e idempotencia
//   del endpoint.
process.chdir(require("path").join(__dirname, ".."));

process.env.MASTERSHOP_API_KEY =
  process.env.MASTERSHOP_API_KEY || "test-ms-api-key-integracion";
process.env.MASTERSHOP_API_URL =
  process.env.MASTERSHOP_API_URL || "https://mastershop.test";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  sequelize,
  Order,
  WebhookEvent,
} = require("../DataBase/models/index.js");
const {
  parseWebhookBody,
  extractRemoteStatus,
  extractTracking,
  buildSubscriptionBody,
  createSubscription,
  setSubscriptionEnabled,
} = require("../integrations/suppliers/mastershop/mastershop.webhooks.js");
const { mapProviderToCanonical } = require("../Services/statusMachine.js");
const {
  refreshMastershopOrderStatus,
  handleMastershopWebhook,
} = require("../Services/mastershopWebhooks.service.js");

const originalFetch = global.fetch;

let dbError = null;

test.before(async () => {
  try {
    await sequelize.authenticate();
    const { ensureMastershopSchema } = require("../DataBase/ensureMastershopSchema.js");
    await ensureMastershopSchema();
  } catch (error) {
    dbError = error;
  }
});

test.after(async () => {
  global.fetch = originalFetch;
  await sequelize.close().catch(() => {});
});

const jsonResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { entries: () => [] },
  data: body,
  text: async () => (body === undefined ? "" : JSON.stringify(body)),
});

const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

// ---------------------------------------------------------------------------
// Parseo (sin base de datos)
// ---------------------------------------------------------------------------

test("parseWebhookBody lee el id interno y el externo", () => {
  const parsed = parseWebhookBody({
    idWebhook: 16,
    idOrder: 3247815,
    externalOrderId: "UPBUY-2026-000011",
    status: "Despachado",
  });

  assert.equal(parsed.idWebhook, 16);
  assert.equal(parsed.idOrder, "3247815");
  assert.equal(parsed.externalOrderId, "UPBUY-2026-000011");
  assert.equal(parsed.event, "idWebhook:16");
  assert.ok(parsed.eventId.length > 0);
});

test("parseWebhookBody acepta variantes anidadas y usa hash sin id explicito", () => {
  const body = {
    data: { idWebhook: 18, order: { idOrder: 55 } },
  };
  const first = parseWebhookBody(body);
  const second = parseWebhookBody(body);

  assert.equal(first.idWebhook, 18);
  assert.equal(first.idOrder, "55");
  // Mismo cuerpo -> mismo eventId (un reintento se deduplica).
  assert.equal(first.eventId, second.eventId);
  // Otro cuerpo -> otro eventId (un cambio nuevo no se descarta).
  assert.notEqual(first.eventId, parseWebhookBody({ ...body, extra: 1 }).eventId);
});

test("parseWebhookBody sin pedido devuelve nulos", () => {
  const parsed = parseWebhookBody({ idWebhook: 16 });
  assert.equal(parsed.idOrder, null);
  assert.equal(parsed.externalOrderId, null);
});

test("extractTracking entiende order_logistics", () => {
  const tracking = extractTracking({
    order_logistics: [
      { carrier_name: "Servientrega", carrier_tracking_code: "OLD" },
      {
        carrier_name: "Servientrega",
        carrier_tracking_code: "GUIA-123",
        url_tracking: "https://rastreo.example/GUIA-123",
      },
    ],
  });

  assert.equal(tracking.trackingNumber, "GUIA-123");
  assert.equal(tracking.trackingUrl, "https://rastreo.example/GUIA-123");
  assert.equal(tracking.trackingCarrier, "Servientrega");
});

test("extractTracking acepta campos planos y devuelve nulos si no hay", () => {
  const flat = extractTracking({ tracking_number: "ABC", url_tracking: "https://x" });
  assert.equal(flat.trackingNumber, "ABC");
  assert.equal(flat.trackingUrl, "https://x");

  const empty = extractTracking({});
  assert.deepEqual(empty, {
    trackingNumber: null,
    trackingUrl: null,
    trackingCarrier: null,
  });
});

test("extractRemoteStatus lee el estado del pedido remoto", () => {
  assert.equal(extractRemoteStatus({ status: "Entregado" }), "Entregado");
  assert.equal(
    extractRemoteStatus({ order: { status: "Despachado" } }),
    "Despachado",
  );
  assert.equal(extractRemoteStatus({}), null);
});

test("los estados crudos de MasterShop se mapean a canonicos", () => {
  const paid = mapProviderToCanonical("mastershop", "Pendiente");
  assert.equal(paid.fulfillmentStatus, "paid");

  const shipped = mapProviderToCanonical("mastershop", "Despachado");
  assert.equal(shipped.fulfillmentStatus, "shipped");

  const delivered = mapProviderToCanonical("mastershop", "Entregado");
  assert.equal(delivered.fulfillmentStatus, "delivered");

  const cancelled = mapProviderToCanonical("mastershop", "Cancelada");
  assert.equal(cancelled.fulfillmentStatus, "cancelled");
});

test("buildSubscriptionBody arma el contrato de alta", () => {
  const body = buildSubscriptionBody({
    idWebhook: 16,
    url: "https://api.example/api/webhooks/mastershop",
    name: "UPBUY",
  });
  assert.equal(body.idWebhook, 16);
  assert.equal(body.url, "https://api.example/api/webhooks/mastershop");
  assert.equal(body.name, "UPBUY");
  assert.equal(body.webhookName, "UPBUY");
});

test("createSubscription devuelve el idProductWebhook del alta", async () => {
  let captured;
  global.fetch = async (url, options) => {
    captured = { url, options };
    return jsonResponse(200, { idProductWebhook: "wp-1" });
  };

  const result = await createSubscription({
    idWebhook: 16,
    url: "https://api.example/api/webhooks/mastershop",
    name: "UPBUY",
  });

  assert.equal(result.ok, true);
  assert.equal(result.idProductWebhook, "wp-1");
  assert.match(captured.url, /\/api\/webhooks$/);
  assert.equal(captured.options.method, "POST");
});

test("setSubscriptionEnabled hace PUT con idProductWebhook + isEnable", async () => {
  let captured;
  global.fetch = async (url, options) => {
    captured = { url, options };
    return jsonResponse(200, { ok: true });
  };

  const result = await setSubscriptionEnabled("wp-1", false);

  assert.equal(result.ok, true);
  assert.equal(captured.options.method, "PUT");
  assert.deepEqual(JSON.parse(captured.options.body), {
    idProductWebhook: "wp-1",
    isEnable: false,
  });
});

// ---------------------------------------------------------------------------
// Integracion con la base
// ---------------------------------------------------------------------------

const skipIfNoDb = (t) => {
  if (dbError) {
    t.skip(`sin base de datos: ${dbError.message}`);
    return true;
  }
  return false;
};

const createOrder = (overrides = {}) =>
  Order.create({
    orderNumber: `UPBUY-WH-${suffix()}`,
    recipientName: "Ana Perez",
    phone: "3001234567",
    email: "ana@example.com",
    total: 65000,
    ...overrides,
  });

const cleanup = async (order) => {
  await WebhookEvent.destroy({ where: { provider: "mastershop" } }).catch(() => {});
  await Order.destroy({ where: { id: order.id } }).catch(() => {});
};

test("una reconsulta actualiza estado, guia y avanza por la cadena", async (t) => {
  if (skipIfNoDb(t)) return;

  const order = await createOrder({
    fulfillmentStatus: "paid",
    msIdOrder: 770001,
    msSyncState: "synced",
  });

  try {
    const result = await refreshMastershopOrderStatus({
      orderId: order.id,
      remoteOrder: {
        idOrder: 770001,
        status: "Despachado",
        order_logistics: [
          {
            carrier_name: "Servientrega",
            carrier_tracking_code: "GUIA-777",
            url_tracking: "https://rastreo.example/GUIA-777",
          },
        ],
      },
    });

    assert.equal(result.ok, true);

    await order.reload();
    assert.equal(order.msStatus, "Despachado");
    assert.equal(order.trackingNumber, "GUIA-777");
    assert.equal(order.trackingUrl, "https://rastreo.example/GUIA-777");
    assert.equal(order.trackingCarrier, "Servientrega");
    // paid -> packing -> shipped (sin saltarse la maquina de estados).
    assert.equal(order.fulfillmentStatus, "shipped");
    assert.ok(result.changes.includes("fulfillmentStatus:packing"));
    assert.ok(result.changes.includes("fulfillmentStatus:shipped"));
  } finally {
    await cleanup(order);
  }
});

test("sin guia no se marca enviado, pero se guarda el estado crudo", async (t) => {
  if (skipIfNoDb(t)) return;

  const order = await createOrder({
    fulfillmentStatus: "packing",
    msIdOrder: 770002,
    msSyncState: "synced",
  });

  try {
    const result = await refreshMastershopOrderStatus({
      orderId: order.id,
      remoteOrder: { idOrder: 770002, status: "Despachado" },
    });

    assert.equal(result.ok, true);
    await order.reload();
    assert.equal(order.msStatus, "Despachado");
    assert.equal(order.fulfillmentStatus, "packing");
    assert.ok(result.changes.includes("shipped_sin_guia"));
  } finally {
    await cleanup(order);
  }
});

test("manualOverride bloquea la actualizacion automatica", async (t) => {
  if (skipIfNoDb(t)) return;

  const order = await createOrder({
    fulfillmentStatus: "paid",
    msIdOrder: 770003,
    manualOverride: true,
  });

  try {
    const result = await refreshMastershopOrderStatus({
      orderId: order.id,
      remoteOrder: { idOrder: 770003, status: "Entregado" },
    });

    assert.equal(result.ok, false);
    assert.equal(result.skipped, "manual_override");

    await order.reload();
    assert.equal(order.fulfillmentStatus, "paid");
    assert.equal(order.msStatus, null);
  } finally {
    await cleanup(order);
  }
});

test("el webhook actualiza el pedido y es idempotente", async (t) => {
  if (skipIfNoDb(t)) return;

  const order = await createOrder({
    fulfillmentStatus: "packing",
    msIdOrder: 770004,
    msSyncState: "synced",
  });

  // La reconsulta (GET) devuelve la verdad aunque el cuerpo solo traiga el id.
  global.fetch = async (url, options = {}) => {
    if (options.method === "PUT") return jsonResponse(200, { ok: true });
    return jsonResponse(200, {
      idOrder: 770004,
      status: "Entregado",
      order_logistics: [{ carrier_tracking_code: "GUIA-ENT" }],
    });
  };

  const body = { idWebhook: 18, idOrder: 770004 };

  try {
    const first = await handleMastershopWebhook({ body });
    assert.equal(first.received, true);
    assert.equal(first.applied, true);

    await order.reload();
    assert.equal(order.fulfillmentStatus, "delivered");
    assert.equal(order.msStatus, "Entregado");
    assert.equal(order.trackingNumber, "GUIA-ENT");

    const second = await handleMastershopWebhook({ body });
    assert.equal(second.reason, "ya_procesado");
  } finally {
    global.fetch = originalFetch;
    await cleanup(order);
  }
});

test("el webhook de un pedido inexistente responde 200 sin lanzar", async (t) => {
  if (skipIfNoDb(t)) return;

  const result = await handleMastershopWebhook({
    body: { idWebhook: 16, externalOrderId: `NO-EXISTE-${suffix()}` },
  });

  assert.equal(result.received, true);
  assert.equal(result.applied, false);
  assert.equal(result.reason, "pedido_no_encontrado");

  await WebhookEvent.destroy({ where: { provider: "mastershop" } }).catch(() => {});
});