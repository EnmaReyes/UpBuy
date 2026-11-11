// Capa HTTP de la integracion Venndelo. Solo valida y delega.
const { sendError } = require("../../Utils/respond.js");
const HttpError = require("../../Utils/HttpError.js");
const service = require("../../Services/suppliers/venndelo.service.js");

// GET /api/admin/suppliers/venndelo/status
const status = async (req, res) => {
  try {
    return res.json(await service.getStatus());
  } catch (error) {
    return sendError(res, error, "No se pudo obtener el estado de Venndelo");
  }
};

// POST /api/admin/suppliers/venndelo/test-connection
const testConnection = async (req, res) => {
  try {
    return res.json(await service.testConnection());
  } catch (error) {
    return sendError(res, error, "No se pudo probar la conexión con Venndelo");
  }
};

// GET /api/admin/suppliers/venndelo/products
const listProducts = async (req, res) => {
  try {
    const { q, availability, page, limit } = req.query || {};
    return res.json(
      await service.listStoredProducts({ q, availability, page, limit }),
    );
  } catch (error) {
    return sendError(res, error, "No se pudo listar el catálogo de Venndelo");
  }
};

// GET /api/admin/suppliers/venndelo/products/:id
const getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) throw new HttpError(400, "Falta el id del producto");
    return res.json(await service.getStoredProduct(id));
  } catch (error) {
    return sendError(res, error, "No se pudo obtener el producto");
  }
};

// POST /api/admin/suppliers/venndelo/sync
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

// GET /api/admin/suppliers/venndelo/sync-history
const syncHistory = async (req, res) => {
  try {
    const { limit, offset } = req.query || {};
    return res.json(await service.getSyncHistory({ limit, offset }));
  } catch (error) {
    return sendError(res, error, "No se pudo obtener el historial de sincronización");
  }
};

// POST /api/admin/suppliers/venndelo/products/:id/publish
const publish = async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryIds, price, markup } = req.body || {};

    if (categoryIds !== undefined && !Array.isArray(categoryIds)) {
      throw new HttpError(400, "categoryIds debe ser un arreglo de ids");
    }
    if (price !== undefined) {
      const parsed = Number(price);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new HttpError(400, "El precio no es válido");
      }
    }

    const product = await service.publish({
      supplierProductId: id,
      categoryIds,
      price,
      markup,
      actorUserId: req.user?.id || null,
    });

    return res.status(201).json(product);
  } catch (error) {
    return sendError(res, error, "No se pudo publicar el producto");
  }
};

// POST /api/admin/suppliers/venndelo/products/:id/unpublish
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

module.exports = {
  status,
  testConnection,
  listProducts,
  getProduct,
  sync,
  syncHistory,
  publish,
  unpublish,
};