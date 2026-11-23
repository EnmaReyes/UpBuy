// Fabrica de la fachada de un proveedor de CATALOGO para el panel.
//
// Une el adaptador (integrations/suppliers/<slug>) con los servicios de
// catalogo y con la base de datos. El controlador solo llama estos metodos.
//
// Cada adaptador expone el mismo contrato (ver integrations/suppliers/index.js),
// asi que la unica diferencia entre proveedores son los textos y si guardan
// credenciales rotables (Venndelo) o solo una llave estatica en el entorno
// (MasterShop).
const { Op, literal } = require("sequelize");
const {
  Product,
  Category,
  SupplierProduct,
  SupplierProductVariation,
  SupplierProductAsset,
  SupplierCredential,
} = require("../../DataBase/models/index.js");
const {
  CATALOG_SYNC_TRIGGER,
  PUBLISH_POLICY_VALUES,
} = require("../../DataBase/models/enums.js");
const { getSupplierAdapter } = require("../../integrations/suppliers/index.js");
const runs = require("../catalog/catalogRuns.service.js");
const {
  runCatalogSync,
  publishSupplierProduct,
  unpublishProduct,
} = require("../catalog/catalogSync.service.js");
const catalogQuery = require("../catalog/catalogQuery.service.js");
const credentials = require("../../integrations/suppliers/credentials.js");
const HttpError = require("../../Utils/HttpError.js");

const MAX_BULK_PUBLISH = 50;

