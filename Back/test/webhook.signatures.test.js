// Firma de los webhooks de dinero: el HMAC se calcula sobre los bytes exactos
// recibidos (rawBody) y el secreto en claro NUNCA se acepta como firma.
//
// Estas pruebas existen por dos fallos reales corregidos:
//   1. Vendelo firmaba sobre JSON.stringify(obj) -> eventos legitimos fallaban.
//   2. Ambos servicios aceptaban el secreto como "firma" -> token rejugable.
process.env.UPBUY_SKIP_DOTENV = "1";
process.env.VENDELO_WEBHOOK_SECRET = "vendelo-test-secret";
process.env.VENNDELO_WEBHOOK_SECRET = "venndelo-test-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const {
  verifySignature: verifyVendelo,
} = require("../Services/vendeloWebhook.js");
const {
  verifySignature: verifyVenndelo,
  handleVenndeloWebhook,
} = require("../Services/venndeloChatbotWebhook.js");

const sign = (secret, raw) =>
  crypto.createHmac("sha256", secret).update(raw).digest("hex");

test("vendelo: firma sobre el cuerpo crudo y rechazo del secreto en claro", () => {
  const body = { reference: "UPBUY-2026-000001", status: "approved" };
  // Mismo contenido, distinto espaciado: la firma debe validar contra rawBody.
  const raw = '{ "reference" : "UPBUY-2026-000001", "status":"approved" }';

  assert.equal(
    verifyVendelo({
      body,
      rawBody: raw,
      headers: {
        "x-vendelo-signature": sign("vendelo-test-secret", raw),
      },
    }),
    true,
  );

  // La firma calculada sobre el JSON re-serializado no vale para el crudo.
  assert.equal(
    verifyVendelo({
      body,
      rawBody: raw,
      headers: {
        "x-vendelo-signature": sign(
          "vendelo-test-secret",
          JSON.stringify(body),
        ),
      },
    }),
    false,
  );

  // El secreto en claro jamas es una firma valida.
  assert.equal(
    verifyVendelo({
      body,
      rawBody: raw,
      headers: { "x-webhook-secret": "vendelo-test-secret" },
    }),
    false,
  );
});

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
