// Pruebas de `cancelOrder` con `fetch` mockeado (SIN red real).
//
// Verifica el mapeo de errores del push de cancelacion a MasterShop
// (`PUT /api/orders/{idOrder}` con `{"idStatus":9}`):
//   - 200              -> ok
//   - "ya cancelada"   -> idempotente (400 o 500)
//   - 400 de esquema   -> rejected (no reintentable)
//   - 401 / 403        -> config_error (no reintentable)
//   - 404              -> not_found (no reintentable)
//   - 429              -> rate_limited (reintentable)
//   - 500 generico     -> server_error (reintentable)
//   - timeout / red    -> reintentable
process.env.UPBUY_SKIP_DOTENV = "1";
process.env.MASTERSHOP_API_URL = "https://mastershop.test";
process.env.MASTERSHOP_API_KEY = "test-ms-api-key-secreta";
process.env.MASTERSHOP_HTTP_TIMEOUT_MS = "2000";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  cancelOrder,
  isAlreadyCancelledMessage,
  MASTERSHOP_ORDER_STATUS,
} = require("../integrations/suppliers/mastershop/mastershop.orders.js");

const originalFetch = global.fetch;

const jsonResponse = (status, body, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { entries: () => Object.entries(headers) },
  data: body,
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

test("200 -> ok y envia PUT con idStatus 9 al idOrder", async () => {
  const calls = captureFetch(() => jsonResponse(200, { success: true }));

  const result = await cancelOrder(98765, { reference: "UPBUY-2026-000011" });

  assert.equal(result.ok, true);
  assert.equal(result.status, "cancelled");
  assert.equal(result.retryable, false);
  assert.match(calls[0].url, /\/api\/orders\/98765$/);
  assert.equal(calls[0].options.method, "PUT");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    idStatus: MASTERSHOP_ORDER_STATUS.CANCELADA,
  });
});

test("400 con 'ya esta cancelada' -> exito idempotente", async () => {
  captureFetch(() =>
    jsonResponse(400, { error: "La orden ya esta cancelada" }),
  );

  const result = await cancelOrder(1);

  assert.equal(result.ok, true);
  assert.equal(result.status, "already_cancelled");
  assert.equal(result.idempotent, true);
  assert.equal(result.retryable, false);
});

test("500 con 'ya fue cancelada' -> exito idempotente", async () => {
  captureFetch(() => jsonResponse(500, { error: "Orden ya fue cancelada" }));

  const result = await cancelOrder(1);

  assert.equal(result.ok, true);
  assert.equal(result.status, "already_cancelled");
  assert.equal(result.idempotent, true);
});

test("400 de validacion -> rejected (no reintentable)", async () => {
  captureFetch(() => jsonResponse(400, { error: "estado invalido" }));

  const result = await cancelOrder(1);

  assert.equal(result.ok, false);
  assert.equal(result.status, "rejected");
  assert.equal(result.retryable, false);
});

test("401 y 403 -> config_error (no reintentable)", async () => {
  for (const status of [401, 403]) {
    captureFetch(() => jsonResponse(status, { error: "sin permiso" }));
    const result = await cancelOrder(1);
    assert.equal(result.ok, false);
    assert.equal(result.status, "config_error");
    assert.equal(result.retryable, false);
    assert.equal(result.configError, true);
  }
});

test("404 -> not_found (no reintentable)", async () => {
  captureFetch(() => jsonResponse(404, { error: "no existe" }));

  const result = await cancelOrder(1);

  assert.equal(result.ok, false);
  assert.equal(result.status, "not_found");
  assert.equal(result.retryable, false);
});

test("429 -> rate_limited reintentable con retryAfterSeconds", async () => {
  captureFetch(() =>
    jsonResponse(429, { error: "demasiadas" }, {
      "ratelimit-limit": "60",
      "ratelimit-remaining": "0",
      "ratelimit-reset": "30",
    }),
  );

  const result = await cancelOrder(1);

  assert.equal(result.ok, false);
  assert.equal(result.status, "rate_limited");
  assert.equal(result.retryable, true);
  assert.equal(result.retryAfterSeconds, 30);
});

test("500 generico -> server_error reintentable", async () => {
  captureFetch(() => jsonResponse(500, { error: "boom" }));

  const result = await cancelOrder(1);

  assert.equal(result.ok, false);
  assert.equal(result.status, "server_error");
  assert.equal(result.retryable, true);
});

test("fallo de red -> reintentable", async () => {
  captureFetch(() => {
    throw new Error("ECONNRESET");
  });

  const result = await cancelOrder(1);

  assert.equal(result.ok, false);
  assert.equal(result.retryable, true);
});

test("idOrder invalido -> missing_id_order (no llama a la API)", async () => {
  const calls = captureFetch(() => jsonResponse(200, {}));

  const result = await cancelOrder(null);

  assert.equal(result.ok, false);
  assert.equal(result.status, "missing_id_order");
  assert.equal(result.retryable, false);
  assert.equal(calls.length, 0);
});

test("isAlreadyCancelledMessage reconoce variantes sin falsos positivos", () => {
  assert.equal(isAlreadyCancelledMessage("La orden ya esta cancelada"), true);
  assert.equal(isAlreadyCancelledMessage("La orden ya se encuentra cancelada"), true);
  assert.equal(isAlreadyCancelledMessage("orden ya cancelada"), true);
  assert.equal(isAlreadyCancelledMessage("No se puede cancelar esta orden"), false);
  assert.equal(isAlreadyCancelledMessage("Error interno del servidor"), false);
  assert.equal(isAlreadyCancelledMessage(null), false);
});
