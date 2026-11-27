// Conciliacion UpBuy <-> MasterShop (Fase 5).
//
// Uso (desde Back/):
//   npm run reconcile:mastershop              # solo base local (sin red)
//   npm run reconcile:mastershop -- --remote  # ademas consulta MasterShop
//   npm run reconcile:mastershop -- --json    # salida completa en JSON
//
// Detecta los desajustes entre un pago aprobado en Wompi y el pedido en
// MasterShop. Es de SOLO LECTURA: no crea ni corrige nada por su cuenta. Para
// reintentar un pedido fallido esta el outbox + cron (o el boton del panel).
const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local"),
  override: true,
});

const { sequelize } = require("../DataBase/db.js");

const run = async () => {
  await sequelize.authenticate();

  const { buildReconciliationReport } = require("../Services/mastershopOrders.service.js");
  const includeRemote = process.argv.includes("--remote");
  const report = await buildReconciliationReport({ includeRemote });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const lines = [];
  const push = (title, rows, format = (r) => JSON.stringify(r)) => {
    lines.push(`${title}: ${rows.length}`);
    for (const row of rows) {
      lines.push(`  - ${format(row)}`);
    }
  };

  lines.push(`Fecha: ${report.generatedAt}`);
  lines.push(`Consulta remota: ${report.includeRemote ? "si" : "no (--remote para activarla)"}`);
  push(
    "Pagos aprobados SIN pedido en MasterShop",
    report.approvedWithoutMsOrder,
    (r) => `${r.orderNumber} (ref ${r.reference}, estado ${r.msSyncState || "sin enviar"})`,
  );
  push(
    "Pedidos en estado failed",
    report.failedOrders,
    (r) => `${r.orderNumber}${r.msSyncError ? ` — ${r.msSyncError}` : ""}`,
  );
  push(
    "Pedidos en needs_review",
    report.needsReviewOrders,
    (r) => `${r.orderNumber}${r.msSyncError ? ` — ${r.msSyncError}` : ""}`,
  );
  push(
    "Cancelaciones sin confirmar en MasterShop",
    report.pendingCancellations || [],
    (r) =>
      `${r.orderNumber} (idOrder ${r.msIdOrder}, ${r.msCancelState}, intentos ${r.msCancelAttempts})`,
  );
  push(
    "Outbox atascado (>1 h sin avanzar)",
    report.stuckOutbox,
    (r) => `orden ${r.orderId} — ${r.status} (intentos ${r.attempts})`,
  );

  if (report.includeRemote) {
    if (report.remoteError) {
      lines.push(`⚠️  Consulta remota fallo: ${report.remoteError}`);
    } else {
      push(
        "Pedidos en MasterShop SIN pago local",
        report.remoteWithoutLocal,
        (r) => `${r.externalOrderId} (idOrder ${r.msIdOrder}, estado ${r.status})`,
      );
      push(
        "msStatus desincronizado",
        report.msStatusMismatch,
        (r) => `${r.orderNumber}: local "${r.localStatus}" vs remoto "${r.remoteStatus}"`,
      );
    }
  }

  const total =
    report.approvedWithoutMsOrder.length +
    report.failedOrders.length +
    report.needsReviewOrders.length +
    (report.pendingCancellations || []).length +
    report.stuckOutbox.length;

  lines.push("");
  lines.push(
    total === 0
      ? "✅ Sin desajustes locales."
      : `⚠️  ${total} desajuste(s) local(es) requieren atencion.`,
  );

  console.log(lines.join("\n"));
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
