// Limpieza manual de auth_events por retencion (ADM-S4).
//
// Uso (desde Back/):
//   node scripts/pruneSecurityLogs.js --days=90
//   node scripts/pruneSecurityLogs.js --days=90 --confirm
//
// Sin --confirm solo cuenta lo que borraria. La retencion minima es 7 dias.
// No toca audit_logs de negocio: eso se conserva para trazabilidad contable.

const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local"),
  override: true,
});

const { Op } = require("sequelize");
const { sequelize } = require("../DataBase/db.js");
const { AuthEvent } = require("../DataBase/models/index.js");
const {
  ensureAdminSecuritySchema,
} = require("../DataBase/ensureAdminSecuritySchema.js");
const { purgeAuthEvents } = require("../Services/securityLogs.js");

const parseArgs = (argv) => {
  const args = {};
  for (const item of argv) {
    if (!item.startsWith("--")) continue;
    const [key, ...rest] = item.slice(2).split("=");
    args[key] = rest.length ? rest.join("=") : true;
  }
  return args;
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  const days = Math.trunc(Number(args.days));

  if (!Number.isFinite(days) || days < 7) {
    console.log(
      "Uso: node scripts/pruneSecurityLogs.js --days=90 [--confirm]\n" +
        "La retención mínima es de 7 días.",
    );
    return;
  }

  await sequelize.authenticate();
  await ensureAdminSecuritySchema();

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  if (!args.confirm) {
    const count = await AuthEvent.count({
      where: { createdAt: { [Op.lt]: cutoff } },
    });
    console.log(
      `Se borrarían ${count} evento(s) de autenticación anteriores a ${cutoff.toISOString()}.`,
    );
    console.log("Ejecuta de nuevo con --confirm para aplicar el borrado.");
    return;
  }

  const result = await purgeAuthEvents({ olderThanDays: days });
  console.log(
    `✅ ${result.deleted} evento(s) borrados (retención: ${result.olderThanDays} días).`,
  );
};

run()
  .then(() => sequelize.close())
  .catch(async (error) => {
    console.error("❌", error.message);
    await sequelize.close().catch(() => {});
    process.exitCode = 1;
  });