const createCatalogSupplierService = ({
  slug,
  providerName,
  // Venndelo rota un refresh token y lo persiste; MasterShop no.
  trackCredentials = false,
  notConfiguredMessage = `${providerName} no está configurado (faltan credenciales)`,
  connectionMessage = "Conexión correcta",
} = {}) => {
  if (!slug) throw new Error("createCatalogSupplierService requiere un slug");

  const countPublished = async (supplierId) =>
    Product.count({ where: { supplierId } });

  // GET /status: nada de secretos, solo "hay/no hay" y fechas.
  const getStatus = async () => {
    const supplier = await runs.getSupplierRow(slug);
    const adapter = getSupplierAdapter(slug);
    const authStatus = adapter.auth.getStatus(supplier);
    const lastRun = await runs.getLastRun(supplier.id);

    const [catalogCount, publishedCount] = await Promise.all([
      SupplierProduct.count({ where: { supplierId: supplier.id } }),
      countPublished(supplier.id),
    ]);

    let credentialRow = null;
    if (trackCredentials) {
      try {
        credentialRow = await SupplierCredential.findOne({
          where: { supplierId: supplier.id },
        });
      } catch {
        credentialRow = null;
      }
    }

    const credentialsBlock = trackCredentials
      ? {
          persisted: Boolean(credentialRow),
          refreshTokenRotatedAt: credentialRow?.lastRotatedAt || null,
          refreshTokenExpiresAt: credentialRow?.refreshTokenExpiresAt || null,
          encryptionConfigured: credentials.isConfigured(),
        }
      : null;

    return {
      supplier: {
        slug: supplier.slug,
        name: supplier.name,
        isActive: supplier.isActive,
        baseUrl: supplier.baseUrl,
        publishPolicy: supplier.publishPolicy || "manual",
        defaultCategoryId: supplier.defaultCategoryId || null,
      },
      configured: adapter.isConfigured(),
      token: {
        cached: Boolean(authStatus?.cached),
        expiresAt: authStatus?.accessTokenExpiresAt || null,
      },
      // Solo cuando el proveedor guarda credenciales rotables. Nunca se
      // devuelve el valor de ningun token.
      ...(credentialsBlock ? { credentials: credentialsBlock } : {}),
      catalog: {
        supplierProducts: catalogCount,
        publishedProducts: publishedCount,
      },
      lastRun: lastRun ? lastRun.toJSON() : null,
    };
  };

  // POST /test-connection: llama al endpoint mas barato del proveedor.
  const testConnection = async () => {
    const supplier = await runs.getSupplierRow(slug);
    const adapter = getSupplierAdapter(slug);

    if (!adapter.isConfigured()) {
      throw new HttpError(503, notConfiguredMessage);
    }

    const startedAt = Date.now();
    const response = await adapter.client.checkAuth(supplier);
    const authStatus = adapter.auth.getStatus(supplier);

    const result = {
      ok: true,
      latencyMs: Date.now() - startedAt,
      message: response?.message || connectionMessage,
    };

    if (trackCredentials) {
      result.tokenExpiresAt = authStatus?.accessTokenExpiresAt || null;
    }
    // Datos utiles sin secretos: cuantos productos ve la llave y como va el
    // limite de uso (solo lo devuelve MasterShop).
    if (response?.totalProducts !== undefined) {
      result.totalProducts = response.totalProducts;
    }
    if (response?.rateLimit) {
      result.rateLimit = response.rateLimit;
    }

    return result;
  };

  // GET /products: SIEMPRE desde PostgreSQL (no golpea al proveedor).
  const listStoredProducts = async ({
    q,
    availability,
    published,
    page = 1,
    limit = 20,
  } = {}) => {
    const supplier = await runs.getSupplierRow(slug);
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

    // published=0 => bandeja del proveedor (aun sin fila en `products`).
    // published=1 => ya promovidos al catalogo UPBUY.
    if (published !== undefined && published !== "") {
      const flag =
        published === true ||
        String(published) === "1" ||
        String(published) === "true";
      const exists = `EXISTS (
        SELECT 1 FROM products p
         WHERE p."supplierProductId" = "SupplierProduct"."id"
      )`;
      where[Op.and] = [literal(flag ? exists : `NOT ${exists}`)];
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
    const publishedRows = ids.length
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
      publishedRows.map((product) => [
        product.supplierProductId,
        product.toJSON(),
      ]),
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

  // GET /products/:id — acepta UUID interno o el id externo del proveedor.
  const getStoredProduct = async (id) => {
    const supplier = await runs.getSupplierRow(slug);

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
  const sync = async ({
    trigger = CATALOG_SYNC_TRIGGER.MANUAL,
    triggeredBy = null,
    pageSize,
  } = {}) => runCatalogSync({ supplierSlug: slug, trigger, triggeredBy, pageSize });

  // POST /publish
  const publish = async ({
    supplierProductId,
    categoryIds,
    price,
    markup,
    visibility,
    actorUserId,
  }) => {
    const supplier = await runs.getSupplierRow(slug);
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
      visibility,
      actorUserId,
    });

    // Se devuelve la forma administrativa completa (categorias/galeria).
    return catalogQuery.getAdmin(published.id);
  };

  // Acepta el id del producto del proveedor (el que usa el panel) y resuelve
  // el producto publicado equivalente.
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

  // POST /products/publish-bulk
  //
  // Publica en lote reutilizando publishSupplierProduct (idempotente: si el
  // producto ya existe, lo actualiza). Nunca falla completo por un producto:
  // los errores se devuelven en `skipped`.
  const publishBulk = async ({
    productIds,
    filters = {},
    markup,
    visibility,
    actorUserId,
  } = {}) => {
    const supplier = await runs.getSupplierRow(slug);
    const where = { supplierId: supplier.id };
    const requestedIds =
      Array.isArray(productIds) && productIds.length > 0
        ? [...new Set(productIds.map((id) => String(id || "").trim()).filter(Boolean))]
        : null;

    if (requestedIds && requestedIds.length > MAX_BULK_PUBLISH) {
      throw new HttpError(
        400,
        `No se pueden publicar mas de ${MAX_BULK_PUBLISH} articulos a la vez`,
      );
    }

    if (requestedIds) {
      where.id = { [Op.in]: requestedIds };
    } else {
      const search = String(filters.q || "").trim();
      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { externalId: { [Op.iLike]: `%${search}%` } },
        ];
      }
      if (filters.availability === "true" || filters.availability === true) {
        where.availability = true;
      } else if (
        filters.availability === "false" ||
        filters.availability === false
      ) {
        where.availability = false;
      }
      if (filters.published !== undefined && filters.published !== "") {
        const flag =
          filters.published === true ||
          String(filters.published) === "1" ||
          String(filters.published) === "true";
        const exists = `EXISTS (
          SELECT 1 FROM products p
           WHERE p."supplierProductId" = "SupplierProduct"."id"
        )`;
        where[Op.and] = [literal(flag ? exists : `NOT ${exists}`)];
      }
    }

    const rows = await SupplierProduct.findAll({
      where,
      order: [["updatedAt", "DESC"]],
      limit: MAX_BULK_PUBLISH,
    });

    const foundIds = new Set(rows.map((row) => row.id));
    const skipped = requestedIds
      ? requestedIds
          .filter((id) => !foundIds.has(id))
          .map((id) => ({ id, motivo: "Producto del proveedor no encontrado" }))
      : [];

    let updated = 0;
    for (const row of rows) {
      try {
        await publishSupplierProduct({
          supplierProductId: row.id,
          markup,
          visibility,
          actorUserId,
        });
        updated += 1;
      } catch (error) {
        skipped.push({
          id: row.id,
          motivo: error?.message || "No se pudo publicar",
        });
      }
    }

    return {
      requested: requestedIds ? requestedIds.length : rows.length,
      updated,
      skipped,
    };
  };

  // PATCH /settings
  const updateSettings = async ({ publishPolicy, defaultCategoryId } = {}) => {
    const supplier = await runs.getSupplierRow(slug);
    const updates = {};

    if (publishPolicy !== undefined) {
      const policy = String(publishPolicy || "").trim();
      if (!PUBLISH_POLICY_VALUES.includes(policy)) {
        throw new HttpError(400, "La política de publicación no es válida");
      }
      updates.publishPolicy = policy;
    }

    if (defaultCategoryId !== undefined) {
      if (defaultCategoryId === null || defaultCategoryId === "") {
        updates.defaultCategoryId = null;
      } else {
        const category = await Category.findByPk(String(defaultCategoryId), {
          attributes: ["id"],
        });
        if (!category) {
          throw new HttpError(400, "La categoría por defecto no existe");
        }
        updates.defaultCategoryId = category.id;
      }
    }

    if (Object.keys(updates).length > 0) {
      await supplier.update(updates);
    }

    return {
      slug: supplier.slug,
      publishPolicy: supplier.publishPolicy || "manual",
      defaultCategoryId: supplier.defaultCategoryId || null,
    };
  };

  // GET /sync-history
  const getSyncHistory = async ({ limit, offset } = {}) => {
    const supplier = await runs.getSupplierRow(slug);
    return runs.getHistory({ supplierId: supplier.id, limit, offset });
  };

  return {
    SLUG: slug,
    getStatus,
    testConnection,
    listStoredProducts,
    getStoredProduct,
    sync,
    publish,
    publishBulk,
    unpublish,
    updateSettings,
    getSyncHistory,
  };
};

module.exports = { createCatalogSupplierService };
