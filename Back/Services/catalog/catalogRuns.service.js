// Registro y control de las corridas de sincronizacion de catalogo.
//
// Responsabilidades:
//   - Resolver la fila `suppliers` por slug.
//   - Evitar DOS sincronizaciones simultaneas del mismo proveedor usando un
//     advisory lock de Postgres (se libera solo al cerrar la conexion, asi que
//     es seguro incluso en serverless).
//   - Crear/cerrar las filas de `catalog_sync_runs`.
//
// No hay workers ni colas: si una corrida falla queda registrada y la
// siguiente la reemplaza.
const { Op } = require("sequelize");
const HttpError = require("../../Utils/HttpError.js");
const { createLogger } = require("../../Utils/logger.js");
const {
  sequelize,
  Supplier,
  CatalogSyncRun,
} = require("../../DataBase/models/index.js");
const {
  CATALOG_SYNC_STATUS,
  CATALOG_SYNC_TRIGGER,
} = require("../../DataBase/models/enums.js");

const log = createLogger("catalog.runs");

// Clave del advisory lock por proveedor (una por integracion de catalogo).
const LOCK_KEYS = {
  venndelo: 2147483010,
};

// Una corrida "running" mas vieja que esto se considera abandonada (la funcion
// serverless murio sin poder cerrarla).
const STALE_RUN_MS = 30 * 60 * 1000;

const lockKeyFor = (slug) => LOCK_KEYS[slug] || 2147483099;

const getSupplierRow = async (slug) => {
  const supplier = await Supplier.findOne({
    where: { slug: String(slug || "").trim().toLowerCase() },
  });
  if (!supplier) {
    throw new HttpError(
      404,
      `El proveedor "${slug}" no existe. Ejecuta la migración del catálogo.`,
    );
  }
  return supplier;
};

const findRunning = async (supplierId) =>
  CatalogSyncRun.findOne({
    where: { supplierId, status: CATALOG_SYNC_STATUS.RUNNING },
    order: [["startedAt", "DESC"]],
  });

// Cierra corridas viejas que quedaron "running" (por un deploy o un timeout).
const closeStaleRuns = async (supplierId) => {
  const threshold = new Date(Date.now() - STALE_RUN_MS);
  const [affected] = await CatalogSyncRun.update(
    {
      status: CATALOG_SYNC_STATUS.ERROR,
      finishedAt: new Date(),
      errorSummary: [{ motivo: "Corrida abandonada (timeout del servidor)" }],
    },
    {
      where: {
        supplierId,
        status: CATALOG_SYNC_STATUS.RUNNING,
        startedAt: { [Op.lt]: threshold },
      },
    },
  );
  if (affected > 0) {
    log.warn("Se cerraron corridas de catálogo abandonadas", { supplierId, affected });
  }
  return affected;
};

// Ejecuta `fn` con el lock del proveedor. Si ya hay una corrida en curso
// responde 409 en vez de encolar trabajo (no hay colas).
const withSyncLock = async (slug, fn) => {
  const key = lockKeyFor(slug);
  const connection = await sequelize.connectionManager.getConnection();

  try {
    const result = await connection.query(
      "SELECT pg_try_advisory_lock($1) AS ok",
      [key],
    );
    const acquired = Boolean(result?.rows?.[0]?.ok);

    if (!acquired) {
      throw new HttpError(
        409,
        "Ya hay una sincronización de catálogo en curso. Intenta de nuevo en unos minutos.",
      );
    }

    try {
      return await fn();
    } finally {
      await connection
        .query("SELECT pg_advisory_unlock($1)", [key])
        .catch(() => {});
    }
  } finally {
    sequelize.connectionManager.releaseConnection(connection);
  }
};

// Crea la corrida en estado "running".
const startRun = async ({ supplierId, trigger, triggeredBy = null }) => {
  await closeStaleRuns(supplierId);

  const running = await findRunning(supplierId);
  if (running) {
    throw new HttpError(
      409,
      "Ya hay una sincronización de catálogo en curso. Intenta de nuevo en unos minutos.",
    );
  }

  return CatalogSyncRun.create({
    supplierId,
    trigger: trigger === CATALOG_SYNC_TRIGGER.CRON
      ? CATALOG_SYNC_TRIGGER.CRON
      : CATALOG_SYNC_TRIGGER.MANUAL,
    status: CATALOG_SYNC_STATUS.RUNNING,
    startedAt: new Date(),
    triggeredBy,
  });
};

const finishRun = async (run, patch = {}) => {
  const status = patch.status || CATALOG_SYNC_STATUS.SUCCESS;
  await run.update({
    status,
    finishedAt: new Date(),
    ...patch,
  });
  return run;
};

// Historial paginado para el panel.
const getHistory = async ({ supplierId, limit = 20, offset = 0 } = {}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const { rows, count } = await CatalogSyncRun.findAndCountAll({
    where: { supplierId },
    order: [["startedAt", "DESC"]],
    limit: safeLimit,
    offset: safeOffset,
  });

  return {
    runs: rows.map((run) => run.toJSON()),
    total: count,
    limit: safeLimit,
    offset: safeOffset,
  };
};

// Ultima corrida (para /status).
const getLastRun = async (supplierId) =>
  CatalogSyncRun.findOne({
    where: { supplierId },
    order: [["startedAt", "DESC"]],
  });

module.exports = {
  getSupplierRow,
  withSyncLock,
  startRun,
  finishRun,
  getHistory,
  getLastRun,
  findRunning,
  closeStaleRuns,
};