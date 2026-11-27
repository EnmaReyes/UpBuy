// Registra (o reactiva) las suscripciones de webhook de MasterShop.
//
// Uso (desde Back/):
//   npm run mastershop:webhooks -- --url=https://<backend>/api/webhooks/mastershop
//   MASTERSHOP_WEBHOOK_URL=... npm run mastershop:webhooks
//
// MasterShop no lista las suscripciones existentes y el `idProductWebhook` no
// se puede recuperar: se persiste en `mastershop_webhooks`. Si ya hay una fila
// para el evento + URL se reutiliza y solo se reactiva.
const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local"),
  override: true,
});

const { sequelize, MastershopWebhook } = require("../DataBase/models/index.js");
const { MASTERSHOP_WEBHOOK_URL } = require("../config.js");
const { ensureMastershopSchema } = require("../DataBase/ensureMastershopSchema.js");
const {
  WEBHOOK_EVENTS,
  createSubscription,
  setSubscriptionEnabled,
} = require("../integrations/suppliers/mastershop/mastershop.webhooks.js");

const argUrl = (() => {
  const flag = process.argv.find((arg) => arg.startsWith("--url="));
  return flag ? flag.slice("--url=".length).trim() : "";
})();

const run = async () => {
  const url = (argUrl || MASTERSHOP_WEBHOOK_URL || "").trim();
  if (!url) {
    throw new Error(
      "Falta la URL del webhook. Usa --url=https://<backend>/api/webhooks/mastershop o define MASTERSHOP_WEBHOOK_URL",
    );
  }

  await sequelize.authenticate();
  await ensureMastershopSchema();

  const results = [];

  for (const [name, idWebhook] of Object.entries(WEBHOOK_EVENTS)) {
    const existing = await MastershopWebhook.findOne({
      where: { idWebhook, url },
    });

    if (existing) {
      try {
        await setSubscriptionEnabled(existing.idProductWebhook, true);
        await existing.update({
          isEnable: true,
          name: existing.name || name,
          lastRegisteredAt: new Date(),
          lastError: null,
        });
        results.push({
          event: name,
          idWebhook,
          idProductWebhook: existing.idProductWebhook,
          action: "reactivado",
        });
      } catch (error) {
        await existing.update({ lastError: error.message });
        results.push({ event: name, idWebhook, error: error.message });
      }
      continue;
    }

    try {
      const created = await createSubscription({
        idWebhook,
        url,
        name: `UPBUY ${name} ${idWebhook}`,
      });

      if (!created.idProductWebhook) {
        throw new Error(
          "MasterShop no devolvio idProductWebhook (no se puede gestionar la suscripcion)",
        );
      }

      await MastershopWebhook.create({
        idWebhook,
        idProductWebhook: created.idProductWebhook,
        url,
        name: `UPBUY ${name} ${idWebhook}`,
        isEnable: true,
        lastRegisteredAt: new Date(),
      });

      results.push({
        event: name,
        idWebhook,
        idProductWebhook: created.idProductWebhook,
        action: "creado",
      });
    } catch (error) {
      results.push({ event: name, idWebhook, error: error.message });
    }
  }

  console.log(JSON.stringify({ url, results }, null, 2));

  if (results.some((entry) => entry.error)) {
    process.exitCode = 1;
  }
};

run()
  .catch((error) => {
    console.error("❌", error.name, error.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());