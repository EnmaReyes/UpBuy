// Pruebas de las reglas que SI necesitan la base local:
// idempotencia de webhooks y recalculo del perfil.
//
//   node --test test/
//
// Si la base no esta disponible, las pruebas se saltan en vez de fallar: el
// `npm test` de las reglas puras (rules.test.js) sigue sirviendo en cualquier
// maquina.

const test = require("node:test");
const assert = require("node:assert/strict");

process.chdir(require("path").join(__dirname, ".."));

const {
  sequelize,
  Usuarios,
  Address,
  WebhookEvent,
} = require("../DataBase/models/index.js");
const { beginWebhookEvent, finishWebhookEvent } = require("../Services/webhookEvents.js");
const { recalcProfileComplete } = require("../Services/profile.js");

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

test("un evento de webhook repetido no se procesa dos veces", async (t) => {
  if (skipIfNoDb(t)) return;

  const provider = "test-idempotencia";
  const eventId = `evt-${Date.now()}`;

  try {
    const first = await beginWebhookEvent({
      provider,
      eventId,
      event: "test",
      payload: { a: 1 },
    });
    assert.equal(first.duplicate, false);

    await finishWebhookEvent(first.record, { ok: true });

    const second = await beginWebhookEvent({
      provider,
      eventId,
      event: "test",
      payload: { a: 1 },
    });
    assert.equal(second.duplicate, true);
    assert.equal(second.record.eventId, eventId);
  } finally {
    await WebhookEvent.destroy({ where: { provider } });
  }
});

test("un evento que fallo se puede reintentar", async (t) => {
  if (skipIfNoDb(t)) return;

  const provider = "test-reintento";
  const eventId = `evt-${Date.now()}`;

  try {
    const first = await beginWebhookEvent({ provider, eventId, event: "test" });
    await finishWebhookEvent(first.record, { ok: false, error: "boom" });

    const retry = await beginWebhookEvent({ provider, eventId, event: "test" });
    assert.equal(retry.duplicate, false, "un evento fallido debe reintentarse");
  } finally {
    await WebhookEvent.destroy({ where: { provider } });
  }
});

test("recalcProfileComplete refleja los datos del usuario", async (t) => {
  if (skipIfNoDb(t)) return;

  const email = `perfil-${Date.now()}@test.local`;
  const user = await Usuarios.create({
    username: `perfil${Date.now()}`,
    email,
    password: "x",
    name: "Ana",
    lastName: "Perez",
    phone: "+573001234567",
  });

  try {
    let result = await recalcProfileComplete(user.id);
    assert.equal(result.profileComplete, false);
    assert.deepEqual(result.missing, ["address"]);

    await Address.create({
      userId: user.id,
      address: "Calle 1 #2-3",
      city: "Medellin",
      department: "Antioquia",
      isDefault: true,
    });

    result = await recalcProfileComplete(user.id);
    assert.equal(result.profileComplete, true);
    assert.deepEqual(result.missing, []);
  } finally {
    await Address.destroy({ where: { userId: user.id } });
    await Usuarios.destroy({ where: { id: user.id } });
  }
});
