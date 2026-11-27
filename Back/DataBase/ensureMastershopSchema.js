// Migracion idempotente del flujo "pago aprobado -> pedido en MasterShop".
//
// Misma estructura que ensureCatalogSchema.js:
//
//   1. Camino rapido: si el esquema ya esta al dia se resuelve con UNA
//      consulta de solo lectura (sin transaccion, sin lock, sin DDL).
//   2. Camino de migracion: solo si falta algo. Transaccion con advisory lock
//      y lock_timeout corto, para no colgar una funcion de Vercel.
//
// Que agrega (TODO aditivo, nada se renombra ni se borra):
//
//   - orders.msIdOrder / msExternalOrderId / msSyncedAt / msStatus /
//     msSyncState / msSyncError: el resultado del envio a MasterShop, junto al
//     pedido. No se usa la columna `provider` porque su CHECK solo admite el
//     proveedor de pedidos historico (dropi).
//   - Indice unico parcial en msIdOrder: un pedido de MasterShop no puede
//     quedar asociado a dos pedidos locales.
//   - mastershop_attr_alias: excepciones del mapeo de atributos.
//   - mastershop_order_outbox: cola persistente (patron outbox). Una fila por
//     pedido.
//   - mastershop_order_attempts: bitacora de cada llamada a la API.
//
// Nota: este modulo NO toca supplier_products / supplier_product_variations.
// Las variantes de MasterShop se guardan ahi mismo (decision de la Fase 0):
// lo que cambia es el normalizador, no el esquema.
const { sequelize } = require("./db.js");

// Llave propia: cada ensure*Schema tiene la suya (ver ensureCatalogSchema).
const SCHEMA_LOCK_KEY = 2147483007;

// ---------------------------------------------------------------------------
// Deteccion
// ---------------------------------------------------------------------------

const getSchemaState = async (transaction) => {
  const [rows] = await sequelize.query(
    `SELECT
       to_regclass('public.mastershop_attr_alias') IS NOT NULL       AS "hasAttrAlias",
       to_regclass('public.mastershop_order_outbox') IS NOT NULL     AS "hasOutbox",
       to_regclass('public.mastershop_order_attempts') IS NOT NULL   AS "hasAttempts",
       to_regclass('public.mastershop_webhooks') IS NOT NULL         AS "hasWebhooks",
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'orders'
            AND column_name = 'msIdOrder'
       ) AS "hasMsIdOrder",
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'orders'
            AND column_name = 'msSyncState'
       ) AS "hasMsSyncState",
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'orders'
            AND column_name = 'msCancelState'
       ) AS "hasMsCancelState",
       EXISTS (
         SELECT 1
           FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
           JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE n.nspname = 'public'
            AND t.relname = 'mastershop_order_attempts'
            AND c.conname = 'mastershop_order_attempts_action_check'
            AND pg_get_constraintdef(c.oid) LIKE '%cancel%'
       ) AS "hasCancelAction",
       EXISTS (
         SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = 'orders_ms_id_order_unique'
       ) AS "hasMsIdOrderIndex"`,
    { transaction },
  );
  return rows[0];
};

const needsMigration = (state) =>
  !state.hasAttrAlias ||
  !state.hasOutbox ||
  !state.hasAttempts ||
  !state.hasWebhooks ||
  !state.hasMsIdOrder ||
  !state.hasMsSyncState ||
  !state.hasMsCancelState ||
  !state.hasCancelAction ||
  !state.hasMsIdOrderIndex;

// ---------------------------------------------------------------------------
// Aplicacion
// ---------------------------------------------------------------------------

