// Crea/actualiza TODO el esquema de la base (idempotente).
//
// Es el mismo trabajo que hace la API al arrancar (ver index.js), pero se
// puede correr a mano para:
//   - preparar una base Neon NUEVA antes del primer deploy,
//   - aplicarlo contra una URL concreta sin desplegar,
//   - verificar que el esquema quedo completo.
//
// Uso (desde Back/): con la DATABASE_URL del entorno o de un .env.local:
//   node scripts/bootstrapSchema.js
//
// Contra una base concreta sin tocar .env.local (util para Neon):
//   DATABASE_URL="postgresql://...@...neon.tech/db?sslmode=require" \
//     node scripts/bootstrapSchema.js
//
// En Windows PowerShell:
//   $env:DATABASE_URL="postgresql://..."; node scripts/bootstrapSchema.js
//
// Orden: base -> seguridad admin -> catalogo -> dropshipping. Sale con codigo
// 1 si algo falla.

const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local"),
  override: true,
});

const { sequelize } = require("../DataBase/db.js");
const { ensureBaseSchema } = require("../DataBase/ensureBaseSchema.js");
const {
  ensureAdminSecuritySchema,
} = require("../DataBase/ensureAdminSecuritySchema.js");
const { ensureCatalogSchema } = require("../DataBase/ensureCatalogSchema.js");
const {
  ensureDropshippingSchema,
} = require("../DataBase/ensureDropshippingSchema.js");

const run = async () => {
  await sequelize.authenticate();

  const base = await ensureBaseSchema();
  const admin = await ensureAdminSecuritySchema();
  const catalog = await ensureCatalogSchema();
  const dropshipping = await ensureDropshippingSchema();

  const aplicado =
    base.migrated ||
    admin.migrated ||
    catalog.migrated ||
    dropshipping.migrated;

  console.log(
    aplicado
      ? "✅ Esquema aplicado por completo"
      : "✅ El esquema ya estaba al día",
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
