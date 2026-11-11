const { sendError } = require("../Utils/respond.js");
const catalog = require("../Services/catalog/catalogQuery.service.js");

// GET /api/products  (publico)
const list = async (req, res) => {
  try {
    const { q, category, featured, limit, offset } = req.query || {};
    return res.json(
      await catalog.listPublished({ q, category, featured, limit, offset }),
    );
  } catch (error) {
    return sendError(res, error, "No se pudo listar el catálogo");
  }
};

// GET /api/products/:slug  (publico; acepta slug, sku o id)
const detail = async (req, res) => {
  try {
    return res.json(await catalog.getBySlugOrSku(req.params.slug));
  } catch (error) {
    return sendError(res, error, "No se pudo obtener el producto");
  }
};

// GET /api/admin/products
const listAdmin = async (req, res) => {
  try {
    const { q, status, provider, limit, offset } = req.query || {};
    return res.json(
      await catalog.listAdmin({ q, status, provider, limit, offset }),
    );
  } catch (error) {
    return sendError(res, error, "No se pudo listar el catálogo");
  }
};

// GET /api/admin/products/:id
const detailAdmin = async (req, res) => {
  try {
    return res.json(await catalog.getAdmin(req.params.id));
  } catch (error) {
    return sendError(res, error, "No se pudo obtener el producto");
  }
};

// PATCH /api/admin/products/:id
const update = async (req, res) => {
  try {
    return res.json(
      await catalog.updateProduct({
        productId: req.params.id,
        patch: req.body || {},
      }),
    );
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar el producto");
  }
};

module.exports = { list, detail, listAdmin, detailAdmin, update };