// Fachada de la integracion Venndelo para el panel de administracion.
//
// Une el adaptador (integrations/suppliers/venndelo) con los servicios de
// catalogo y con la base de datos. El controlador solo llama estos metodos.
const { Op } = require("sequelize");
const {
  Product,
  SupplierProduct,
  SupplierProductVariation,
  SupplierProductAsset,
  SupplierCredential,
} = require("../../DataBase/models/index.js");
const { CATALOG_SYNC_TRIGGER } = require("../../DataBase/models/enums.js");
const { getSupplierAdapter, SUPPLIER_SLUG } = require("../../integrations/suppliers/index.js");
const runs = require("../catalog/catalogRuns.service.js");
const {
  runCatalogSync,
  publishSupplierProduct,
  unpublishProduct,
} = require("../catalog/catalogSync.service.js");
const catalogQuery = require("../catalog/catalogQuery.service.js");
const credentials = require("../../integrations/suppliers/credentials.js");
const HttpError = require("../../Utils/HttpError.js");

const SLUG = SUPPLIER_SLUG.VENNDELO;

const countPublished = async (supplierId) =>
  Product.count({ where: { supplierId } });

// GET /status: nada de secretos, solo "hay/no hay" y fechas.
const getStatus = async () => {
  const supplier = await runs.getSupplierRow(SLUG);
  const adapter = getSupplierAdapter(SLUG);
  const authStatus = adapter.auth.getStatus(supplier);
  const lastRun = await runs.getLastRun(supplier.id);

  let credentialRow = null;
  try {
    credentialRow = await SupplierCredential.findOne({
      where: { supplierId: supplier.id },
    });
  } catch {
    credentialRow = null;
  }

  const [catalogCount, publishedCount] = await Promise.all([
    SupplierProduct.count({ where: { supplierId: supplier.id } }),
    countPublished(supplier.id),
  ]);

  return {
    supplier: {
      slug: supplier.slug,
      name: supplier.name,
      isActive: supplier.isActive,
      baseUrl: supplier.baseUrl,
    },
    configured: adapter.isConfigured(),
    token: {
      cached: authStatus.cached,
      expiresAt: authStatus.accessTokenExpiresAt,
    },
    credentials: {
      persisted: Boolean(credentialRow),
      refreshTokenRotatedAt: credentialRow?.lastRotatedAt || null,
      refreshTokenExpiresAt: credentialRow?.refreshTokenExpiresAt || null,
      encryptionConfigured: credentials.isConfigured(),
    },
    catalog: {
      supplierProducts: catalogCount,
      publishedProducts: publishedCount,
    },
    lastRun: lastRun ? lastRun.toJSON() : null,
  };
};

// POST /test-connection: renueva el token y llama a /check-auth.
const testConnection = async () => {
  const supplier = await runs.getSupplierRow(SLUG);
  const adapter = getSupplierAdapter(SLUG);

  if (!adapter.isConfigured()) {
    throw new HttpError(
      503,
      "Venndelo no está configurado (faltan VENNDELO_CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN)",
    );
  }

  const startedAt = Date.now();
  const response = await adapter.client.checkAuth(supplier);
  const authStatus = adapter.auth.getStatus(supplier);

  return {
    ok: true,
    latencyMs: Date.now() - startedAt,
    message: response?.message || "Autenticación correcta",
    tokenExpiresAt: authStatus.accessTokenExpiresAt,
  };
};

