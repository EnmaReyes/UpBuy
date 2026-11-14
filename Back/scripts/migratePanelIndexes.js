// Corre los indices del panel (ADM-10) a mano en produccion. Idempotente.
require("../config.js");
const { ensurePanelIndexes } = require("../DataBase/ensurePanelIndexes.js");

ensurePanelIndexes()
  .then((result) => {
    console.log(
      result.migrated
        ? `✅ Indices creados: ${result.created}`
        : "✅ Indices ya al dia",
    );
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error aplicando indices:", error.message);
    process.exit(1);
  });
