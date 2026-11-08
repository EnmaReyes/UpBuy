const { Op } = require("sequelize");
const { Usuarios } = require("../DataBase/models/index.js");
const { requireAuth, requireAdmin } = require("../Middleware/auth.js");
const { sendError } = require("../Utils/respond.js");

// GET /api/admin/users?limit=&offset=&q=
const list = async (req, res) => {
  try {
    const { limit, offset, q } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const where = {};
    const search = String(q || "").trim();
    if (search) {
      const term = `%${search}%`;
      where[Op.or] = [
        { email: { [Op.iLike]: term } },
        { username: { [Op.iLike]: term } },
        { name: { [Op.iLike]: term } },
        { lastName: { [Op.iLike]: term } },
      ];
    }

    const { rows, count } = await Usuarios.findAndCountAll({
      where,
      attributes: ["id", "username", "email", "name", "lastName", "admin", "image"],
      order: [["email", "ASC"]],
      limit: safeLimit,
      offset: safeOffset,
    });

    return res.status(200).json({
      users: rows,
      total: count,
      limit: safeLimit,
      offset: safeOffset,
    });
  } catch (error) {
    return sendError(res, error, "No se pudieron cargar los usuarios");
  }
};

module.exports = { list };
