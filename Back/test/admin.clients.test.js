// Pruebas de clientes / usuarios del panel (ADM-9):
//   - filtros del listado (con/sin compras, consentimiento);
//   - detalle con resumen (pedidos, gasto, ultimo pedido);
//   - actualizacion de perfil sin romper profileComplete;
//   - consentimientos (marketing/whatsapp opt-in);
//   - desactivar cuenta (disabled + tokenVersion);
//   - CSV sin password ni tokens;
//   - campos no editables (rol, password) jamas pasan.
//
// Sin base de datos los tests de DB se saltan solos (patron del repo).

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

process.chdir(path.join(__dirname, ".."));

const {
  sequelize,
  Usuarios,
  Address,
  Order,
} = require("../DataBase/models/index.js");
const { ensureBaseSchema } = require("../DataBase/ensureBaseSchema.js");
const {
  clientDetail,
  clientOrders,
  exportClientsCsv,
  listClients,
  updateClient,
} = require("../Services/adminClients.js");

let dbError = null;

test.before(async () => {
  try {
    await sequelize.authenticate();
    await ensureBaseSchema();
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

const stamp = Date.now();
const created = { users: [], orders: [], addresses: [] };

const makeUser = async (overrides = {}) => {
  const user = await Usuarios.create({
    username: `cli${Math.floor(Math.random() * 1e9)}`,
    email: `cli-${Math.floor(Math.random() * 1e9)}@test.local`,
    password: "no-importa",
    ...overrides,
  });
  created.users.push(user.id);
  return user;
};

const makeOrder = async (user, overrides = {}) => {
  const order = await Order.create(
    {
      userId: user.id,
      orderNumber: `UPBUY-${stamp}-${Math.floor(Math.random() * 100000)}`,
      subtotal: overrides.subtotal ?? 10000,
      total: overrides.total ?? 10000,
      recipientName: "Ana Prueba",
      phone: "+573001234567",
      city: "Medellin",
      ...overrides,
    },
  );
  created.orders.push(order.id);
  return order;
};

const cleanup = async () => {
  if (created.orders.length) {
    // Borrar hijos primero (items, pagos, historial) por FK.
    await sequelize.query(
      `DELETE FROM order_items WHERE "orderId" IN (:ids)`,
      { replacements: { ids: created.orders } },
    ).catch(() => {});
    await Order.destroy({ where: { id: created.orders } }).catch(() => {});
    created.orders.length = 0;
  }
  if (created.addresses.length) {
    await Address.destroy({ where: { id: created.addresses } });
    created.addresses.length = 0;
  }
  if (created.users.length) {
    await Usuarios.destroy({ where: { id: created.users } });
    created.users.length = 0;
  }
};

test.afterEach(async () => {
  if (!dbError) await cleanup();
});

// La Order.create necesita campos obligatorios; mirar como los crean otros
// tests (admin.orders.recent.test.js) si este builder falla.

test("listClients filtra por segmento y consentimiento", async (t) => {
  if (skipIfNoDb(t)) return;

  const conCompras = await makeUser({ marketingOptIn: true });
  const sinCompras = await makeUser({ whatsappOptIn: true });
  void sinCompras;

  await makeOrder(conCompras, { total: 25000 });

  const con = await listClients({ segment: "con_compras" });
  assert.ok(con.users.some((u) => u.id === conCompras.id));

  const sin = await listClients({ segment: "sin_compras" });
  assert.ok(!sin.users.some((u) => u.id === conCompras.id));

  const email = await listClients({ consent: "email" });
  assert.ok(email.users.some((u) => u.id === conCompras.id));
  assert.ok(email.users.every((u) => u.marketingOptIn === true));

  const whatsapp = await listClients({ consent: "whatsapp" });
  assert.ok(whatsapp.users.every((u) => u.whatsappOptIn === true));
});

test("clientDetail resume pedidos, gasto y ultimo pedido", async (t) => {
  if (skipIfNoDb(t)) return;

  const user = await makeUser();
  await makeOrder(user, { total: 30000 });
  const address = await Address.create({
    userId: user.id,
    address: "Calle 1 #2-3",
    city: "Medellin",
    isDefault: true,
  });
  created.addresses.push(address.id);

  const detail = await clientDetail(user.id);
  assert.equal(detail.user.id, user.id);
  assert.equal(detail.summary.ordersCount, 1);
  assert.equal(detail.summary.totalSpent, 30000);
  assert.ok(detail.summary.lastOrderAt);
  assert.ok(detail.addresses.some((a) => a.id === address.id));

  const orders = await clientOrders(user.id);
  assert.equal(orders.total, 1);
  assert.equal(orders.orders[0].total, 30000);
});

test("clientDetail devuelve null para id inexistente", async (t) => {
  if (skipIfNoDb(t)) return;
  assert.equal(await clientDetail("00000000-0000-0000-0000-000000000000"), null);
});

test("updateClient edita perfil y recalcula profileComplete", async (t) => {
  if (skipIfNoDb(t)) return;

  const user = await makeUser(); // perfil incompleto
  assert.equal(user.profileComplete, false);

  const result = await updateClient({
    id: user.id,
    payload: {
      name: "Ana",
      lastName: "Prueba",
      phone: "3001234567",
      address: "Calle 4 #5-6",
    },
    actorId: user.id,
  });

  assert.equal(result.user.name, "Ana");
  assert.equal(result.user.phone, "+573001234567");
  assert.equal(result.user.profileComplete, true);
  assert.deepEqual(result.missing, []);
});

test("updateClient activa consentimientos con marca de tiempo", async (t) => {
  if (skipIfNoDb(t)) return;

  const user = await makeUser();
  const result = await updateClient({
    id: user.id,
    payload: { marketingOptIn: true, whatsappOptIn: true },
  });

  assert.equal(result.user.marketingOptIn, true);
  assert.ok(result.user.marketingOptInAt);
  assert.equal(result.user.whatsappOptIn, true);
  assert.ok(result.user.whatsappOptInAt);

  const off = await updateClient({
    id: user.id,
    payload: { whatsappOptIn: false },
  });
  assert.equal(off.user.whatsappOptIn, false);
});

test("updateClient desactiva la cuenta e invalida sesiones", async (t) => {
  if (skipIfNoDb(t)) return;

  const user = await makeUser();
  const version = user.tokenVersion;

  const result = await updateClient({
    id: user.id,
    payload: { disabled: true },
  });

  assert.equal(result.user.disabled, true);
  assert.equal(result.user.tokenVersion, version + 1);

  const back = await updateClient({
    id: user.id,
    payload: { disabled: false },
  });
  assert.equal(back.user.disabled, false);
});

test("updateClient ignora rol, admin y password", async (t) => {
  if (skipIfNoDb(t)) return;

  const user = await makeUser();
  const result = await updateClient({
    id: user.id,
    payload: {
      role: "admin",
      admin: true,
      password: "hacked",
      email: "nuevo@test.local",
      name: "Nombre",
    },
  });

  assert.equal(result.user.role, "customer");
  const freshAdmin = await Usuarios.findByPk(user.id);
  assert.equal(freshAdmin.admin, false);
  assert.equal(result.user.email, user.email);
  assert.equal(result.user.name, "Nombre");
  // El password no cambio (sigue siendo el hash original).
  const fresh = await Usuarios.findByPk(user.id);
  assert.equal(fresh.password, user.password);
});

test("updateClient rechaza telefono invalido", async (t) => {
  if (skipIfNoDb(t)) return;

  const user = await makeUser();
  await assert.rejects(
    () => updateClient({ id: user.id, payload: { phone: "123" } }),
    /inv/i,
  );
});

test("exportClientsCsv nunca incluye password ni tokens", async (t) => {
  if (skipIfNoDb(t)) return;

  const user = await makeUser({ name: "Csv", lastName: "Test" });
  const csv = await exportClientsCsv();

  assert.ok(csv.startsWith("id,username,correo,"));
  assert.ok(csv.includes(user.email));
  assert.ok(csv.includes("Csv"));
  assert.ok(!csv.toLowerCase().includes("password"));
  assert.ok(!csv.includes("gmailrefreshtoken"));
  assert.ok(!csv.includes("mfasecret"));
});
