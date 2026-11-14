// Pruebas de ADM-5: avisos de compra en vivo.
//
// El endpoint solo debe mirar pedidos web posteriores a `since`, con un tope de
// 20 y en orden ascendente. Las pruebas usan la base real y se saltan solas
// cuando no hay PostgreSQL.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

process.chdir(path.join(__dirname, ".."));

const { sequelize, Order } = require("../DataBase/models/index.js");
const { recent } = require("../Controllers/adminOrders.js");
const { listRecentWebOrders } = require("../Services/adminOrders.js");

const makeRes = () => {
  let statusCode = 200;
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      return { status: statusCode, body };
    },
  };
};

let dbError = null;

test.before(async () => {
  try {
    await sequelize.authenticate();
  } catch (error) {
    dbError = error;
  }
});

test.after(async () => {
  await sequelize.close().catch(() => {});
});

const skipIfNoDb = (t) => {
  if (dbError) {
    t.skip(`sin base de datos: ${dbError.message}`);
    return true;
  }
  return false;
};

const createOrders = async ({ stamp, base }) => {
  const ids = [];
  try {
    for (let i = 0; i < 25; i += 1) {
      const web = await Order.create({
        orderNumber: `RECENT-${stamp}-WEB-${i}`,
        channel: "web",
        recipientName: `Compra web ${i}`,
        phone: "+573001234567",
        total: 10000 + i,
        providerStatus: "estado-crudo-del-proveedor",
        createdAt: new Date(base.getTime() + i * 1000),
        updatedAt: new Date(base.getTime() + i * 1000),
      });
      ids.push(web.id);
    }

    // Una venta manual intercalada: nunca debe aparecer en los avisos.
    const manual = await Order.create({
      orderNumber: `RECENT-${stamp}-MANUAL`,
      channel: "otro",
      recipientName: "Venta manual",
      phone: "+573001234568",
      total: 5000,
      createdAt: new Date(base.getTime() + 12_500),
      updatedAt: new Date(base.getTime() + 12_500),
    });
    ids.push(manual.id);
  } catch (error) {
    await Order.destroy({ where: { id: ids } }).catch(() => {});
    throw error;
  }
  return ids;
};

test("GET /api/admin/orders/recent solo devuelve compras web y respeta el tope", async (t) => {
  if (skipIfNoDb(t)) return;

  const stamp = Date.now();
  const base = new Date(Date.now() + 60 * 60 * 1000);
  const ids = await createOrders({ stamp, base });

  try {
    const result = await listRecentWebOrders({
      since: new Date(base.getTime() - 1000).toISOString(),
    });

    assert.equal(result.count, 20);
    assert.equal(result.orders.length, 20);
    assert.ok(result.serverTime);

    // Orden ascendente y solo canal web.
    for (let i = 1; i < result.orders.length; i += 1) {
      assert.ok(
        new Date(result.orders[i - 1].createdAt).getTime() <=
          new Date(result.orders[i].createdAt).getTime(),
      );
    }
    assert.ok(result.orders.every((order) => order.channel === "web"));
    assert.equal(
      result.orders.some((order) => order.recipientName === "Venta manual"),
      false,
    );

    // Se toman las 20 mas antiguas de las nuevas.
    assert.equal(result.orders[0].orderNumber, `RECENT-${stamp}-WEB-0`);
    assert.equal(result.orders[19].orderNumber, `RECENT-${stamp}-WEB-19`);

    // El estado crudo del proveedor jamas sale al panel.
    assert.equal(
      JSON.stringify(result.orders).includes("estado-crudo-del-proveedor"),
      false,
    );
    assert.equal("providerStatus" in result.orders[0], false);
  } finally {
    await Order.destroy({ where: { id: ids } });
  }
});

test("GET /api/admin/orders/recent respeta since y responde el contrato", async (t) => {
  if (skipIfNoDb(t)) return;

  const stamp = Date.now();
  const base = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const ids = await createOrders({ stamp, base });

  try {
    const since = new Date(base.getTime() + 10_000).toISOString();
    const result = await recent({ query: { since } }, makeRes());

    assert.equal(result.status, 200);
    assert.equal(result.body.count, 14);
    assert.equal(result.body.orders.length, 14);
    assert.equal(result.body.orders[0].orderNumber, `RECENT-${stamp}-WEB-11`);
    assert.equal(result.body.orders[13].orderNumber, `RECENT-${stamp}-WEB-24`);
    assert.equal(typeof result.body.serverTime, "string");
    assert.equal(
      result.body.orders.some(
        (order) => order.orderNumber === `RECENT-${stamp}-MANUAL`,
      ),
      false,
    );
  } finally {
    await Order.destroy({ where: { id: ids } });
  }
});

test("GET /api/admin/orders/recent sin since devuelve la linea base", async (t) => {
  if (skipIfNoDb(t)) return;

  const result = await recent({ query: {} }, makeRes());

  assert.equal(result.status, 200);
  assert.ok(Array.isArray(result.body.orders));
  assert.ok(result.body.orders.length <= 20);
  assert.equal(result.body.count, result.body.orders.length);
  assert.equal(typeof result.body.serverTime, "string");
  for (let i = 1; i < result.body.orders.length; i += 1) {
    assert.ok(
      new Date(result.body.orders[i - 1].createdAt).getTime() <=
        new Date(result.body.orders[i].createdAt).getTime(),
    );
  }
});

test("GET /api/admin/orders/recent rechaza un since invalido", async (t) => {
  if (skipIfNoDb(t)) return;

  const result = await recent(
    { query: { since: "no-es-una-fecha" } },
    makeRes(),
  );

  assert.equal(result.status, 400);
  assert.match(result.body, /since/i);
});
