const { sendError } = require("../Utils/respond.js");
const catalog = require("../Services/catalog/catalogQuery.service.js");
const catalogAdmin = require("../Services/catalog/catalogAdmin.service.js");

// GET /api/products  (publico)
const list = async (req, res) => {
  try {
    const { q, category, featured, sort, limit, offset } = req.query || {};
    return res.json(
      await catalog.listPublished({
        q,
        category,
        featured,
        onlyNew: req.query?.new,
        sort,
        limit,
        offset,
      }),
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
    const {
      q,
      status,
      provider,
      visibility,
      hasCategory,
      published,
      stock,
      limit,
      offset,
    } = req.query || {};
    return res.json(
      await catalog.listAdmin({
        q,
        status,
        provider,
        visibility,
        hasCategory,
        published,
        stock,
        limit,
        offset,
      }),
    );
  } catch (error) {
    return sendError(res, error, "No se pudo listar el catálogo");
  }
};

// GET /api/admin/products/unpublished  (bandeja global de proveedores)
const listUnpublished = async (req, res) => {
  try {
    const { q, availability, provider, page, limit } = req.query || {};
    return res.json(
      await catalog.listUnpublished({ q, availability, provider, page, limit }),
    );
  } catch (error) {
    return sendError(res, error, "No se pudo listar la bandeja del catálogo");
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
    const body = req.body || {};
    return res.json(
      await catalog.updateProduct({
        productId: req.params.id,
        patch: body,
        confirmSlugChange: body.confirmSlugChange === true,
      }),
    );
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar el producto");
  }
};

// POST /api/admin/products/:id/visibility
const visibility = async (req, res) => {
  try {
    const { visible } = req.body || {};
    return res.json(
      await catalogAdmin.setVisibility({
        productId: req.params.id,
        visible,
      }),
    );
  } catch (error) {
    return sendError(res, error, "No se pudo cambiar la visibilidad");
  }
};

// POST /api/admin/products/bulk
const bulk = async (req, res) => {
  try {
    const { ids, action, payload } = req.body || {};
    return res.json(await catalogAdmin.bulk({ ids, action, payload }));
  } catch (error) {
    return sendError(res, error, "No se pudo aplicar la acción en lote");
  }
};

// PUT /api/admin/products/:id/images
const setImages = async (req, res) => {
  try {
    const { images } = req.body || {};
    return res.json(
      await catalogAdmin.setImages({ productId: req.params.id, images }),
    );
  } catch (error) {
    return sendError(res, error, "No se pudieron actualizar las imágenes");
  }
};

// POST /api/admin/products/:id/images/restore
const restoreImages = async (req, res) => {
  try {
    return res.json(
      await catalogAdmin.restoreImages({ productId: req.params.id }),
    );
  } catch (error) {
    return sendError(res, error, "No se pudieron restaurar las imágenes");
  }
};

module.exports = {
  list,
  detail,
  listAdmin,
  listUnpublished,
  detailAdmin,
  update,
  visibility,
  bulk,
  setImages,
  restoreImages,
};