// Migracion idempotente del esquema de seguridad administrativa (ADM-S1).
//
// Mismo patron que ensureDropshippingSchema.js:
//   1. Camino rapido: una consulta de solo lectura cuando todo esta al dia.
//   2. Camino de migracion: transaccion + advisory lock + lock_timeout corto.
//
// Agrega:
//   usuarios      -> role, disabled, tokenVersion, mfaEnabled,
//                    mfaSecretEncrypted, mfaEnrolledAt, lastLoginAt,
//                    lastLoginIp.
//   admin_sessions-> sesiones revocables de los administradores.
//   auth_events   -> bitacora de eventos de autenticacion.
//   admin_mfa_challenges -> retos de segundo factor (ADM-S2).
//   admin_backup_codes   -> codigos de respaldo de un solo uso (ADM-S2).
//
// `role` es la fuente de verdad. La columna legacy `admin` se conserva y se
// sincroniza desde `role` para no romper consultas antiguas (por ejemplo
// notifyAdmins). En una limpieza posterior se podra retirar.
//
// Las columnas de MFA se crean aqui y las usa ADM-S2 (Services/mfa.js).

const { sequelize } = require("./db.js");

const SCHEMA_LOCK_KEY = 2147483003;

const ROLES = ["customer", "support", "admin", "superadmin"];

const getSchemaState = async (transaction) => {
  const [rows] = await sequelize.query(
    `SELECT
       to_regclass('public.usuarios') IS NOT NULL       AS "hasUsers",
       to_regclass('public.admin_sessions') IS NOT NULL AS "hasAdminSessions",
       to_regclass('public.auth_events') IS NOT NULL    AS "hasAuthEvents",
       to_regclass('public.admin_mfa_challenges') IS NOT NULL
                                                        AS "hasMfaChallenges",
       to_regclass('public.admin_backup_codes') IS NOT NULL
                                                        AS "hasBackupCodes",

       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'usuarios'
                  AND column_name = 'role')             AS "hasRole",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'usuarios'
                  AND column_name = 'disabled')         AS "hasDisabled",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'usuarios'
                  AND column_name = 'tokenVersion')     AS "hasTokenVersion",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'usuarios'
                  AND column_name = 'mfaEnabled')       AS "hasMfaEnabled",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'usuarios'
                  AND column_name = 'mfaSecretEncrypted')
                                                         AS "hasMfaSecret",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'usuarios'
                  AND column_name = 'mfaEnrolledAt')    AS "hasMfaEnrolledAt",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'usuarios'
                  AND column_name = 'lastLoginAt')      AS "hasLastLoginAt",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'usuarios'
                  AND column_name = 'lastLoginIp')      AS "hasLastLoginIp"`,
    { transaction },
  );

  return rows[0] || {};
};

const needsMigration = (state) => {
  if (!state.hasUsers) return false;

  return (
    !state.hasRole ||
    !state.hasDisabled ||
    !state.hasTokenVersion ||
    !state.hasMfaEnabled ||
    !state.hasMfaSecret ||
    !state.hasMfaEnrolledAt ||
    !state.hasLastLoginAt ||
    !state.hasLastLoginIp ||
    !state.hasAdminSessions ||
    !state.hasAuthEvents ||
    !state.hasMfaChallenges ||
    !state.hasBackupCodes
  );
};

// Agrega o corrige el CHECK de roles. Postgres no tiene
// "ADD CONSTRAINT IF NOT EXISTS": se consulta pg_constraint primero.
const addRoleCheck = async (transaction) => {
  const name = "usuarios_role_check";
  const lista = ROLES.map((role) => `'${role}'`).join(", ");
  const definicion = `CHECK (role IN (${lista}))`;

  await sequelize.query(
    `DO $constraint$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_constraint
          WHERE conrelid = 'usuarios'::regclass
            AND conname = '${name}'
       ) THEN
         ALTER TABLE usuarios
           ADD CONSTRAINT ${name}
           ${definicion};
       END IF;
     END
     $constraint$`,
    { transaction },
  );
};

