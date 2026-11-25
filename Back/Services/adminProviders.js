// Salud y contadores de proveedores para el panel (ADM-4).
//
// Este servicio solo LEE. Reutiliza:
//   - `Services/providers/index.js` para los proveedores de pedidos (Dropi).
//   - `integrations/suppliers` + `suppliers` para el catalogo (Venndelo Pro,
//     con doble N).
//
// Nunca devuelve estados crudos del proveedor: la UI recibe etiquetas
// canonicas (FULFILLMENT_LABELS / PAYMENT_LABELS) y contadores.
const { Op, fn, col } = require("sequelize");
const {
  Order,
  Supplier,
  SupplierProduct,
  Product,
  SyncLog,
  CatalogSyncRun,
} = require("../DataBase/models/index.js");
const { listProviders } = require("./providers/index.js");
const { listSupplierAdapters } = require("../integrations/suppliers/index.js");

const HEALTH_DAYS = 14;
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const PROVIDER_LABELS = {
  dropi: "Dropi",
  venndelo: "Venndelo Pro",
};

// Slugs del catalogo que se consideran "Pro" (integracion con API).
const CATALOG_LABELS = {
  venndelo: "Venndelo Pro (catálogo)",
  mastershop: "MasterShop (catálogo)",
  dropi: "Dropi (catálogo)",
};

const bogotaDayKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() - BOGOTA_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
};

const dayKeysEndingAt = (endDate, days) => {
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(end)) return [];
  return Array.from({ length: days }, (_, index) =>
    new Date(end - (days - 1 - index) * DAY_MS).toISOString().slice(0, 10),
  );
};

const formatTime = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "00:00";
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Bogota",
  }).format(date);
};

// Convierte una lista de eventos (sync_logs o catalog_sync_runs) en la forma
// que espera el componente Uptime Card: dias con incidentes + dias sin datos
// al inicio de la ventana.
const buildHealthService = ({ name, label, events = [], days = HEALTH_DAYS, endDate }) => {
  const keys = dayKeysEndingAt(endDate, days);
  const buckets = new Map(
    keys.map((key) => [key, { total: 0, failures: 0, lastError: null, lastFailAt: null }]),
  );

  for (const event of events) {
    const key = bogotaDayKey(event.createdAt || event.startedAt);
    const bucket = key ? buckets.get(key) : null;
    if (!bucket) continue;

    bucket.total += 1;
    if (event.ok === false) {
      bucket.failures += 1;
      if (event.error) bucket.lastError = String(event.error).slice(0, 160);
      const at = event.createdAt || event.startedAt;
      if (!bucket.lastFailAt || new Date(at) > new Date(bucket.lastFailAt)) {
        bucket.lastFailAt = at;
      }
    }
  }

  const firstActive = keys.findIndex((key) => buckets.get(key).total > 0);
  const missing = firstActive === -1 ? days : firstActive;

  const incidents = {};
  let failures = 0;
  let totalEvents = 0;

  keys.forEach((key, index) => {
    const bucket = buckets.get(key);
    totalEvents += bucket.total;
    failures += bucket.failures;
    if (index < missing || bucket.total === 0 || bucket.failures === 0) return;

    // Un dia con fallos parciales queda "degradado"; si fallaron todos los
    // intentos registrados, es una caida.
    const status = bucket.failures >= bucket.total ? "down" : "degraded";
    incidents[index] = {
      title:
        bucket.failures === 1
          ? "1 sincronización falló"
          : `${bucket.failures} sincronizaciones fallaron`,
      status,
      // Aproximacion: cada fallo cuenta como 5 minutos de impacto.
      minutes: bucket.failures * 5,
      updates: [
        {
          time: bucket.lastFailAt ? formatTime(bucket.lastFailAt) : "00:00",
          label: "Falló la sincronización",
          note: bucket.lastError || "El proveedor no respondió.",
        },
      ],
    };
  });

  return {
    name,
    label: label || name,
    incidents,
    missing,
    days,
    totalEvents,
    failures,
  };
};

// Ultima corrida del catalogo por proveedor.
const getCatalogProviders = async () => {
  const adapters = listSupplierAdapters();
  const configuredBySlug = new Map(adapters.map((adapter) => [adapter.slug, adapter.configured]));

  const rows = await Supplier.findAll({ order: [["name", "ASC"]] });
  if (rows.length === 0) return [];

  const supplierIds = rows.map((row) => row.id);

  const [productCounts, publishedCounts, runs] = await Promise.all([
    SupplierProduct.findAll({
      attributes: ["supplierId", [fn("COUNT", col("id")), "n"]],
      where: { supplierId: { [Op.in]: supplierIds } },
      group: ["supplierId"],
      raw: true,
    }),
    Product.findAll({
      attributes: ["supplierId", [fn("COUNT", col("id")), "n"]],
      where: { supplierId: { [Op.in]: supplierIds } },
      group: ["supplierId"],
      raw: true,
    }),
    CatalogSyncRun.findAll({
      where: { supplierId: { [Op.in]: supplierIds } },
      order: [["startedAt", "DESC"]],
    }),
  ]);

  const productBySupplier = new Map(
    productCounts.map((row) => [row.supplierId, Number(row.n) || 0]),
  );
  const publishedBySupplier = new Map(
    publishedCounts.map((row) => [row.supplierId, Number(row.n) || 0]),
  );
  const lastRunBySupplier = new Map();
  for (const run of runs) {
    if (!lastRunBySupplier.has(run.supplierId)) {
      lastRunBySupplier.set(run.supplierId, run);
    }
  }

  return rows.map((row) => {
    const lastRun = lastRunBySupplier.get(row.id) || null;
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      label: CATALOG_LABELS[row.slug] || row.name,
      isActive: Boolean(row.isActive),
      configured: configuredBySlug.get(row.slug) ?? false,
      supplierProducts: productBySupplier.get(row.id) || 0,
      publishedProducts: publishedBySupplier.get(row.id) || 0,
      lastActivityAt: lastRun?.finishedAt || lastRun?.startedAt || null,
      lastRun: lastRun ? serializeRun(lastRun) : null,
    };
  });
};

