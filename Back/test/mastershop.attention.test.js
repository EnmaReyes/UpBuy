// Pruebas de integracion (necesitan base local; se saltan si no hay) del
// panel de pedidos de MasterShop: listado de los que necesitan atencion y
// reintento de creacion/cancelacion.
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
  MastershopOrderAttempt,
  MastershopOrderOutbox,
} = require("../DataBase/models/index.js");
const {
  listMastershopAttentionOrders,
  retryMastershopOrder,
} = require("../Services/mastershopOrders.service.js");

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

const originalFetch = global.fetch;

test.after(async () => {
  global.fetch = originalFetch;
  await sequelize.close().catch(() => {});
});

const skipIfNoDb = (t) => {
  if (dbError) {
    t.skip(`sin base de datos: ${dbError.message}`);
    return true;
  }
  return false;
};

const jsonResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { entries: () => [] },
  data: body,
  text: async () => (body === undefined ? "" : JSON.stringify(body)),
});

const captureFetch = (handler) => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  return calls;
};

const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

const createOrder = (overrides = {}) =>
  Order.create({
    orderNumber: `UPBUY-ATT-${suffix()}`,
    recipientName: "Ana Perez",
    phone: "3001234567",
    email: "ana@example.com",
    total: 65000,
    ...overrides,
  });

const cleanup = async (order) => {
  await MastershopOrderAttempt.destroy({ where: { orderId: order.id } }).catch(() => {});
  await MastershopOrderOutbox.destroy({ where: { orderId: order.id } }).catch(() => {});
  await Order.destroy({ where: { id: order.id } }).catch(() => {});
};

test("lista los pedidos en needs_review/failed y excluye los sincronizados", async (t) => {
  if (skipIfNoDb(t)) return;

  const review = await createOrder({ msSyncState: "needs_review" });
  const synced = await createOrder({ msSyncState: "synced", msIdOrder: 909090 });
  try {
    const result = await listMastershopAttentionOrders({ issue: "sync", limit: 100 });

    const ids = result.orders.map((order) => order.id);
    assert.ok(ids.includes(review.id));
    assert.ok(!ids.includes(synced.id));
    assert.ok(result.counts.needsReview >= 1);
  } finally {
    await cleanup(review);
    await cleanup(synced);
  }
});

test("lista una cancelacion pendiente con issue = cancel", async (t) => {
  if (skipIfNoDb(t)) return;

  const order = await createOrder({
    fulfillmentStatus: "cancelled",
    msIdOrder: 909091,
    msCancelState: "failed",
    msCancelAttempts: 5,
  });
  try {
    const result = await listMastershopAttentionOrders({ issue: "cancel", limit: 100 });
    const found = result.orders.find((row) => row.id === order.id);
    assert.ok(found);
    assert.equal(found.issue, "cancel");
    assert.equal(found.msCancelState, "failed");
  } finally {
    await cleanup(order);
  }
});

test("reintenta la cancelacion y la marca como done", async (t) => {
  if (skipIfNoDb(t)) return;

  const calls = captureFetch(() => jsonResponse(200, { success: true }));
  const order = await createOrder({
    fulfillmentStatus: "cancelled",
    msIdOrder: 909092,
    msCancelState: "failed",
    msCancelAttempts: 5,
  });
  try {
    const result = await retryMastershopOrder({ orderId: order.id });

    assert.equal(result.action, "cancel");
    assert.equal(result.ok, true);

    await order.reload();
    assert.equal(order.msCancelState, "done");
    assert.ok(order.msCancelledAt);

    const put = calls.find((c) => c.options.method === "PUT");
    assert.ok(put);
    assert.match(put.url, /\/api\/orders\/909092$/);
    assert.deepEqual(JSON.parse(put.options.body), { idStatus: 9 });
  } finally {
    await cleanup(order);
  }
});

test("un pedido cancelado sin pedido en MasterShop no se recrea", async (t) => {
  if (skipIfNoDb(t)) return;

  const calls = captureFetch(() => jsonResponse(200, {}));
  const order = await createOrder({ fulfillmentStatus: "cancelled" });
  try {
    const result = await retryMastershopOrder({ orderId: order.id });

    assert.equal(result.action, "none");
    assert.equal(result.reason, "pedido_cancelado_sin_pedido_en_mastershop");
    assert.equal(calls.length, 0);

    await order.reload();
    assert.equal(order.msSyncState, "disabled");
  } finally {
    await cleanup(order);
  }
});

test("reintentar un pedido inexistente responde 404", async (t) => {
  if (skipIfNoDb(t)) return;

  await assert.rejects(
    () => retryMastershopOrder({ orderId: "00000000-0000-4000-8000-000000000000" }),
    (error) => error.status === 404 || error.statusCode === 404,
  );
});