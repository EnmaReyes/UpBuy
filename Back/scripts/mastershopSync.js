// Sincroniza el catalogo de MasterShop (productos + variantes + assets).
//
// Uso (desde Back/):
//   npm run mastershop:sync
//   npm run mastershop:sync -- --report
//
// No inventa un segundo importador: llama al MISMO `runCatalogSync` que usa el
// panel y el cron (`/api/cron/sync-catalog`). La diferencia es que aqui se
// fuerza el proveedor `mastershop` y se puede imprimir el reporte de huecos de
// mapeo al terminar.
//
// Idempotente: correrlo dos veces seguidas deja la base igual (upsert por
// `(supplierId, externalId)` y `(supplierProductId, externalId)`).
const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local"),
  override: true,
});

const { sequelize } = require("../DataBase/db.js");
const { SUPPLIER_SLUG, CATALOG_SYNC_TRIGGER } = require("../DataBase/models/enums.js");

const imprimirReporte = (report) => {
  const lines = [];
  const push = (title, rows) => {
    lines.push(`${title}: ${rows.length}`);
    for (const row of rows.slice(0, 10)) {
      lines.push(`  - ${JSON.stringify(row)}`);
    }
    if (rows.length > 10) lines.push(`  ... y ${rows.length - 10} más`);
  };

  lines.push(`Productos del proveedor: ${report.supplierProducts}`);
  lines.push(`Productos publicados: ${report.publishedProducts}`);
  lines.push(`Variantes: ${report.variations}`);
  push("Publicados sin vínculo al proveedor", report.publishedWithoutVariantLink);
  push("Productos sin variantes", report.supplierProductsWithoutVariations);
  push("Productos ambiguos (se distinguen por color)", report.ambiguousProducts);
  push("SKU duplicados entre variantes", report.duplicateSkus);
  push("Variantes sin stock", report.outOfStockVariations);
  push("Items de pedidos pagados sin resolver", report.unresolvedPaidItems);
  if (report.unknownAttributes.length) {
    lines.push(
      `Atributos no reconocidos: ${report.unknownAttributes.join(", ")}`,
    );
  }

  console.log(lines.join("\n"));
};

const run = async () => {
  const conReporte = process.argv.includes("--report");

  await sequelize.authenticate();

  const { runCatalogSync } = require("../Services/catalog/catalogSync.service.js");
  const { ensureMastershopSchema } = require("../DataBase/ensureMastershopSchema.js");

  // El reporte consulta mastershop_attr_alias: se garantiza el esquema antes.
  await ensureMastershopSchema();

  const result = await runCatalogSync({
    supplierSlug: SUPPLIER_SLUG.MASTERSHOP,
    trigger: CATALOG_SYNC_TRIGGER.MANUAL,
  });

  console.log(
    `✅ Sincronización de MasterShop: ${result.pages ?? "-"} páginas, ` +
      `${result.received ?? "-"} recibidos, ${result.created ?? "-"} nuevos, ` +
      `${result.updated ?? "-"} actualizados, ${result.errors ?? 0} errores.`,
  );

  if (conReporte) {
    const { buildMappingReport } = require("../Services/mastershopMapping.service.js");
    imprimirReporte(await buildMappingReport());
  }
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
