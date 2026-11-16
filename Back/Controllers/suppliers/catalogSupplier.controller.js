// Fabrica de la capa HTTP de un proveedor de CATALOGO.
//
// Cada controlador concreto (venndelo, mastershop) es una instancia con su
// fachada de servicio y su nombre: la validacion y las respuestas son iguales
// para todos.
const { sendError } = require("../../Utils/respond.js");
const HttpError = require("../../Utils/HttpError.js");

const createCatalogSupplierController = ({ service, providerName } = {}) => {
  if (!service) throw new Error("createCatalogSupplierController requiere service");

  // GET /api/admin/suppliers/<slug>/status
  const status = async (req, res) => {
    try {
      return res.json(await service.getStatus());
    } catch (error) {
      return sendError(
        res,
        error,
        `No se pudo obtener el estado de ${providerName}`,
      );
    }
  };

  // POST /api/admin/suppliers/<slug>/test-connection
  const testConnection = async (req, res) => {
    try {
      return res.json(await service.testConnection());
    } catch (error) {
      return sendError(
        res,
        error,
        `No se pudo probar la conexión con ${providerName}`,
      );
    }
  };

  // GET /api/admin/suppliers/<slug>/products
  const listProducts = async (req, res) => {
    try {
      const { q, availability, published, page, limit } = req.query || {};
      return res.json(
        await service.listStoredProducts({
          q,
          availability,
          published,
          page,
          limit,
        }),
      );
    } catch (error) {
      return sendError(
        res,
        error,
        `No se pudo listar el catálogo de ${providerName}`,
      );
    }
  };

  // GET /api/admin/suppliers/<slug>/products/:id
  const getProduct = async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) throw new HttpError(400, "Falta el id del producto");
      return res.json(await service.getStoredProduct(id));
    } catch (error) {
      return sendError(res, error, "No se pudo obtener el producto");
    }
  };

  // POST /api/admin/suppliers/<slug>/sync
  const sync = async (req, res) => {
    try {
      const { pageSize } = req.body || {};
      const result = await service.sync({
        triggeredBy: req.user?.id || null,
        pageSize,
      });
      return res.status(202).json(result);
    } catch (error) {
      return sendError(res, error, "No se pudo sincronizar el catálogo");
    }
  };

  // GET /api/admin/suppliers/<slug>/sync-history
  const syncHistory = async (req, res) => {
    try {
      const { limit, offset } = req.query || {};
      return res.json(await service.getSyncHistory({ limit, offset }));
    } catch (error) {
      return sendError(
        res,
        error,
        "No se pudo obtener el historial de sincronización",
      );
    }
  };

  // POST /api/admin/suppliers/<slug>/products/:id/publish
  const publish = async (req, res) => {
    try {
      const { id } = req.params;
      const { categoryIds, price, markup, visibility } = req.body || {};

      if (categoryIds !== undefined && !Array.isArray(categoryIds)) {
        throw new HttpError(400, "categoryIds debe ser un arreglo de ids");
      }
      if (price !== undefined) {
        const parsed = Number(price);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new HttpError(400, "El precio no es válido");
        }
      }
      if (
        visibility !== undefined &&
        visibility !== "draft" &&
        visibility !== "visible"
      ) {
        throw new HttpError(400, "La visibilidad debe ser draft o visible");
      }

      const product = await service.publish({
        supplierProductId: id,
        categoryIds,
        price,
        markup,
        visibility,
        actorUserId: req.user?.id || null,
      });

      return res.status(201).json(product);
    } catch (error) {
      return sendError(res, error, "No se pudo publicar el producto");
    }
  };

  // POST /api/admin/suppliers/<slug>/products/:id/unpublish
  const unpublish = async (req, res) => {
    try {
      const { id } = req.params;
      // `id` es el producto del proveedor; el servicio resuelve el publicado.
      const product = await service.unpublish({ supplierProductId: id });
      return res.json(product);
    } catch (error) {
      return sendError(res, error, "No se pudo despublicar el producto");
    }
  };

  // POST /products/publish-bulk
  const publishBulk = async (req, res) => {
    try {
      const { productIds, filters, markup, visibility } = req.body || {};

      if (productIds !== undefined && !Array.isArray(productIds)) {
        throw new HttpError(400, "productIds debe ser un arreglo de ids");
      }
      if (
        visibility !== undefined &&
        visibility !== "draft" &&
        visibility !== "visible"
      ) {
        throw new HttpError(400, "La visibilidad debe ser draft o visible");
      }

      const result = await service.publishBulk({
        productIds,
        filters: filters && typeof filters === "object" ? filters : {},
        markup,
        visibility,
        actorUserId: req.user?.id || null,
      });
      return res.json(result);
    } catch (error) {
      return sendError(res, error, "No se pudo publicar el lote de productos");
    }
  };

  // PATCH /settings
  const updateSettings = async (req, res) => {
    try {
      const { publishPolicy, defaultCategoryId } = req.body || {};
      return res.json(
        await service.updateSettings({ publishPolicy, defaultCategoryId }),
      );
    } catch (error) {
      return sendError(res, error, "No se pudo actualizar la configuración");
    }
  };

  return {
    status,
    testConnection,
    listProducts,
    getProduct,
    sync,
    syncHistory,
    publish,
    publishBulk,
    unpublish,
    updateSettings,
  };
};

module.exports = { createCatalogSupplierController };
