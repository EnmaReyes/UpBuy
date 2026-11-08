// Catalogo publico.
//
//   GET /api/products?q=&source=articulo|dtf&featured=true&limit=&offset=
//
// Es una VISTA unificada sobre articulos + dtfs. No modifica las tablas ni
// los endpoints existentes (/api/posts sigue siendo el CRUD de articulos).

const { listProducts } = require("../Services/catalog.js");
const { sendError } = require("../Utils/respond.js");

const list = async (req, res) => {
  try {
    const { q, source, featured, limit, offset } = req.query;
    const result = await listProducts({ q, source, featured, limit, offset });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudo cargar el catálogo");
  }
};

module.exports = { list };
