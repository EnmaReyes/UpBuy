const { sendError } = require("../Utils/respond.js");
const categories = require("../Services/catalog/categories.service.js");

// GET /api/categories  (publico: solo activas)
const listPublic = async (req, res) => {
  try {
    return res.json({ categories: await categories.list() });
  } catch (error) {
    return sendError(res, error, "No se pudieron listar las categorías");
  }
};

// GET /api/admin/categories  (incluye inactivas)
const listAdmin = async (req, res) => {
  try {
    return res.json({
      categories: await categories.list({ includeInactive: true }),
    });
  } catch (error) {
    return sendError(res, error, "No se pudieron listar las categorías");
  }
};

// POST /api/admin/categories
const create = async (req, res) => {
  try {
    const category = await categories.create(req.body || {});
    return res.status(201).json(category);
  } catch (error) {
    return sendError(res, error, "No se pudo crear la categoría");
  }
};

// PUT /api/admin/categories/:id
const update = async (req, res) => {
  try {
    return res.json(await categories.update(req.params.id, req.body || {}));
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar la categoría");
  }
};

// DELETE /api/admin/categories/:id  (baja logica si tiene productos)
const remove = async (req, res) => {
  try {
    return res.json(await categories.remove(req.params.id));
  } catch (error) {
    return sendError(res, error, "No se pudo eliminar la categoría");
  }
};

module.exports = { listPublic, listAdmin, create, update, remove };