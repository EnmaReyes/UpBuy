// Migracion idempotente del flujo "pago aprobado -> pedido en Venndelo".
//
// Mismo patron que ensureMastershopSchema.js:
//
//   1. Camino rapido: si el esquema ya esta al dia se resuelve con UNA
//      consulta de solo lectura (sin transaccion, sin lock, sin DDL).
//   2. Camino de migracion: solo si falta algo. Transaccion con advisory lock
//      propio y lock_timeout corto.
//
// Que agrega (TODO aditivo):
//   - orders.vdIdOrder / vdExternalOrderId / vdSyncedAt / vdStatus /
//     vdSyncState / vdSyncError.
//   - Indice unico parcial en vdIdOrder.
//   - venndelo_order_outbox: cola persistente (una fila por pedido).
//   - venndelo_order_attempts: bitacora de cada llamada.
const { sequelize } = require("./db.js");

// Llave propia: cada ensure*Schema tiene la suya.
const SCHEMA_LOCK_KEY = 2147483011;

const getSchemaState = async (transaction) => {
  const [rows] = await sequelize.query(
    `SELECT
       to_regclass('public.venndelo_order_outbox') IS NOT NULL     AS "hasOutbox",
       to_regclass('public.venndelo_order_attempts') IS NOT NULL   AS "hasAttempts",
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'orders'
            AND column_name = 'vdIdOrder'
       ) AS "hasVdIdOrder",
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'orders'
            AND column_name = 'vdSyncState'
       ) AS "hasVdSyncState",
       EXISTS (
         SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = 'orders_vd_id_order_unique'
       ) AS "hasVdIdOrderIndex"`,
    { transaction },
  );
  return rows[0];
};

const needsMigration = (state) =>
  !state.hasOutbox ||
  !state.hasAttempts ||
  !state.hasVdIdOrder ||
  !state.hasVdSyncState ||
  !state.hasVdIdOrderIndex;

const applySchema = async (transaction) => {
  await sequelize.query(
    `ALTER TABLE orders
       ADD COLUMN IF NOT EXISTS "vdIdOrder" VARCHAR(120),
       ADD COLUMN IF NOT EXISTS "vdExternalOrderId" VARCHAR(120),
       ADD COLUMN IF NOT EXISTS "vdSyncedAt" TIMESTAMPTZ,
       ADD COLUMN IF NOT EXISTS "vdStatus" VARCHAR(80),
       ADD COLUMN IF NOT EXISTS "vdSyncState" VARCHAR(30),
       ADD COLUMN IF NOT EXISTS "vdSyncError" TEXT`,
    { transaction },
  );

  // Un pedido de Venndelo no puede pertenecer a dos pedidos locales.
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS orders_vd_id_order_unique
       ON orders ("vdIdOrder")
       WHERE "vdIdOrder" IS NOT NULL`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS orders_vd_sync_state_idx
       ON orders ("vdSyncState")`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS orders_vd_external_order_idx
       ON orders ("vdExternalOrderId")`,
    { transaction },
  );

  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS venndelo_order_outbox (
       id UUID PRIMARY KEY,
       "orderId" UUID NOT NULL REFERENCES orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
       status VARCHAR(20) NOT NULL DEFAULT 'pending',
       attempts INTEGER NOT NULL DEFAULT 0,
       "nextAttemptAt" TIMESTAMPTZ,
       "lockedAt" TIMESTAMPTZ,
       "lastError" TEXT,
       "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
       "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
       CONSTRAINT venndelo_order_outbox_status_check
         CHECK (status IN ('pending', 'processing', 'done', 'needs_review', 'failed'))
     )`,
    { transaction },
  );
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS venndelo_order_outbox_order_unique
       ON venndelo_order_outbox ("orderId")`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS venndelo_order_outbox_pending_idx
       ON venndelo_order_outbox (status, "nextAttemptAt")`,
    { transaction },
  );

  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS venndelo_order_attempts (
       id UUID PRIMARY KEY,
       "orderId" UUID NOT NULL REFERENCES orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
       attempt INTEGER NOT NULL DEFAULT 1,
       action VARCHAR(20) NOT NULL DEFAULT 'create',
       ok BOOLEAN NOT NULL DEFAULT false,
       "httpStatus" INTEGER,
       retryable BOOLEAN NOT NULL DEFAULT false,
       error TEXT,
       "vdIdOrder" VARCHAR(120),
       "requestPayload" JSONB NOT NULL DEFAULT '{}'::jsonb,
       "responseBody" JSONB NOT NULL DEFAULT '{}'::jsonb,
       "durationMs" INTEGER,
       "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
       CONSTRAINT venndelo_order_attempts_action_check
         CHECK (action IN ('create', 'recover'))
     )`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS venndelo_order_attempts_order_idx
       ON venndelo_order_attempts ("orderId", "createdAt")`,
    { transaction },
  );
};

const ensureVenndeloOrderSchema = async () => {
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
    await sequelize.query(`SELECT pg_advisory_xact_lock(${SCHEMA_LOCK_KEY})`, {
      transaction,
    });

    const state = await getSchemaState(transaction);
    if (!needsMigration(state)) {
      await transaction.commit();
      console.log("✅ Esquema de Venndelo al día (otra instancia ya migró)");
      return { migrated: false };
    }

    console.log("🛠️ Migrando el esquema de Venndelo...");
    await applySchema(transaction);
    await transaction.commit();
    console.log("✅ Esquema de Venndelo verificado");

    return { migrated: true };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // La conexion pudo caerse: el rollback ya no aplica.
    }
    console.error("❌ Error migrando el esquema de Venndelo:", error.message);
    throw error;
  }
};

module.exports = { ensureVenndeloOrderSchema, SCHEMA_LOCK_KEY };