const {
  PriceVariant,
  ProductPrice,
} = require("../DataBase/models/index.js");
const { sequelize } = require("../DataBase/db.js");

const PRODUCT_TYPE_VALUES = ["articulo", "dtf"];
const TIPO_VALUES = ["basico", "oversize"];

const normalizePrevious = (value, precio) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed > precio ? parsed : null;
};

const listPrices = async () => {
  const prices = await PriceVariant.findAll({
    order: [
      ["productType", "ASC"],
      ["tipo", "ASC"],
    ],
  });

  const [overrides] = await sequelize.query(
    `SELECT "productType", count(*)::int AS total
       FROM product_prices
      WHERE kind = 'unit' AND activo = true
      GROUP BY "productType"`,
  );

  return {
    prices,
    overrides: overrides.reduce(
      (acc, row) => ({ ...acc, [row.productType]: row.total }),
      { articulo: 0, dtf: 0 },
    ),
  };
};

// GET /api/prices
const getPrices = async (req, res) => {
  try {
    return res.status(200).json(await listPrices());
  } catch (error) {
    console.error("Error en getPrices:", error);
    return res.status(500).json("Error interno del servidor");
  }
};

// PUT /api/prices
// Body: { prices: [{ productType, tipo, precio, precioAnterior }] }
const updatePrices = async (req, res) => {
  const prices = Array.isArray(req.body?.prices) ? req.body.prices : null;

  if (!prices || prices.length === 0) {
    return res.status(400).json("No se recibieron precios");
  }

  const seen = new Set();

  for (const item of prices) {
    const productType = String(item?.productType || "").trim();
    const tipo = String(item?.tipo || "").trim();
    const precio = Number(item?.precio);

    if (!PRODUCT_TYPE_VALUES.includes(productType)) {
      return res.status(400).json("Familia de producto inválida");
    }
    if (!TIPO_VALUES.includes(tipo)) {
      return res.status(400).json("Tipo de precio inválido");
    }
    if (!Number.isInteger(precio) || precio <= 0) {
      return res
        .status(400)
        .json("Cada precio debe ser un entero mayor a cero");
    }

    const key = `${productType}:${tipo}`;
    if (seen.has(key)) {
      return res.status(400).json("Hay precios duplicados en la solicitud");
    }
    seen.add(key);
  }

  const transaction = await sequelize.transaction();

  try {
    for (const item of prices) {
      const productType = String(item.productType).trim();
      const tipo = String(item.tipo).trim();
      const precio = Number(item.precio);
      const precioAnterior = normalizePrevious(
        item.precioAnterior,
        precio,
      );

      const [row, created] = await PriceVariant.findOrCreate({
        where: { productType, tipo },
        defaults: {
          productType,
          tipo,
          precio,
          precioAnterior,
          activo: true,
        },
        transaction,
      });

      if (!created) {
        await row.update(
          { precio, precioAnterior, activo: true },
          { transaction },
        );
      }
    }

    await transaction.commit();

    return res.status(200).json({
      message: "Precios actualizados con éxito!",
      ...(await listPrices()),
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error en updatePrices:", error);
    return res.status(500).json("Error interno del servidor");
  }
};

// POST /api/prices/normalize
// Elimina las excepciones unitarias para que todos los productos usen la
// tarifa global. Los precios de combo se conservan.
const normalizePrices = async (req, res) => {
  try {
    const removed = await ProductPrice.destroy({
      where: { kind: "unit" },
    });

    return res.status(200).json({
      message:
        removed > 0
          ? `Se normalizaron ${removed} precios con la tarifa global`
          : "No había precios propios por normalizar",
      removed,
      ...(await listPrices()),
    });
  } catch (error) {
    console.error("Error en normalizePrices:", error);
    return res.status(500).json("Error interno del servidor");
  }
};

module.exports = { getPrices, updatePrices, normalizePrices };
