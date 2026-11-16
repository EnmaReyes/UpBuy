/**
 * scripts/seedHomeSections.js
 *
 * Siembra por defecto la seccion "favoritos" de la portada mientras la tienda
 * todavia no tiene ventas. Es idempotente y nunca pisa curaduria manual:
 *
 *   - Solo rellena ranuras libres (1..4) de la seccion.
 *   - Las filas que escribe quedan con `source = 'default'`.
 *   - Las filas `manual` del panel se respetan tal cual.
 *
 * Candidatos (solo productos publicados: status=active AND active=true):
 *   1. los marcados `destacadas = true`;
 *   2. los mas recientes por `publishedAt` (o `createdAt` si falta);
 *   3. los de mayor stock.
 *
 * Uso:
 *   node scripts/seedHomeSections.js
 *   node scripts/seedHomeSections.js --section=favoritos --limit=4
 *   node scripts/seedHomeSections.js --dry-run
 */
const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local"),
  override: true,
});

const { sequelize, ProductHomeSection } = require(
  "../DataBase/models/index.js",
);
const { ensureCatalogSchema } = require("../DataBase/ensureCatalogSchema.js");
const {
  PRODUCT_STATUS,
  HOME_SECTION,
  HOME_SECTION_VALUES,
} = require("../DataBase/models/enums.js");
const { createLogger } = require("../Utils/logger.js");

const log = createLogger("seed.home");
const MAX_SLOTS = 4;
const DEFAULT_SECTION = HOME_SECTION.FAVORITES;

const parseArgs = (argv) => {
  const options = {
    section: DEFAULT_SECTION,
    limit: MAX_SLOTS,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    const [rawKey, rawValue] = arg.replace(/^--/, "").split("=");
    if (rawKey === "section" && rawValue) options.section = rawValue;
    if (rawKey === "limit" && rawValue) {
      options.limit = Number(rawValue);
    }
  }

  return options;
};

const normalizeOptions = (options) => {
  const section = String(options.section || "").trim();
  if (!HOME_SECTION_VALUES.includes(section)) {
    throw new Error(
      `Seccion invalida: "${section}". Usa una de: ${HOME_SECTION_VALUES.join(", ")}`,
    );
  }

  const limit = Math.min(
    Math.max(Math.trunc(Number(options.limit) || MAX_SLOTS), 1),
    MAX_SLOTS,
  );

  return { section, limit, dryRun: Boolean(options.dryRun) };
};

// Productos publicados con la prioridad de la semilla.
const loadCandidates = async () => {
  const [rows] = await sequelize.query(
    `SELECT id
       FROM products
      WHERE status = :status
        AND active = true
      ORDER BY destacadas DESC,
               COALESCE("publishedAt", "createdAt") DESC,
               stock DESC,
               "createdAt" DESC
      LIMIT 200`,
    {
      replacements: { status: PRODUCT_STATUS.ACTIVE },
    },
  );

  return rows.map((row) => row.id);
};

const seed = async ({ section, limit, dryRun }) => {
  await ensureCatalogSchema();

  const rows = await ProductHomeSection.findAll({
    where: { section },
    order: [["position", "ASC"]],
  });

  const manual = rows.filter((row) => row.source === "manual");
  const defaults = rows.filter((row) => row.source !== "manual");

  const occupiedPositions = new Set(rows.map((row) => row.position));
  const existingProductIds = new Set(rows.map((row) => row.productId));

  const freePositions = [];
  for (let position = 1; position <= limit; position += 1) {
    if (!occupiedPositions.has(position)) freePositions.push(position);
  }

  log.info("Estado de la seccion", {
    section,
    manual: manual.length,
    default: defaults.length,
    freePositions,
    dryRun,
  });

  if (freePositions.length === 0) {
    log.info("La seccion ya esta completa; no hay nada que sembrar", {
      section,
    });
    return { added: [], skipped: 0, reason: "full" };
  }

  const candidates = await loadCandidates();
  const chosen = [];
  let skipped = 0;

  for (const productId of candidates) {
    if (chosen.length >= freePositions.length) break;
    if (existingProductIds.has(productId)) {
      skipped += 1;
      continue;
    }
    chosen.push(productId);
    existingProductIds.add(productId);
  }

  if (chosen.length === 0) {
    log.warn("No hay productos publicados para sembrar", { section });
    return { added: [], skipped, reason: "no_candidates" };
  }

  if (chosen.length < freePositions.length) {
    log.warn("No alcanzan los candidatos para llenar la seccion", {
      section,
      needed: freePositions.length,
      available: chosen.length,
    });
  }

  const planned = chosen.map((productId, index) => ({
    productId,
    section,
    position: freePositions[index],
    source: "default",
  }));

  if (dryRun) {
    log.info("Dry run: no se escribe nada", { planned });
    return { added: planned, skipped, reason: "dry_run" };
  }

  await sequelize.transaction(async (transaction) => {
    await ProductHomeSection.bulkCreate(planned, { transaction });
  });

  log.info("Semilla aplicada", {
    section,
    added: planned.length,
    positions: planned.map((row) => row.position),
    skipped,
  });

  return { added: planned, skipped, reason: "seeded" };
};

(async () => {
  try {
    const options = normalizeOptions(parseArgs(process.argv.slice(2)));
    await sequelize.authenticate();
    await seed(options);
  } catch (error) {
    log.error("No se pudo sembrar la portada", {
      message: error.message,
    });
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
})();
