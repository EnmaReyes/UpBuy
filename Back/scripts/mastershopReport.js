// Reporte de huecos de mapeo MasterShop (solo lectura).
//
// Uso (desde Back/):
//   npm run mastershop:report
//   npm run mastershop:report -- --json   # salida completa en JSON
//
// Responde "¿que items de un pedido pagado no puedo convertir en
// id_product/id_variant?" sin tocar nada. Es la vista de diagnostico de la
// Fase 1 y la que se corre antes de habilitar la creacion automatica.
const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local"),
  override: true,
});

const { sequelize } = require("../DataBase/db.js");

const run = async () => {
  await sequelize.authenticate();

  const { buildMappingReport } = require("../Services/mastershopMapping.service.js");
  const report = await buildMappingReport();

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const lines = [];
  const push = (title, rows) => {
    lines.push(`${title}: ${rows.length}`);
    for (const row of rows) {
      lines.push(`  - ${JSON.stringify(row)}`);
    }
  };

  lines.push(`Fecha: ${report.generatedAt}`);
  lines.push(`Productos del proveedor: ${report.supplierProducts}`);
  lines.push(`Productos publicados: ${report.publishedProducts}`);
  lines.push(`Variantes: ${report.variations}`);
  push("Publicados sin vínculo al proveedor", report.publishedWithoutVariantLink);
  push("Productos sin variantes", report.supplierProductsWithoutVariations);
  push("Productos ambiguos (se distinguen por color)", report.ambiguousProducts);
  push("SKU duplicados entre variantes", report.duplicateSkus);
  push("Variantes sin stock", report.outOfStockVariations);
  push("Items de pedidos pagados sin resolver", report.unresolvedPaidItems);
  lines.push(
    `Atributos no reconocidos: ${
      report.unknownAttributes.length ? report.unknownAttributes.join(", ") : "ninguno"
    }`,
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
