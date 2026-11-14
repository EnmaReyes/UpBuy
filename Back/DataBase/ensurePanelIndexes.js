// Indices del panel (ADM-10). Cierra la revision de consultas y accesos:
//   orders(provider, createdAt DESC)   -> filtro de proveedor en listados y
//                                         consultas de ventas/accounting.
//   orders("userId", createdAt DESC)   -> detalle de cliente y sus pedidos.
//   usuarios(createdAt DESC)           -> listado de clientes (orden por
//                                         defecto) y cron de difusion.
//   campaign_recipients(status, sentAt)-> techo diario (sentTodayCount) y
//                                         pendientes del cron.
//
// Patron identico a ensureCampaignSchema: camino rapido de solo lectura,
// advisory lock y CREATE INDEX IF NOT EXISTS (idempotente).

const { sequelize } = require("./db.js");

const SCHEMA_LOCK_KEY = 2147483006;

const INDEXES = [
  {
    name: "orders_provider_created_at_idx",
    ddl: `CREATE INDEX IF NOT EXISTS orders_provider_created_at_idx
            ON orders (provider, "createdAt" DESC)`,
  },
  {
    name: "orders_user_created_at_idx",
    ddl: `CREATE INDEX IF NOT EXISTS orders_user_created_at_idx
            ON orders ("userId", "createdAt" DESC)`,
  },
  {
    name: "usuarios_created_at_idx",
    ddl: `CREATE INDEX IF NOT EXISTS usuarios_created_at_idx
            ON usuarios ("createdAt" DESC)`,
  },
  {
    name: "campaign_recipients_status_sent_at_idx",
    ddl: `CREATE INDEX IF NOT EXISTS campaign_recipients_status_sent_at_idx
            ON campaign_recipients (status, "sentAt")`,
  },
];

const getSchemaState = async (transaction) => {
  const [rows] = await sequelize.query(
    `SELECT indexname FROM pg_indexes
      WHERE indexname IN (:names)`,
    { replacements: { names: INDEXES.map((index) => index.name) }, transaction },
  );
  const present = new Set(rows.map((row) => row.indexname));
  return { missing: INDEXES.filter((index) => !present.has(index.name)) };
};

const ensurePanelIndexes = async () => {
  const initialState = await getSchemaState();
  if (initialState.missing.length === 0) {
    return { migrated: false };
  }

  const transaction = await sequelize.transaction();
  try {
    await sequelize.query("SET LOCAL lock_timeout = '10s'", { transaction });
    await sequelize.query("SET LOCAL statement_timeout = '120s'", { transaction });
    await sequelize.query(`SELECT pg_advisory_xact_lock(${SCHEMA_LOCK_KEY})`, {
      transaction,
    });

    const state = await getSchemaState(transaction);
    if (state.missing.length === 0) {
      await transaction.commit();
      return { migrated: false };
    }

    for (const index of state.missing) {
      await sequelize.query(index.ddl, { transaction });
    }
    await transaction.commit();
    return { migrated: true, created: state.missing.length };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // La conexion pudo caerse: el rollback ya no aplica.
    }
    throw error;
  }
};

module.exports = { ensurePanelIndexes, INDEXES };
