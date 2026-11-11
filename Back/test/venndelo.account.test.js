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

test("topup llama a /account/wallet/topup con Bearer y devuelve payment_url", async () => {
  const calls = mockFetch((url) => {
    if (url.endsWith("/account/wallet/topup")) {
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

  const call = calls.find((c) => c.url.endsWith("/account/wallet/topup"));
  assert.ok(call, "debe llamar al endpoint de topup");
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.headers.Authorization, "Bearer access-token-abcdefghijklmnop");
  const body = JSON.parse(call.options.body);
  assert.equal(body.amount, 50000);
  assert.equal(body.return_url, "https://front/exito");
  assert.equal(body.cancel_url, "https://front/cancelado");
});

test("balance devuelve balance y detail", async () => {
  mockFetch((url) => {
    if (url.endsWith("/account/wallet/balance")) {
      return jsonResponse(200, { balance: 125000, detail: "COP" });
    }
    return jsonResponse(404, {});
  });

  const result = await account.getWalletBalance(null);
  assert.equal(result.balance, 125000);
  assert.equal(result.detail, "COP");
});

test("validateOrderPayload rechaza pedidos incompletos", () => {
  assert.throws(() => service.validateOrderPayload({}), (e) => e.status === 400);
  assert.throws(
    () => service.validateOrderPayload({ items: [], payment_method_code: "X", customer: {} }),
    (e) => e.status === 400,
  );
  assert.throws(
    () => service.validateOrderPayload({ items: [{}], customer: {} }),
    (e) => e.status === 400,
  );
  assert.throws(
    () => service.validateOrderPayload({ items: [{}], payment_method_code: "X" }),
    (e) => e.status === 400,
  );
});

test("validateOrderPayload acepta un pedido minimo", () => {
  const payload = service.validateOrderPayload({
    items: [{ sku: "A1", quantity: 1 }],
    payment_method_code: "COD_VENDELO",
    customer: { name: "Ana" },
  });
  assert.equal(payload.payment_method_code, "COD_VENDELO");
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
});