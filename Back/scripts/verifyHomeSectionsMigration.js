/**
 * scripts/verifyHomeSectionsMigration.js
 *
 * Verifica que la curaduria de la Home este aplicada e idempotente:
 *
 *   1. Primera corrida: aplica (o ya estaba al dia).
 *   2. Segunda corrida: NO migra de nuevo.
 *   3. `product_home_sections` existe y sus dos indices estan creados.
 *   4. El CHECK de `section` solo admite las tres secciones conocidas.
 *
 * Uso: node scripts/verifyHomeSectionsMigration.js
 */
const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local"),
  override: true,
});

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
    check(state.hasHomeSections, "product_home_sections existe");

    const [indexes] = await sequelize.query(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'product_home_sections'
          AND indexname IN (
            'product_home_sections_product_section_uidx',
            'product_home_sections_section_position_idx'
          )
        ORDER BY indexname`,
    );
    check(
      indexes.length === 2,
      "Los indices de product_home_sections existen",
    );

    const [constraints] = await sequelize.query(
      `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c
        WHERE c.conrelid = 'product_home_sections'::regclass
          AND c.contype = 'c'`,
    );
    const sectionCheck = constraints.find((row) =>
      String(row.def).includes("seleccion"),
    );
    check(
      Boolean(sectionCheck) &&
        String(sectionCheck.def).includes("favoritos"),
      "El CHECK de section admite las tres secciones",
    );

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