// GET /products: SIEMPRE desde PostgreSQL (no golpea a Venndelo).
const listStoredProducts = async ({
  q,
  availability,
  page = 1,
  limit = 20,
} = {}) => {
  const supplier = await runs.getSupplierRow(SLUG);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);

  const where = { supplierId: supplier.id };

  const search = String(q || "").trim();
  if (search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { externalId: { [Op.iLike]: `%${search}%` } },
    ];
  }
  if (availability === "true" || availability === true) {
    where.availability = true;
  } else if (availability === "false" || availability === false) {
    where.availability = false;
  }

  const { rows, count } = await SupplierProduct.findAndCountAll({
    where,
    include: [
      { model: SupplierProductVariation, as: "variations" },
      { model: SupplierProductAsset, as: "assets" },
    ],
    order: [["updatedAt", "DESC"]],
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
    distinct: true,
  });

  // Trae el producto publicado (si existe) para cada fila.
  const ids = rows.map((row) => row.id);
  const published = ids.length
    ? await Product.findAll({
        where: { supplierProductId: { [Op.in]: ids } },
        attributes: [
          "id",
          "supplierProductId",
          "sku",
          "slug",
          "price",
          "status",
          "active",
        ],
      })
    : [];
  const publishedBySupplierProduct = new Map(
    published.map((product) => [product.supplierProductId, product.toJSON()]),
  );

  return {
    products: rows.map((row) => {
      const json = row.toJSON();
      json.assets = (json.assets || []).sort((a, b) => a.position - b.position);
      json.published = publishedBySupplierProduct.get(row.id) || null;
      return json;
    }),
    total: count,
    page: safePage,
    limit: safeLimit,
  };
};

// GET /products/:id — acepta UUID interno o externalId de Venndelo.
const getStoredProduct = async (id) => {
  const supplier = await runs.getSupplierRow(SLUG);

  const where = { supplierId: supplier.id };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    where.id = id;
  } else {
    where.externalId = String(id);
  }

  const row = await SupplierProduct.findOne({
    where,
    include: [
      { model: SupplierProductVariation, as: "variations" },
      { model: SupplierProductAsset, as: "assets" },
    ],
  });

  if (!row) {
    throw new HttpError(404, "Producto del proveedor no encontrado");
  }

  const json = row.toJSON();
  json.assets = (json.assets || []).sort((a, b) => a.position - b.position);
  json.published = await Product.findOne({
    where: { supplierProductId: row.id },
  });

  return json;
};

// POST /sync
const sync = async ({ trigger = CATALOG_SYNC_TRIGGER.MANUAL, triggeredBy = null, pageSize } = {}) =>
  runCatalogSync({ supplierSlug: SLUG, trigger, triggeredBy, pageSize });

// POST /publish
const publish = async ({ supplierProductId, categoryIds, price, markup, actorUserId }) => {
  const supplier = await runs.getSupplierRow(SLUG);
  const supplierProduct = await SupplierProduct.findOne({
    where: { id: supplierProductId, supplierId: supplier.id },
  });
  if (!supplierProduct) {
    throw new HttpError(404, "Producto del proveedor no encontrado");
  }

  const published = await publishSupplierProduct({
    supplierProductId,
    categoryIds,
    price,
    markup,
    actorUserId,
  });

  // Se devuelve la forma administrativa completa (categorias/galeria).
  return catalogQuery.getAdmin(published.id);
};

// Acepta el id del producto del proveedor (el que usa el panel) y resuelve el
// producto publicado equivalente.
const unpublish = async ({ supplierProductId, productId }) => {
  let targetId = productId;

  if (!targetId && supplierProductId) {
    const product = await Product.findOne({
      where: { supplierProductId },
    });
    if (!product) {
      throw new HttpError(404, "El producto no está publicado");
    }
    targetId = product.id;
  }

  if (!targetId) {
    throw new HttpError(400, "Falta el producto a despublicar");
  }

  return unpublishProduct({ productId: targetId });
};

// GET /sync-history
const getSyncHistory = async ({ limit, offset } = {}) => {
  const supplier = await runs.getSupplierRow(SLUG);
  return runs.getHistory({ supplierId: supplier.id, limit, offset });
};

module.exports = {
  SLUG,
  getStatus,
  testConnection,
  listStoredProducts,
  getStoredProduct,
  sync,
  publish,
  unpublish,
  getSyncHistory,
};