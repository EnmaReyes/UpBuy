// Firma de los webhooks de dinero: el HMAC se calcula sobre los bytes exactos
// recibidos (rawBody) y el secreto en claro NUNCA se acepta como firma.
//
// Esta prueba existe por dos fallos reales corregidos:
//   1. El webhook firmaba sobre JSON.stringify(obj) -> eventos legitimos fallaban.
//   2. El servicio aceptaba el secreto como "firma" -> token rejugable.
process.env.UPBUY_SKIP_DOTENV = "1";
process.env.VENNDELO_WEBHOOK_SECRET = "venndelo-test-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const {
  verifySignature: verifyVenndelo,
  handleVenndeloWebhook,
} = require("../Services/venndeloChatbotWebhook.js");

const sign = (secret, raw) =>
  crypto.createHmac("sha256", secret).update(raw).digest("hex");

test("venndelo: firma sobre el cuerpo crudo y rechazo del secreto en claro", () => {
  const body = { event: "ORDER_SHIPPED", order_id: "ABC-1" };
  const raw = '{ "event" : "ORDER_SHIPPED", "order_id":"ABC-1" }';

  assert.equal(
    verifyVenndelo({
      body,
      rawBody: raw,
      headers: { "x-venndelo-signature": sign("venndelo-test-secret", raw) },
    }),
    true,
  );

  assert.equal(
    verifyVenndelo({
      body,
      rawBody: raw,
      headers: { "x-webhook-secret": "venndelo-test-secret" },
    }),
    false,
  );
});

test("venndelo: un evento con firma invalida se rechaza con 401", async () => {
  await assert.rejects(
    () =>
      handleVenndeloWebhook({
        body: { event: "ORDER_CREATED" },
        headers: { "x-venndelo-signature": "deadbeef" },
      }),
    (error) => error.status === 401,
  );
});