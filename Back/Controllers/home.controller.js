const { sendError } = require("../Utils/respond.js");
const home = require("../Services/catalog/home.service.js");

// GET /api/home  (publico)
const getHome = async (req, res) => {
  try {
    return res.json(await home.getHomePayload());
  } catch (error) {
    return sendError(res, error, "No se pudo cargar la portada");
  }
};

// GET /api/admin/products/home-sections
const homeSections = async (req, res) => {
  try {
    return res.json(await home.getAdminHomeSections());
  } catch (error) {
    return sendError(res, error, "No se pudo cargar la curaduría de la portada");
  }
};

// PUT /api/admin/products/home-sections/:section
const replaceHomeSection = async (req, res) => {
  try {
    const { productIds } = req.body || {};
    return res.json(
      await home.replaceSection(req.params.section, productIds),
    );
  } catch (error) {
    return sendError(res, error, "No se pudo guardar la sección");
  }
};

module.exports = {
  getHome,
  homeSections,
  replaceHomeSection,
};
