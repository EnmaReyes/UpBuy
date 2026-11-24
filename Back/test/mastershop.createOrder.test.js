// Pruebas de integracion de `createOrder` con `fetch` mockeado (SIN red real).
//
// Verifica el mapeo de errores del Anexo A:
//   - 200            -> ok
//   - 400 con data[] -> rejected (no reintentable) + detalle path/message
//   - 401 / 403      -> config_error (no reintentable, alertar)
//   - 429            -> rate_limited (reintentable, respeta RateLimit-Reset)
//   - 500 "ya existe" -> duplicate (exito idempotente)
//   - 500 generico   -> server_error (reintentable)
//   - timeout / red  -> reintentable
process.env.UPBUY_SKIP_DOTENV = "1";
process.env.MASTERSHOP_API_URL = "https://mastershop.test";
process.env.MASTERSHOP_API_KEY = "test-ms-api-key-secreta";
process.env.MASTERSHOP_HTTP_TIMEOUT_MS = "2000";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createOrder } = require("../integrations/suppliers/mastershop/mastershop.orders.js");

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

// Payload minimo; createOrder no lo valida (eso lo hace buildOrderPayload).
const payload = { id_order: "UPBUY-2026-000011", order_items: [] };

test("200 -> ok con idOrder y status", async () => {
  const calls = captureFetch(() =>
    jsonResponse(200, {
      idOrder: 98765,
      externalOrderId: "UPBUY-2026-000011",
      status: "Por Confirmar",
    }),
  );

  const result = await createOrder(payload, { correlationId: "c1", reference: "ref-1" });

  assert.equal(result.ok, true);
  assert.equal(result.idOrder, 98765);
  assert.equal(result.status, "Por Confirmar");
  assert.equal(result.retryable, false);
  // POST a /api/orders.
  assert.match(calls[0].url, /\/api\/orders$/);
  assert.equal(calls[0].options.method, "POST");
});

test("400 -> rejected con detalle path/message", async () => {
  captureFetch(() =>
    jsonResponse(400, {
      success: false,
      error: "Datos invalidos",
      data: [
        { path: ["order_transaction", "total"], message: "total invalido" },
        { path: ["customer", "phone"], message: "requerido" },
      ],
    }),
  );

  const result = await createOrder(payload);

  assert.equal(result.ok, false);
  assert.equal(result.status, "rejected");
  assert.equal(result.retryable, false);
  assert.equal(result.validationErrors.length, 2);
  assert.deepEqual(result.validationErrors[0].path, ["order_transaction", "total"]);
  assert.equal(result.validationErrors[1].message, "requerido");
});

test("401 y 403 -> config_error (no reintentable)", async () => {
  for (const status of [401, 403]) {
    captureFetch(() => jsonResponse(status, { error: "sin permiso" }));
    const result = await createOrder(payload);
    assert.equal(result.ok, false);
    assert.equal(result.status, "config_error");
    assert.equal(result.retryable, false);
    assert.equal(result.configError, true);
  }
});

test("429 -> rate_limited reintentable con retryAfterSeconds", async () => {
  captureFetch(() =>
    jsonResponse(429, { error: "demasiadas solicitudes" }, {
      "ratelimit-limit": "60",
      "ratelimit-remaining": "0",
      "ratelimit-reset": "45",
    }),
  );

  const result = await createOrder(payload);

  assert.equal(result.ok, false);
  assert.equal(result.status, "rate_limited");
  assert.equal(result.retryable, true);
  assert.equal(result.retryAfterSeconds, 45);
});

test("500 con 'La orden ya existe' -> duplicate (exito idempotente)", async () => {
  captureFetch(() =>
    jsonResponse(500, {
      success: false,
      error: "Código 409 - La orden ya existe",
    }),
  );

  const result = await createOrder(payload);

  assert.equal(result.ok, true);
  assert.equal(result.status, "duplicate");
  assert.equal(result.idempotent, true);
  assert.equal(result.retryable, false);
});

test("500 generico -> server_error reintentable", async () => {
  captureFetch(() => jsonResponse(500, { error: "boom interno" }));

  const result = await createOrder(payload);

  assert.equal(result.ok, false);
  assert.equal(result.status, "server_error");
  assert.equal(result.retryable, true);
});

test("fallo de red / timeout -> reintentable", async () => {
  captureFetch(() => {
    throw new Error("ECONNRESET");
  });

  const result = await createOrder(payload);

  assert.equal(result.ok, false);
  assert.equal(result.retryable, true);
});
