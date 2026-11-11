/**
 * scripts/migrateSupplierCatalog.js
 *
 * Aplica (o revierte) el esquema de catalogo + integracion de proveedores.
 * Es el mismo ensureCatalogSchema() que corre al arrancar la API; este script
 * solo permite ejecutarlo a mano y ver el resultado.
 *
 * Uso:
 *   node scripts/migrateSupplierCatalog.js          # aplica (idempotente)
 *   node scripts/migrateSupplierCatalog.js --down   # REVIERTE (destructivo)
 *
 * El modo --down elimina las tablas nuevas y las columnas agregadas a
 * `order_items`. NO toca pedidos, pagos, usuarios ni historial. Solo se debe
 * usar en desarrollo o con un backup reciente: borra el catalogo importado.
 */
const path = require("path");
require("dotenv").config();
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local"), override: true });

const { sequelize } = require("../DataBase/db.js");
const { ensureCatalogSchema } = require("../DataBase/ensureCatalogSchema.js");

const DOWN_TABLES = [
  "catalog_sync_runs",
  "product_images",
  "product_categories",
  "categories",
  "supplier_product_assets",
  "supplier_product_variations",
  "supplier_products",
  "supplier_credentials",
  "suppliers",
  "products",
];

const down = async () => {
  // Red de seguridad: el refresh token ROTADO de un proveedor vive en
  // supplier_credentials. Si se borra, se pierde el acceso (el token del
  // entorno suele quedar invalidado tras la rotacion).
  const [rows] = await sequelize.query(
    "SELECT count(*)::int AS n FROM supplier_credentials",
  ).catch(() => [[{ n: 0 }]]);
  const credentials = rows?.[0]?.n || 0;

  if (credentials > 0 && !process.argv.includes("--force")) {
    console.error(
      `❌ Hay ${credentials} credencial(es) de proveedor guardadas. Borrarlas puede dejar la integración sin acceso.\n` +
        "   Si de verdad quieres revertir, usa: node scripts/migrateSupplierCatalog.js --down --force",
    );
    process.exitCode = 1;
    return;
  }

  const transaction = await sequelize.transaction();
  try {
    await sequelize.query("SET LOCAL lock_timeout = '10s'", { transaction });

    console.warn(
      "⚠️  REVIRTIENDO el esquema de catalogo: se borra el catalogo importado.",
    );

    await sequelize.query(
      `ALTER TABLE order_items DROP COLUMN IF EXISTS "supplierProductId"`,
      { transaction },
    );

    for (const table of DOWN_TABLES) {
      await sequelize.query(`DROP TABLE IF EXISTS ${table} CASCADE`, {
        transaction,
      });
      console.log(`   - ${table} eliminada`);
    }

    await transaction.commit();
    console.log("✅ Reversion completada (pedidos, pagos y usuarios intactos)");
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

(async () => {
  try {
    await sequelize.authenticate();

    if (process.argv.includes("--down")) {
      await down();
      return;
    }

    const result = await ensureCatalogSchema();
    console.log(
      result.migrated
        ? "✅ Esquema de catalogo aplicado"
        : "ℹ️  El esquema ya estaba al dia",
    );
  } catch (error) {
    console.error("❌", error.name, error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
})();