const applySchema = async (transaction) => {
  // -------------------------------------------------------------------------
  // 1. Columnas de usuarios.
  // -------------------------------------------------------------------------
  await sequelize.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'customer'`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT false`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0`,
    { transaction },
  );

  // Reservadas para ADM-S2 (MFA TOTP). No se leen ni escriben todavia.
  await sequelize.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN NOT NULL DEFAULT false`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS "mfaSecretEncrypted" TEXT`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS "mfaEnrolledAt" TIMESTAMPTZ`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMPTZ`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS "lastLoginIp" VARCHAR(64)`,
    { transaction },
  );

  await addRoleCheck(transaction);

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS usuarios_role_idx ON usuarios (role)`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 2. Sesiones administrativas revocables.
  // -------------------------------------------------------------------------
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS admin_sessions (
       id UUID PRIMARY KEY,
       "userId" UUID NOT NULL REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE,
       "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
       "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
       "expiresAt" TIMESTAMPTZ NOT NULL,
       "mfaAt" TIMESTAMPTZ,
       "revokedAt" TIMESTAMPTZ,
       ip VARCHAR(64),
       "userAgent" TEXT
     )`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS admin_sessions_user_active_idx
       ON admin_sessions ("userId", "revokedAt")`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx
       ON admin_sessions ("expiresAt")`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 3. Eventos de autenticacion.
  // -------------------------------------------------------------------------
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS auth_events (
       id UUID PRIMARY KEY,
       "userId" UUID REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL,
       event VARCHAR(40) NOT NULL,
       result VARCHAR(20) NOT NULL,
       ip VARCHAR(64),
       "userAgent" TEXT,
       metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
       "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS auth_events_user_idx
       ON auth_events ("userId", "createdAt" DESC)`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS auth_events_event_idx
       ON auth_events (event, "createdAt" DESC)`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS auth_events_created_at_idx
       ON auth_events ("createdAt" DESC)`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 4. Retos de MFA y codigos de respaldo (ADM-S2).
  // -------------------------------------------------------------------------
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS admin_mfa_challenges (
       id UUID PRIMARY KEY,
       "userId" UUID NOT NULL REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE,
       purpose VARCHAR(20) NOT NULL DEFAULT 'login',
       "codeHash" TEXT,
       "expiresAt" TIMESTAMPTZ NOT NULL,
       "usedAt" TIMESTAMPTZ,
       attempts INTEGER NOT NULL DEFAULT 0,
       "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS admin_mfa_challenges_user_purpose_idx
       ON admin_mfa_challenges ("userId", purpose)`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS admin_mfa_challenges_expires_at_idx
       ON admin_mfa_challenges ("expiresAt")`,
    { transaction },
  );

  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS admin_backup_codes (
       id UUID PRIMARY KEY,
       "userId" UUID NOT NULL REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE,
       "codeHash" TEXT NOT NULL,
       "usedAt" TIMESTAMPTZ,
       "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS admin_backup_codes_user_used_idx
       ON admin_backup_codes ("userId", "usedAt")`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 5. Backfill y sincronizacion de la columna legacy `admin`.
  //
  // - Un admin historico (admin = true) pasa a role = 'admin'.
  // - `admin` se deriva de `role` para que las consultas antiguas sigan
  //   funcionando. Las escrituras nuevas deben ir a `role`.
  // -------------------------------------------------------------------------
  await sequelize.query(
    `UPDATE usuarios
        SET role = 'admin'
      WHERE admin = true
        AND role = 'customer'`,
    { transaction },
  );

  await sequelize.query(
    `UPDATE usuarios
        SET admin = (role IN ('admin', 'superadmin'))
      WHERE admin IS DISTINCT FROM (role IN ('admin', 'superadmin'))`,
    { transaction },
  );
};

const ensureAdminSecuritySchema = async () => {
  // Camino rapido (arranque normal en Vercel): solo lectura.
  const initialState = await getSchemaState();
  if (!needsMigration(initialState)) {
    return { migrated: false };
  }

  const transaction = await sequelize.transaction();

  try {
    await sequelize.query("SET LOCAL lock_timeout = '10s'", { transaction });
    await sequelize.query("SET LOCAL statement_timeout = '120s'", {
      transaction,
    });

    // Serializa la migracion entre instancias de Vercel.
    await sequelize.query(`SELECT pg_advisory_xact_lock(${SCHEMA_LOCK_KEY})`, {
      transaction,
    });

    // Otra instancia pudo migrar mientras esperabamos el lock.
    const state = await getSchemaState(transaction);
    if (!needsMigration(state)) {
      await transaction.commit();
      return { migrated: false };
    }

    console.log("🛠️ Migrando el esquema de seguridad administrativa...");
    await applySchema(transaction);
    await transaction.commit();
    console.log("✅ Esquema de seguridad administrativa verificado");

    return { migrated: true };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // La conexion pudo caerse: el rollback ya no aplica.
    }
    console.error(
      "❌ Error migrando el esquema de seguridad administrativa:",
      error.message,
    );
    throw error;
  }
};

module.exports = {
  ensureAdminSecuritySchema,
  getSchemaState,
  needsMigration,
};
