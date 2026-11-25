// Trabajo periodico del backend.
//
// No hay workers permanentes ni colas (ni Redis, ni BullMQ): Vercel invoca
// este endpoint con un cron y todo lo que falla queda en sync_logs para la
// siguiente corrida.
//
// Orden de la corrida:
//   1. Leer el estado de los proveedores y aplicar cambios (IN).
//   2. Reintentar los envios que fallaron (OUT) — create_order/update_status
//      (Dropi).
//   3. Procesar el outbox de MasterShop y el de Venndelo: crear pedidos en el
//      proveedor que corresponde para pagos Wompi ya aprobados (patron outbox).
//   4. Devolver un resumen para que el log del cron sea util.
//
// El reintento va despues del sync a proposito: si el proveedor ya movio el
// pedido, no tiene sentido empujarle un estado viejo.

const {
  syncIncomingStatuses,
  retryFailedOutbound,
} = require("./syncService.js");
const { processMastershopOutbox } = require("./mastershopOrders.service.js");
const { processVenndeloOutbox } = require("./venndeloOrders.service.js");
const { createLogger } = require("../Utils/logger.js");

const log = createLogger("cron");

const runProviderSync = async ({ limit = 50, retryLimit = 20 } = {}) => {
  const startedAt = Date.now();

  const incoming = await syncIncomingStatuses({ limit });
  const retries = await retryFailedOutbound({ limit: retryLimit });

  // Etapa 3: procesar el outbox de MasterShop (pedidos pendientes de crear
  // tras un pago Wompi aprobado). Es independiente del flujo de
  // Dropi que maneja retryFailedOutbound.
  const mastershopOutbox = await processMastershopOutbox({ limit: retryLimit });
  // Etapa 4: outbox de Venndelo (mismo patron, proveedor distinto).
  const venndeloOutbox = await processVenndeloOutbox({ limit: retryLimit });

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
    mastershopOutbox: {
      processed: mastershopOutbox.processed,
    },
    venndeloOutbox: {
      processed: venndeloOutbox.processed,
    },
  };

  log.info("Corrida de sincronizacion completada", summary);

  return summary;
};

module.exports = { runProviderSync };
