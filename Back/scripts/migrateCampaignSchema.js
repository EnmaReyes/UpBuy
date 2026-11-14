// Migracion manual del esquema de campanas (ADM-7). La API tambien lo corre
// al arrancar; este script sirve para prepararlo a mano contra una base
// nueva (p. ej. Neon).
//
// Uso: node scripts/migrateCampaignSchema.js
//   (usa DATABASE_URL / DB_* de .env / .env.local)

require("dotenv").config();
require("dotenv").config({ path: ".env.local", override: true });

const { sequelize } = require("../DataBase/db.js");
const {
  ensureCampaignSchema,
} = require("../DataBase/ensureCampaignSchema.js");

const run = async () => {
  try {
    await sequelize.authenticate();
    const result = await ensureCampaignSchema();
    console.log(
      result.migrated
        ? "✅ Esquema de campanas aplicado"
        : "ℹ️  El esquema de campanas ya estaba al dia",
    );
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error("❌", error.message);
    process.exit(1);
  }
};

run();
