// Sin VENNDELO_WEBHOOK_SECRET el endpoint publico debe rechazar (fail-closed):
// aceptar eventos sin firma permitiria inyectar webhooks falsos.
process.env.UPBUY_SKIP_DOTENV = "1";
process.env.VENNDELO_WEBHOOK_SECRET = "";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  handleVenndeloWebhook,
} = require("../Services/venndeloChatbotWebhook.js");

test("venndelo: sin secreto configurado el webhook responde 503", async () => {
  await assert.rejects(
    () => handleVenndeloWebhook({ body: { event: "ORDER_CREATED" } }),
    (error) => error.status === 503,
  );
});
