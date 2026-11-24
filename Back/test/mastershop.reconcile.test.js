// Pruebas de la Fase 5 (conciliacion y mapeo de datos).
//
// Cubre lo que se puede probar sin base de datos:
//   - `listOrders` arma POST /api/orders/list con startDate/finalDate.
//   - `mapAddress` devuelve las 11 llaves que exige MasterShop.
//   - `mapCustomer` no inventa documento (ambos null).
//   - `redactObject` no filtra secretos ni datos de tarjeta a la bitacora.
process.env.UPBUY_SKIP_DOTENV = "1";
process.env.MASTERSHOP_API_URL = "https://mastershop.test";
process.env.MASTERSHOP_API_KEY = "test-ms-api-key-secreta";
process.env.MASTERSHOP_HTTP_TIMEOUT_MS = "2000";

const test = require("node:test");
const assert = require("node:assert/strict");

const orders = require("../integrations/suppliers/mastershop/mastershop.orders.js");
const {
  mapAddress,
  mapCustomer,
  redactObject,
  MS_SYNC_STATE,
} = require("../Services/mastershopOrders.service.js");

const originalFetch = global.fetch;

const jsonResponse = (status, body, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { entries: () => Object.entries(headers) },
  text: async () =>
    body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body),
});

const captureFetch = (handler) => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  return calls;
};

test.after(() => {
  global.fetch = originalFetch;
});

test("listOrders usa POST /api/orders/list con filtros de fecha", async () => {
  const calls = captureFetch(() => jsonResponse(200, []));

  await orders.listOrders({
    page: 1,
    limit: 20,
    startDate: "2026-11-17",
    finalDate: "2026-11-24",
  });

  assert.equal(calls.length, 1);
  const { url, options } = calls[0];
  assert.match(url, /\/api\/orders\/list\?page=1&limit=20$/);
  assert.equal(options.method, "POST");
  assert.equal(options.headers["ms-api-key"], "test-ms-api-key-secreta");
  const body = JSON.parse(options.body);
  assert.deepEqual(body, { startDate: "2026-11-17", finalDate: "2026-11-24" });
});

test("listOrders sin fechas manda cuerpo vacio", async () => {
  const calls = captureFetch(() => jsonResponse(200, []));
  await orders.listOrders({ page: 2, limit: 10 });
  assert.match(calls[0].url, /page=2&limit=10/);
  assert.deepEqual(JSON.parse(calls[0].options.body), {});
});

test("mapAddress devuelve las 11 llaves y country=CO", () => {
  const address = mapAddress({
    recipientName: "Ana Perez",
    phone: "3001234567",
    email: "ana@example.com",
    address: "Calle 1 # 2-3",
    city: "Medellin",
    department: "Antioquia",
    postalCode: "050001",
  });
  assert.equal(Object.keys(address).length, 12); // 11 direccion + country
  assert.equal(address.country, "CO");
  assert.equal(address.city, "Medellin");
  assert.equal(address.state, "Antioquia");
  assert.equal(address.zip, "050001");
  assert.equal(address.address2, null);
  assert.equal(address.district, null);
  assert.equal(address.company, null);
});

test("mapAddress con snapshot vacio deja todo null salvo country", () => {
  const address = mapAddress({});
  assert.equal(address.country, "CO");
  assert.equal(address.city, null);
  assert.equal(address.phone, null);
  assert.equal(Object.keys(address).length, 12);
});

test("mapCustomer no inventa documento (ambos null) y agrega tags", () => {
  const customer = mapCustomer({
    recipientName: "Ana Perez",
    phone: "3001234567",
    email: "ana@example.com",
  });
  assert.equal(customer.documentType, null);
  assert.equal(customer.documentNumber, null);
  assert.equal(customer.full_name, "Ana Perez");
  assert.ok(Array.isArray(customer.tags));
});

test("redactObject oculta secretos y datos de tarjeta", () => {
  const redacted = redactObject({
    name: "Ana",
    "ms-api-key": "secreta",
    authorization: "Bearer xyz",
    cardNumber: "4111111111111111",
    token: "abc",
    nested: { cvv: "123", note: "ok" },
  });
  assert.equal(redacted.name, "Ana");
  assert.equal(redacted["ms-api-key"], "[REDACTADO]");
  assert.equal(redacted.authorization, "[REDACTADO]");
  assert.equal(redacted.cardNumber, "[REDACTADO]");
  assert.equal(redacted.token, "[REDACTADO]");
  assert.equal(redacted.nested.cvv, "[REDACTADO]");
  assert.equal(redacted.nested.note, "ok");
});

test("MS_SYNC_STATE expone los estados del contrato", () => {
  assert.equal(MS_SYNC_STATE.SYNCED, "synced");
  assert.equal(MS_SYNC_STATE.NEEDS_REVIEW, "needs_review");
  assert.equal(MS_SYNC_STATE.FAILED, "failed");
});
