// Pruebas de la capa de wallet/pedidos de Venndelo (SIN red real).
//
// Se reemplaza `global.fetch` por un mock que imita a Venndelo y se verifica:
//   1. El topup valida el monto y devuelve payment_url.
//   2. El topup llama a la ruta correcta con Bearer.
//   3. El saldo devuelve { balance, detail }.
//   4. La validacion del pedido rechaza cuerpos incompletos.
//   5. La firma del webhook (HMAC-SHA256) funciona.
process.env.UPBUY_SKIP_DOTENV = "1";

process.env.VENNDELO_CLIENT_ID = "test-client";
process.env.VENNDELO_CLIENT_SECRET = "test-secret";
process.env.VENNDELO_REFRESH_TOKEN = "test-refresh-token";
process.env.VENNDELO_OAUTH_URL = "https://venndelo.test/v1/admin/oauth/token";
process.env.VENNDELO_API_URL = "https://venndelo.test";
process.env.VENNDELO_ADMIN_PATH = "/v1/admin";
process.env.VENNDELO_WEBHOOK_SECRET = "webhook-secret";
process.env.SUPPLIER_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
  "base64",
);

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const auth = require("../integrations/suppliers/venndelo/venndelo.auth.js");
const account = require("../integrations/suppliers/venndelo/venndelo.account.js");
const service = require("../Services/suppliers/venndelo.account.service.js");
const { verifySignature } = require("../Services/venndeloChatbotWebhook.js");

const originalFetch = global.fetch;

const jsonResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { entries: () => [] },
  text: async () => (body === undefined ? "" : JSON.stringify(body)),
});

const tokenBody = () => ({
  access_token: "access-token-abcdefghijklmnop",
  token_type: "Bearer",
  expires_in: 3600,
});

// Mock: OAuth responde token; el resto se resuelve segun la URL.
const mockFetch = (resolveApi) => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/oauth/token")) {
      return jsonResponse(200, tokenBody());
    }
    return resolveApi(String(url), options);
  };
  return calls;
};

test.beforeEach(() => {
  auth.resetCache();
});

test.after(() => {
  global.fetch = originalFetch;
});

test("topup valida que el monto sea mayor que 0 (sin red)", async () => {
  await assert.rejects(
    () => account.createWalletTopup(null, { amount: 0 }),
    (error) => error.status === 400,
  );
});

test("topup llama a /wallet/initiate-wallet-topup con Bearer y devuelve payment_url", async () => {
  const calls = mockFetch((url) => {
    if (url.endsWith("/wallet/initiate-wallet-topup")) {
      return jsonResponse(201, { payment_url: "https://pay.venndelo.test/abc" });
    }
    return jsonResponse(404, {});
  });

  const result = await account.createWalletTopup(null, {
    amount: 50000,
    returnUrl: "https://front/exito",
    cancelUrl: "https://front/cancelado",
  });

  assert.equal(result.payment_url, "https://pay.venndelo.test/abc");

  const call = calls.find((c) => c.url.endsWith("/wallet/initiate-wallet-topup"));
  assert.ok(call, "debe llamar al endpoint de topup");
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.headers.Authorization, "Bearer access-token-abcdefghijklmnop");
  const body = JSON.parse(call.options.body);
  assert.equal(body.amount, 50000);
  assert.equal(body.return_url, "https://front/exito");
  assert.equal(body.cancel_url, "https://front/cancelado");
});

test("balance llama a /wallet/get-wallet-balance y devuelve balance y detail", async () => {
  const calls = mockFetch((url) => {
    if (url.endsWith("/wallet/get-wallet-balance")) {
      return jsonResponse(200, {
        balance: 125000,
        detail: [{ description: "Ventas", amount: 125000 }],
      });
    }
    return jsonResponse(404, {});
  });

  const result = await account.getWalletBalance(null);
  assert.equal(result.balance, 125000);
  assert.equal(result.detail[0].description, "Ventas");
  assert.ok(calls.some((c) => c.url.endsWith("/wallet/get-wallet-balance")));
});

