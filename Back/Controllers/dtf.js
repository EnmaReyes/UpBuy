const { Dtf } = require("../DataBase/models/Dtf");
const { Category } = require("../DataBase/models/Category");
const { sequelize } = require("../DataBase/db.js");
const { decorateDtf, decorateDtfs } = require("../Services/prices.js");

// Las rutas de escritura estan protegidas con requireAdmin (ver Rutas/dtf.js).
// Los precios DTF ya no se editan por diseno: viven en la tarifa global
// (price_variants) y se administran desde /api/prices.

//? Add DTF
const addDtf = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { categoryId, img, stock } = req.body;

    const categoryExists = await Category.findByPk(categoryId);

    if (!categoryExists) {
      await transaction.rollback();
      return res.status(400).json("La categoría no existe");
    }

    const newDtf = await Dtf.create(
      {
        categoryId,
        img,
        stock,
        uid: req.user.id,
      },
      { transaction },
    );

    await transaction.commit();

    return res.status(201).json(await decorateDtf(newDtf));
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    return res.status(500).json("Error interno del servidor");
  }
};

//? Get DTF
const getDtf = async (req, res) => {
  try {
    const dtfItems = await Dtf.findAll({
      include: [
        { model: Category, as: "category", attributes: ["id", "name"] },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json(await decorateDtfs(dtfItems));
  } catch (error) {
    console.error("❌ ERROR GET DTF:", error);
    return res
      .status(500)
      .json({ message: "Error interno del servidor", error: error.message });
  }
};

//? Update DTF
// Actualizacion parcial: solo se tocan los campos enviados. Los precios se
// editan en /api/prices, no aqui.
const updateDtf = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const dtfId = req.params.id;

    const dtf = await Dtf.findByPk(dtfId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!dtf) {
      await transaction.rollback();
      return res.status(404).json("No se encontró el DTF para actualizar");
    }

    const { categoryId, img, stock } = req.body || {};

    if (categoryId !== undefined) {
      const categoryExists = await Category.findByPk(categoryId, {
        transaction,
      });
      if (!categoryExists) {
        await transaction.rollback();
        return res.status(400).json("La categoría no existe");
      }
      dtf.categoryId = categoryId;
    }

    if (img !== undefined) dtf.img = img;
    if (stock !== undefined) dtf.stock = Boolean(stock);

    await dtf.save({ transaction });
    await transaction.commit();

    return res.status(200).json("DTF actualizado con éxito!");
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    return res.status(500).json("Error interno del servidor");
  }
};

//? Get DTF by category
const getDtfByCategory = async (req, res) => {
  try {
    const { categoryId } = req.query;

    if (!categoryId) {
      return res.status(400).json("No se proporcionó una categoría");
    }

    const categoryExists = await Category.findByPk(categoryId);

    if (!categoryExists) {
      return res.status(404).json("La categoría no existe");
    }

    const dtfItems = await Dtf.findAll({
      where: {
        categoryId,
      },

      include: [
        {
          model: Category,
          as: "category",
          attributes: ["id", "name"],
        },
      ],

      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json(await decorateDtfs(dtfItems));
  } catch (error) {
    console.error(error);
    return res.status(500).json("Error interno del servidor");
  }
};

module.exports = {
  addDtf,
  getDtf,
  updateDtf,
  getDtfByCategory,
};
