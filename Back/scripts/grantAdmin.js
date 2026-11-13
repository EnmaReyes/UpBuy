// Concede (o corrige) el rol administrativo de un usuario desde la CLI.
//
// Uso (desde Back/):
//   node scripts/grantAdmin.js --email=persona@dominio.com --role=superadmin --confirm
//   node scripts/grantAdmin.js --username=persona --role=admin --confirm
//
// Reglas:
//   - El rol valido es customer | support | admin | superadmin.
//   - Exige --confirm: es una escritura de privilegios, no una consulta.
//   - Mantiene sincronizada la columna legacy `admin`.
//   - Incrementa tokenVersion y revoca las sesiones del usuario: el cambio de
//     rol surte efecto de inmediato y obliga a un nuevo login.
//   - Queda registrado en audit_logs y auth_events.
//
// Nunca imprime hashes, tokens ni secretos.

const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local"),
  override: true,
});

const { sequelize } = require("../DataBase/db.js");
const {
  Usuarios,
  AuditLog,
} = require("../DataBase/models/index.js");
const {
  ensureAdminSecuritySchema,
} = require("../DataBase/ensureAdminSecuritySchema.js");
const {
  revokeAllForUser,
  recordAuthEvent,
} = require("../Services/adminSessions.js");
const { ROLES } = require("../Services/permissions.js");

const parseArgs = (argv) => {
  const args = {};
  for (const item of argv) {
    if (!item.startsWith("--")) continue;
    const [key, ...rest] = item.slice(2).split("=");
    args[key] = rest.length ? rest.join("=") : true;
  }
  return args;
};

const usage = () => {
  console.log(
    [
      "Uso:",
      "  node scripts/grantAdmin.js --email=correo --role=admin --confirm",
      "  node scripts/grantAdmin.js --username=usuario --role=superadmin --confirm",
      "",
      "Roles: customer | support | admin | superadmin",
    ].join("\n"),
  );
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));

  const email = typeof args.email === "string" ? args.email.trim() : "";
  const username =
    typeof args.username === "string" ? args.username.trim() : "";
  const role = String(args.role || "admin")
    .trim()
    .toLowerCase();

  if (!ROLES.includes(role)) {
    throw new Error(`Rol inválido: "${role}". Usa uno de: ${ROLES.join(", ")}`);
  }
  if (!email && !username) {
    usage();
    throw new Error("Indica --email o --username");
  }
  if (args.confirm !== true) {
    usage();
    throw new Error("Falta --confirm para aplicar el cambio");
  }

  await sequelize.authenticate();
  await ensureAdminSecuritySchema();

  const where = email
    ? { email: email.toLowerCase() }
    : { username };
  const user = await Usuarios.findOne({ where });
  if (!user) {
    throw new Error("No existe un usuario con ese correo o nombre de usuario");
  }

  const before = { role: user.role, admin: user.admin };
  const admin = role === "admin" || role === "superadmin";

  const transaction = await sequelize.transaction();
  try {
    await user.update(
      {
        role,
        admin,
        disabled: false,
        tokenVersion: Number(user.tokenVersion || 0) + 1,
      },
      { transaction },
    );

    await AuditLog.create(
      {
        userId: null,
        entity: "user",
        entityId: user.id,
        action: "admin_role_granted",
        before,
        after: { role, admin },
        note: `grantAdmin.js (CLI), rol ${role}`,
      },
      { transaction },
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  let revoked = 0;
  try {
    revoked = await revokeAllForUser(user.id);
    await recordAuthEvent({
      userId: user.id,
      event: "role_granted",
      result: "success",
      metadata: { role, by: "cli", revokedSessions: revoked },
    });
  } catch (error) {
    console.warn(
      "⚠️ El rol se aplicó, pero no se pudieron revocar las sesiones:",
      error.message,
    );
  }

  const identidad = user.email || user.username;
  console.log(
    `✅ ${identidad}: role=${before.role} → ${role}, admin=${before.admin} → ${admin}`,
  );
  console.log(
    `   tokenVersion incrementado y ${revoked} sesión(es) revocada(s). Debe iniciar sesión de nuevo.`,
  );
};

run()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error) => {
    console.error("❌", error.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
