// Listado de proveedores de catalogo con su estado de conexion.
const { sendError } = require("../../Utils/respond.js");
const {
  sequelize,
  Supplier,
  SupplierProduct,
} = require("../../DataBase/models/index.js");
const { listSupplierAdapters } = require("../../integrations/suppliers/index.js");

const list = async (req, res) => {
  try {
    const adapters = listSupplierAdapters();
    const rows = await Supplier.findAll({ order: [["name", "ASC"]] });

    const counts = await SupplierProduct.findAll({
      attributes: [
        "supplierId",
        [sequelize.fn("COUNT", sequelize.col("id")), "n"],
      ],
      group: ["supplierId"],
      raw: true,
    });
    const countBySupplier = new Map(
      counts.map((row) => [row.supplierId, Number(row.n)]),
    );

    const configured = new Map(adapters.map((a) => [a.slug, a.configured]));

    return res.json({
      suppliers: rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        isActive: row.isActive,
        configured: configured.get(row.slug) ?? false,
        supplierProducts: countBySupplier.get(row.id) || 0,
      })),
    });
  } catch (error) {
    return sendError(res, error, "No se pudieron listar los proveedores");
  }
};

module.exports = { list };