const applySchema = async (transaction) => {
  // -------------------------------------------------------------------------
  // 1. Resultado del envio, en la propia fila del pedido
  // -------------------------------------------------------------------------
  await sequelize.query(
    `ALTER TABLE orders
       ADD COLUMN IF NOT EXISTS "msIdOrder" BIGINT,
       ADD COLUMN IF NOT EXISTS "msExternalOrderId" VARCHAR(120),
       ADD COLUMN IF NOT EXISTS "msSyncedAt" TIMESTAMPTZ,
       ADD COLUMN IF NOT EXISTS "msStatus" VARCHAR(80),
       ADD COLUMN IF NOT EXISTS "msSyncState" VARCHAR(30),
       ADD COLUMN IF NOT EXISTS "msSyncError" TEXT,
       ADD COLUMN IF NOT EXISTS "msCancelState" VARCHAR(20),
       ADD COLUMN IF NOT EXISTS "msCancelAttempts" INTEGER NOT NULL DEFAULT 0,
       ADD COLUMN IF NOT EXISTS "msCancelNextAttemptAt" TIMESTAMPTZ,
       ADD COLUMN IF NOT EXISTS "msCancelError" TEXT,
       ADD COLUMN IF NOT EXISTS "msCancelledAt" TIMESTAMPTZ`,
    { transaction },
  );

  // Un idOrder de MasterShop no puede pertenecer a dos pedidos locales.
  // Parcial: los pedidos que todavia no se enviaron quedan en NULL.
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS orders_ms_id_order_unique
       ON orders ("msIdOrder")
       WHERE "msIdOrder" IS NOT NULL`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS orders_ms_sync_state_idx
       ON orders ("msSyncState")`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS orders_ms_external_order_idx
       ON orders ("msExternalOrderId")`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS orders_ms_cancel_state_idx
       ON orders ("msCancelState")`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 2. Excepciones del mapeo de atributos
  // -------------------------------------------------------------------------
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS mastershop_attr_alias (
       id UUID PRIMARY KEY,
       kind VARCHAR(20) NOT NULL,
       source VARCHAR(120) NOT NULL,
       target VARCHAR(120) NOT NULL,
       notes TEXT,
       "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
       "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
       CONSTRAINT mastershop_attr_alias_kind_check
         CHECK (kind IN ('attribute', 'value'))
     )`,
    { transaction },
  );
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS mastershop_attr_alias_kind_source_unique
       ON mastershop_attr_alias (kind, source)`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 3. Cola persistente (outbox)
  // -------------------------------------------------------------------------
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS mastershop_order_outbox (
       id UUID PRIMARY KEY,
       "orderId" UUID NOT NULL REFERENCES orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
       status VARCHAR(20) NOT NULL DEFAULT 'pending',
       attempts INTEGER NOT NULL DEFAULT 0,
       "nextAttemptAt" TIMESTAMPTZ,
       "lockedAt" TIMESTAMPTZ,
       "lastError" TEXT,
       "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
       "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
       CONSTRAINT mastershop_order_outbox_status_check
         CHECK (status IN ('pending', 'processing', 'done', 'needs_review', 'failed'))
     )`,
    { transaction },
  );
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS mastershop_order_outbox_order_unique
       ON mastershop_order_outbox ("orderId")`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS mastershop_order_outbox_pending_idx
       ON mastershop_order_outbox (status, "nextAttemptAt")`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 4. Bitacora de intentos
  // -------------------------------------------------------------------------
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS mastershop_order_attempts (
       id UUID PRIMARY KEY,
       "orderId" UUID NOT NULL REFERENCES orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
       attempt INTEGER NOT NULL DEFAULT 1,
       action VARCHAR(20) NOT NULL DEFAULT 'create',
       ok BOOLEAN NOT NULL DEFAULT false,
       "httpStatus" INTEGER,
       retryable BOOLEAN NOT NULL DEFAULT false,
       error TEXT,
       "msIdOrder" BIGINT,
       "requestPayload" JSONB NOT NULL DEFAULT '{}'::jsonb,
       "responseBody" JSONB NOT NULL DEFAULT '{}'::jsonb,
       "durationMs" INTEGER,
       "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
       CONSTRAINT mastershop_order_attempts_action_check
         CHECK (action IN ('create', 'recover', 'cancel'))
     )`,
    { transaction },
  );
  // Reescribe el CHECK en bases creadas antes de la cancelacion: el
  // `CREATE TABLE IF NOT EXISTS` de arriba no lo toca si la tabla ya existia.
  await sequelize.query(
    `ALTER TABLE mastershop_order_attempts
       DROP CONSTRAINT IF EXISTS mastershop_order_attempts_action_check`,
    { transaction },
  );
  await sequelize.query(
    `ALTER TABLE mastershop_order_attempts
       ADD CONSTRAINT mastershop_order_attempts_action_check
       CHECK (action IN ('create', 'recover', 'cancel'))`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS mastershop_order_attempts_order_idx
       ON mastershop_order_attempts ("orderId", "createdAt")`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 5. Suscripciones de webhook (estado/tracking)
  // -------------------------------------------------------------------------
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS mastershop_webhooks (
       id UUID PRIMARY KEY,
       "idWebhook" INTEGER NOT NULL,
       "idProductWebhook" VARCHAR(120) NOT NULL,
       url VARCHAR(500) NOT NULL,
       name VARCHAR(120),
       "isEnable" BOOLEAN NOT NULL DEFAULT true,
       "lastRegisteredAt" TIMESTAMPTZ,
       "lastError" TEXT,
       "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
       "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    { transaction },
  );
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS mastershop_webhooks_product_unique
       ON mastershop_webhooks ("idProductWebhook")`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS mastershop_webhooks_event_idx
       ON mastershop_webhooks ("idWebhook")`,
    { transaction },
  );
};

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

const ensureMastershopSchema = async () => {
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
      console.log("✅ Esquema de MasterShop al día (otra instancia ya migró)");
      return { migrated: false };
    }

    console.log("🛠️ Migrando el esquema de MasterShop...");
    await applySchema(transaction);
    await transaction.commit();
    console.log("✅ Esquema de MasterShop verificado");

    return { migrated: true };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // La conexion pudo caerse: el rollback ya no aplica.
    }
    console.error("❌ Error migrando el esquema de MasterShop:", error.message);
    throw error;
  }
};

module.exports = { ensureMastershopSchema, SCHEMA_LOCK_KEY };
