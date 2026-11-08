// Trabajo periodico del backend.
//
// No hay workers permanentes ni colas (ni Redis, ni BullMQ): Vercel invoca
// este endpoint con un cron y todo lo que falla queda en sync_logs para la
// siguiente corrida.
//
// Orden de la corrida:
//   1. Leer el estado de los proveedores y aplicar cambios (IN).
//   2. Reintentar los envios que fallaron (OUT) — create_order/update_status.
//   3. Devolver un resumen para que el log del cron sea util.
//
// El reintento va despues del sync a proposito: si el proveedor ya movio el
// pedido, no tiene sentido empujarle un estado viejo.

const {
  syncIncomingStatuses,
  retryFailedOutbound,
} = require("./syncService.js");
const { createLogger } = require("../Utils/logger.js");

const log = createLogger("cron");

const runProviderSync = async ({ limit = 50, retryLimit = 20 } = {}) => {
  const startedAt = Date.now();

  const incoming = await syncIncomingStatuses({ limit });
  const retries = await retryFailedOutbound({ limit: retryLimit });

  const summary = {
    ok: true,
    durationMs: Date.now() - startedAt,
    incoming: {
      total: incoming.total,
      synced: incoming.synced,
      skipped: incoming.skipped,
      failed: incoming.failed,
    },
    retries: {
      attempted: retries.attempted,
    },
  };

  log.info("Corrida de sincronizacion completada", summary);

  return summary;
};

module.exports = { runProviderSync };