test("una respuesta HTML (ruta inexistente) se rechaza con 502", async () => {
  mockFetch(() => ({
    status: 200,
    ok: true,
    headers: { entries: () => [] },
    text: async () => "<!DOCTYPE html><html></html>",
  }));

  await assert.rejects(
    () => account.getWalletBalance(null),
    (error) => error.status === 502 && /HTML/.test(error.message),
  );
});

test("validateOrderPayload usa el esquema real (line_items/billing/shipping)", () => {
  const valid = {
    line_items: [{ sku: "A1", quantity: 1 }],
    billing_info: { first_name: "Ana" },
    shipping_info: { first_name: "Ana" },
    payment_method_code: "COD",
  };

  const payload = service.validateOrderPayload(valid);
  assert.equal(payload.payment_method_code, "COD");
  assert.equal(payload.line_items.length, 1);

  assert.throws(
    () => service.validateOrderPayload({ ...valid, line_items: [] }),
    (e) => e.status === 400,
  );
  assert.throws(
    () => service.validateOrderPayload({ ...valid, billing_info: undefined }),
    (e) => e.status === 400,
  );
  assert.throws(
    () => service.validateOrderPayload({ ...valid, shipping_info: [] }),
    (e) => e.status === 400,
  );
  assert.throws(
    () => service.validateOrderPayload({ ...valid, payment_method_code: "Wompi" }),
    (e) => e.status === 400,
  );
});

test("validateOrderPayload normaliza external_order_id (idempotencia)", () => {
  const payload = service.validateOrderPayload({
    line_items: [{ sku: "A1", quantity: 1 }],
    billing_info: {},
    shipping_info: {},
    payment_method_code: "EXTERNAL_PAYMENT",
    orderId: "UPBUY-2026-000001",
  });
  assert.equal(payload.external_order_id, "UPBUY-2026-000001");
});

test("validateQuotationPayload no exige billing_info", () => {
  const base = {
    line_items: [{ sku: "A1", quantity: 1 }],
    pickup_info: { city_code: "11001" },
    shipping_info: { city_code: "05001" },
    payment_method_code: "COD",
  };
  assert.equal(
    service.validateQuotationPayload(base).payment_method_code,
    "COD",
  );
  assert.throws(
    () => service.validateQuotationPayload({ ...base, pickup_info: undefined }),
    (e) => e.status === 400,
  );
});

test("lista de pedidos valida el estado y no reenvía parámetros arbitrarios", async () => {
  await assert.rejects(
    () => service.listVenndeloOrders({ status: "INVENTADO" }),
    (e) => e.status === 400,
  );
});

test("la firma del webhook acepta HMAC valido y rechaza una invalida", () => {
  const body = { event: "ORDER_CREATED", order_id: "123" };
  const raw = JSON.stringify(body);
  const signature = crypto
    .createHmac("sha256", process.env.VENNDELO_WEBHOOK_SECRET)
    .update(raw)
    .digest("hex");

  assert.equal(
    verifySignature({ body, headers: { "x-venndelo-signature": signature } }),
    true,
  );
  assert.equal(
    verifySignature({ body, headers: { "x-venndelo-signature": "deadbeef" } }),
    false,
  );

  // Con rawBody se firma el byte exacto recibido (con espacios distintos al
  // JSON.stringify del objeto).
  const rawSpaced = '{ "event": "ORDER_CREATED", "order_id": "123" }';
  const rawSignature = crypto
    .createHmac("sha256", process.env.VENNDELO_WEBHOOK_SECRET)
    .update(rawSpaced)
    .digest("hex");
  assert.equal(
    verifySignature({
      body,
      rawBody: rawSpaced,
      headers: { "x-venndelo-signature": rawSignature },
    }),
    true,
  );
  assert.equal(
    verifySignature({
      body,
      rawBody: rawSpaced,
      headers: { "x-venndelo-signature": signature },
    }),
    false,
  );
});