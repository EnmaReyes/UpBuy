/**
 * scripts/check-venndelo.js
 *
 * Verifica de punta a punta la integracion con Venndelo Pro:
 *
 *   1. Renueva el access token por OAuth (refresh_token).
 *   2. Llama a GET /check-auth.
 *   3. Lee la primera pagina del catalogo (paginacion por cursor).
 *
 * Usa exactamente el mismo codigo que la API (integrations/suppliers/venndelo),
 * asi que si esto funciona, la integracion esta bien configurada.
 *
 * Uso:
 *   node scripts/check-venndelo.js [pageSize]
 *
 * No imprime tokens ni credenciales.
 */

const path = require("path");
require("dotenv").config();
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local"), override: true });

const { sequelize, Supplier } = require("../DataBase/models/index.js");
const { getSupplierAdapter } = require("../integrations/suppliers/index.js");

const pageSize = Math.min(Math.max(Number(process.argv[2]) || 3, 1), 20);

(async () => {
  try {
    await sequelize.authenticate();

    const adapter = getSupplierAdapter("venndelo");

    if (!adapter.isConfigured()) {
      console.error(
        "❌ Venndelo no está configurado. Faltan VENNDELO_CLIENT_ID / VENNDELO_CLIENT_SECRET / VENNDELO_REFRESH_TOKEN en .env.local",
      );
      process.exitCode = 1;
      return;
    }

    const supplier = await Supplier.findOne({ where: { slug: "venndelo" } });

    const auth = await adapter.client.checkAuth(supplier);
    console.log(`✅ Autenticación OK: ${auth?.message || "(sin mensaje)"}`);

    const status = adapter.auth.getStatus(supplier);
    console.log(
      `   Token en caché hasta: ${
        status.accessTokenExpiresAt
          ? new Date(status.accessTokenExpiresAt).toISOString()
          : "—"
      }`,
    );

    const page = await adapter.catalog.listPage(supplier, {
      pageSize,
      filters: { supplyModel: "ANY" },
    });

    console.log(
      `✅ Catálogo OK: ${page.items.length} producto(s) en la primera página (hay más: ${
        page.nextPageToken ? "sí" : "no"
      })`,
    );

    for (const item of page.items) {
      console.log(
        `   - ${String(item.name || "").slice(0, 50)} | id=${item.id} | variaciones=${
          Array.isArray(item.variations) ? item.variations.length : 0
        } | assets=${Array.isArray(item.assets) ? item.assets.length : 0}`,
      );
    }

    console.log("\n✅ Integración Venndelo verificada");
  } catch (error) {
    console.error("❌ Error:", error.status ? `HTTP ${error.status}` : "", error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
})();