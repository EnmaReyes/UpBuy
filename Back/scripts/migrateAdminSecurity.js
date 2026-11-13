// Aplica a mano la migracion de seguridad administrativa (ADM-S1).
//
// La migracion tambien corre sola al arrancar la API, pero este script es
// util para preparar una base antes del deploy o para verificarla despues.
//
// Uso (desde Back/):
//   node scripts/migrateAdminSecurity.js
//
// Sale con codigo 1 si falla.

const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local"),
  override: true,
});

const { sequelize } = require("../DataBase/db.js");
const {
  ensureAdminSecuritySchema,
} = require("../DataBase/ensureAdminSecuritySchema.js");

const run = async () => {
  const resultado = await ensureAdminSecuritySchema();
  console.log(
    resultado.migrated
      ? "🛠️ Esquema de seguridad administrativa migrado"
      : "✅ Esquema de seguridad administrativa ya estaba al día",
  );

  const [roles] = await sequelize.query(
    `SELECT role, count(*)::int AS total
       FROM usuarios
      GROUP BY role
      ORDER BY role`,
  );
  console.log("Usuarios por rol:");
  for (const row of roles) {
    console.log(`   - ${row.role}: ${row.total}`);
  }

  const [[counts]] = await sequelize.query(
    `SELECT
       (SELECT count(*)::int FROM admin_sessions WHERE "revokedAt" IS NULL) AS "activeSessions",
       (SELECT count(*)::int FROM auth_events) AS "authEvents"`,
  );
  console.log(
    `Sesiones activas: ${counts.activeSessions}; eventos de autenticación: ${counts.authEvents}`,
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
