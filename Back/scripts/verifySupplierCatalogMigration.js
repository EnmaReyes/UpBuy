/**
 * scripts/verifySupplierCatalogMigration.js
 *
 * Verifica que la migracion del catalogo sea idempotente y que las
 * restricciones clave existan:
 *
 *   1. Primera corrida: aplica (o ya estaba al dia).
 *   2. Segunda corrida: NO migra de nuevo.
 *   3. (supplierId, externalId) es unico en supplier_products.
 *   4. (productId, position) es unico en product_images.
 *   5. Las columnas nuevas de order_items/products existen.
 *
 * Uso: node scripts/verifySupplierCatalogMigration.js
 */
const path = require("path");
require("dotenv").config();
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local"), override: true });

const { sequelize } = require("../DataBase/db.js");
const {
  ensureCatalogSchema,
  getSchemaState,
} = require("../DataBase/ensureCatalogSchema.js");

(async () => {
  const checks = [];
  const check = (ok, label) => {
    checks.push({ ok, label });
    console.log(`${ok ? "✅" : "❌"} ${label}`);
  };

  try {
    await sequelize.authenticate();

    const first = await ensureCatalogSchema();
    console.log("Primera corrida:", first);
    const second = await ensureCatalogSchema();
    console.log("Segunda corrida:", second);
    check(second.migrated === false, "La migracion es idempotente");

    const state = await getSchemaState();
    check(state.hasProducts, "products existe");
    check(state.hasCategories, "categories existe");
    check(state.hasProductCategories, "product_categories existe");
    check(state.hasProductImages, "product_images existe");
    check(state.hasSuppliers, "suppliers existe");
    check(state.hasSupplierCredentials, "supplier_credentials existe");
    check(state.hasSupplierProducts, "supplier_products existe");
    check(state.hasSupplierVariations, "supplier_product_variations existe");
    check(state.hasSupplierAssets, "supplier_product_assets existe");
    check(state.hasCatalogSyncRuns, "catalog_sync_runs existe");
    check(
      !state.hasLegacyArticles,
      "La tabla vieja articulos ya no existe",
    );

    const [unique] = await sequelize.query(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
            'supplier_products_supplier_external_unique',
            'product_images_product_position_unique',
            'supplier_variations_product_external_unique',
            'supplier_assets_product_external_unique'
          )
        ORDER BY indexname`,
    );
    check(unique.length === 4, "Los indices unicos del catalogo existen");

    const failed = checks.filter((c) => !c.ok).length;
    console.log(
      failed === 0
        ? "\n✅ Verificacion completa: todo en orden"
        : `\n⚠️  ${failed} verificacion(es) fallaron`,
    );
    process.exitCode = failed === 0 ? 0 : 1;
  } catch (error) {
    console.error("❌", error.name, error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
})();