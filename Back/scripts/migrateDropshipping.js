// Ejecuta la migracion del esquema de dropshipping a mano.
//
// La migracion tambien corre sola al arrancar la API (ver index.js), pero
// correrla a mano es util para:
//   - aplicarla antes de un deploy,
//   - verificar que el esquema quedo bien despues de un cambio,
//   - depurar una migracion que fallo.
//
// Uso (desde Back/):
//   node scripts/migrateDropshipping.js
//
// Sale con codigo 1 si la migracion falla.

const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local"),
  override: true,
});

const { sequelize } = require("../DataBase/db.js");
const { ensureDropshippingSchema } = require("../DataBase/ensureDropshippingSchema.js");

const run = async () => {
  const resultado = await ensureDropshippingSchema();
  console.log(
    resultado.migrated
      ? "🛠️ Esquema de dropshipping migrado"
      : "✅ Esquema de dropshipping ya estaba al día",
  );
};

run()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error) => {
    console.error("❌", error.name, error.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