const serializeRun = (run) => {
  const data = typeof run.toJSON === "function" ? run.toJSON() : run;
  return {
    id: data.id,
    trigger: data.trigger,
    status: data.status,
    startedAt: data.startedAt,
    finishedAt: data.finishedAt,
    received: data.received,
    created: data.created,
    updated: data.updated,
    unchanged: data.unchanged,
    errors: data.errors,
    publishedCreated: data.publishedCreated ?? 0,
    publishedUpdated: data.publishedUpdated ?? 0,
    hidden: data.hidden ?? 0,
    skipped: data.skipped ?? 0,
    errorSummary: data.errorSummary || [],
  };
};

// Proveedores de pedidos (Dropi): configuracion + contadores.
const getOrderProviders = async () => {
  const providers = listProviders();

  const results = await Promise.all(
    providers.map(async (provider) => {
      const [totalOrders, outOfSyncOrders, lastSync] = await Promise.all([
        Order.count({ where: { provider: provider.name } }),
        Order.count({
          where: { provider: provider.name, providerOutOfSync: true },
        }),
        SyncLog.findOne({
          where: { provider: provider.name },
          order: [["createdAt", "DESC"]],
        }),
      ]);

      const mode =
        provider.configured && provider.modes.includes("api") ? "api" : "manual";

      return {
        ...provider,
        label: PROVIDER_LABELS[provider.name] || provider.name,
        mode,
        totalOrders,
        outOfSyncOrders,
        lastActivityAt: lastSync?.createdAt || null,
        lastSyncOk: lastSync ? Boolean(lastSync.ok) : null,
        lastSyncError: lastSync?.error || null,
      };
    }),
  );

  return results;
};

const getHealth = async ({ catalogProviders, orderProviders } = {}) => {
  const endDate = bogotaDayKey(new Date());
  const since = new Date(Date.now() - HEALTH_DAYS * DAY_MS);

  const orderNames = (orderProviders || []).map((provider) => provider.name);
  const catalogSlugs = (catalogProviders || []).map((provider) => provider.slug);

  const [syncLogs, catalogRuns] = await Promise.all([
    orderNames.length
      ? SyncLog.findAll({
          where: {
            provider: { [Op.in]: orderNames },
            createdAt: { [Op.gte]: since },
          },
          order: [["createdAt", "ASC"]],
        })
      : [],
    catalogSlugs.length
      ? CatalogSyncRun.findAll({
          where: { startedAt: { [Op.gte]: since } },
          order: [["startedAt", "ASC"]],
          include: [{ model: Supplier, as: "supplier" }],
        })
      : [],
  ]);

  const services = [];

  for (const provider of orderProviders || []) {
    services.push(
      buildHealthService({
        name: provider.label,
        label: `Sincronización de pedidos · ${provider.label}`,
        days: HEALTH_DAYS,
        endDate,
        events: syncLogs.filter((log) => log.provider === provider.name),
      }),
    );
  }

  for (const provider of catalogProviders || []) {
    const supplierId = provider.id;
    services.push(
      buildHealthService({
        name: provider.label,
        label: `Sincronización de catálogo · ${provider.label}`,
        days: HEALTH_DAYS,
        endDate,
        events: catalogRuns
          .filter((run) => run.supplierId === supplierId)
          .map((run) => ({
            startedAt: run.startedAt,
            ok: run.status !== "error",
            error: run.errorSummary?.[0]?.motivo || null,
          })),
      }),
    );
  }

  return { days: HEALTH_DAYS, endDate, services };
};

const getOverview = async () => {
  const [catalogProviders, orderProviders] = await Promise.all([
    getCatalogProviders(),
    getOrderProviders(),
  ]);

  const health = await getHealth({ catalogProviders, orderProviders });

  const outOfSync = orderProviders.reduce(
    (sum, provider) => sum + provider.outOfSyncOrders,
    0,
  );

  return {
    generatedAt: new Date().toISOString(),
    catalogProviders,
    orderProviders,
    outOfSync,
    health,
  };
};

module.exports = {
  HEALTH_DAYS,
  PROVIDER_LABELS,
  CATALOG_LABELS,
  buildHealthService,
  getOverview,
};
