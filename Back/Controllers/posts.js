const { Op } = require("sequelize");
const { Articulos } = require("../DataBase/models/Articulos.js");
const { ProductPrice } = require("../DataBase/models/ProductPrice.js");
const { sequelize } = require("../DataBase/db.js");
const {
  COMBO_TIPO,
  decorateArticles,
  decorateArticle,
} = require("../Services/prices.js");

// CRUD de articulos.
// Las rutas de escritura estan protegidas con requireAdmin (ver Rutas/posts.js),
// por eso aqui se asume que req.user existe y es administrador.
// Las respuestas siguen la convencion de la API: strings planos.

// El precio unitario ya no vive en articulos: se resuelve desde la tarifa
// global (price_variants) o una excepcion (product_prices). El combo solo
// aporta su flag de presentacion y su precio propio.
const ARTICLE_FIELDS = [
  "title",
  "desc",
  "img",
  "sizes",
  "oversize",
  "stock",
  "destacadas",
  "combo",
  "descuentoPorcentaje",
];

// Valida el porcentaje de descuento individual: null/0 = sin descuento.
// Retorna { ok: true, value } o { ok: false } para responder 400.
const parseDescuentoPorcentaje = (value) => {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || value === "") return { ok: true, value: null };
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    return { ok: false };
  }
  return { ok: true, value: parsed === 0 ? null : parsed };
};

// Construye el objeto de escritura solo con los campos enviados, para no
// borrar datos existentes cuando el panel hace un PUT parcial.
const pickArticleFields = (body = {}) => {
  const data = {};
  for (const field of ARTICLE_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field];
  }
  return data;
};

// `sizes` puede llegar como array o como JSON en texto.
const toSizeArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

// Limpia las tallas: sin vacias, sin duplicados y en mayusculas.
const cleanSizes = (value) => {
  const seen = new Set();
  const result = [];
  for (const raw of toSizeArray(value)) {
    const size = String(raw ?? "").trim().toUpperCase();
    if (!size || seen.has(size)) continue;
    seen.add(size);
    result.push(size);
  }
  return result;
};

// Oversize y tallas son excluyentes: una prenda oversize se guarda con
// sizes = [] y una basica nunca guarda tallas duplicadas o vacias.
const normalizeSizesAndOversize = (data, currentOversize) => {
  const oversize =
    data.oversize !== undefined
      ? Boolean(data.oversize)
      : Boolean(currentOversize);

  if (oversize) {
    data.oversize = true;
    data.sizes = [];
  } else {
    data.oversize = false;
    if (data.sizes !== undefined) data.sizes = cleanSizes(data.sizes);
  }

  return data;
};

const parsePositivePrice = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parsePreviousPrice = (value, currentPrice) => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  if (parsed <= currentPrice) return null;
  return parsed;
};

const comboPriceData = (articuloId, precio, precioAnterior) => ({
  productType: "articulo",
  productId: articuloId,
  tipo: COMBO_TIPO,
  kind: "combo",
  precio,
  precioAnterior: precioAnterior ?? null,
  activo: true,
});

const addArticle = async (req, res) => {
  try {
    const data = normalizeSizesAndOversize(pickArticleFields(req.body), true);
    const esCombo = Boolean(data.combo);

    // Descuento individual: los combos quedan excluidos por decision de
    // negocio, por eso se ignora aunque venga en el cuerpo.
    const descuento = parseDescuentoPorcentaje(req.body.descuentoPorcentaje);
    if (!descuento.ok) {
      return res
        .status(400)
        .json("El descuento debe ser un porcentaje entero entre 0 y 100");
    }
    data.descuentoPorcentaje = esCombo ? null : (descuento.value ?? null);

    let precioCombo = null;
    let precioAnteriorCombo = null;

    if (esCombo) {
      precioCombo = parsePositivePrice(req.body.precioCombo);
      if (!precioCombo) {
        return res
          .status(400)
          .json("Un artículo combo necesita un precio de combo mayor a cero");
      }

      precioAnteriorCombo = parsePreviousPrice(
        req.body.precioAnteriorCombo,
        precioCombo,
      );
    }

    const transaction = await sequelize.transaction();

    try {
      const createdArt = await Articulos.create(
        { ...data, uid: req.user.id },
        { transaction },
      );

      if (esCombo) {
        await ProductPrice.create(
          comboPriceData(
            createdArt.id,
            precioCombo,
            precioAnteriorCombo,
          ),
          { transaction },
        );
      }

      await transaction.commit();

      const article = await decorateArticle(createdArt);

      return res.status(201).json({
        message: "Artículo creado con éxito!",
        article,
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    if (error.name === "SequelizeValidationError") {
      return res
        .status(400)
        .json(error.errors?.[0]?.message || "Datos del artículo inválidos");
    }
    console.error("Error en addArticle:", error);
    return res.status(500).json("Error interno del servidor del post");
  }
};

const getArticle = async (req, res) => {
  try {
    const articulos = await Articulos.findAll({
      order: [["createdAt", "DESC"]], // Último creado primero
    });
    if (!articulos || articulos.length === 0) {
      return res.status(404).json("No Hay Articulos");
    }
    return res.status(200).json(await decorateArticles(articulos));
  } catch (error) {
    console.error("Error en getArticle:", error);
    return res.status(500).json("Error interno del servidor");
  }
};

// GET /api/posts/search?title=...
const getArticleByTitle = async (req, res) => {
  try {
    const articleName = String(req.query.title || "").trim();
    if (!articleName) {
      return res.status(400).json("Indica el título a buscar");
    }

    const posts = await Articulos.findAll({
      where: {
        title: {
          [Op.iLike]: `%${articleName}%`,
        },
      },
      order: [["createdAt", "DESC"]],
    });

    // Lista vacia es una respuesta valida, no un error.
    return res.status(200).json(await decorateArticles(posts));
  } catch (error) {
    console.error("Error en getArticleByTitle:", error);
    return res.status(500).json("Error interno del servidor");
  }
};

const deleteArticle = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const article = await Articulos.findByPk(req.params.id, { transaction });

    if (!article) {
      await transaction.rollback();
      return res.status(404).json("No se encontró el artículo");
    }

    await ProductPrice.destroy({
      where: { productType: "articulo", productId: article.id },
      transaction,
    });
    await article.destroy({ transaction });

    await transaction.commit();
    return res.json("Post eliminado con éxito!");
  } catch (error) {
    await transaction.rollback();
    console.error("Error en deleteArticle:", error);
    return res.status(500).json("Error en el servidor");
  }
};

const updateArticle = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const article = await Articulos.findByPk(req.params.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!article) {
      await transaction.rollback();
      return res.status(404).json("No se encontró el post para actualizar");
    }

    const data = normalizeSizesAndOversize(
      pickArticleFields(req.body),
      article.oversize,
    );
    const targetCombo =
      data.combo !== undefined ? Boolean(data.combo) : article.combo;

    // Descuento individual: los combos quedan excluidos (se borra el
    // porcentaje si el articulo pasa a ser combo). Solo se toca cuando el
    // cliente envia el campo, para no pisar datos en PUT parciales.
    if (req.body.descuentoPorcentaje !== undefined) {
      const descuento = parseDescuentoPorcentaje(req.body.descuentoPorcentaje);
      if (!descuento.ok) {
        await transaction.rollback();
        return res
          .status(400)
          .json("El descuento debe ser un porcentaje entero entre 0 y 100");
      }
      data.descuentoPorcentaje = targetCombo ? null : (descuento.value ?? null);
    } else if (targetCombo && article.descuentoPorcentaje) {
      data.descuentoPorcentaje = null;
    }

    let comboData = null;

    if (targetCombo) {
      const existing = await ProductPrice.findOne({
        where: {
          productType: "articulo",
          productId: article.id,
          tipo: COMBO_TIPO,
          kind: "combo",
        },
        transaction,
      });

      const precio = parsePositivePrice(
        req.body.precioCombo !== undefined
          ? req.body.precioCombo
          : existing?.precio,
      );

      if (!precio) {
        await transaction.rollback();
        return res
          .status(400)
          .json("Un artículo combo necesita un precio de combo mayor a cero");
      }

      const previous = parsePreviousPrice(
        req.body.precioAnteriorCombo !== undefined
          ? req.body.precioAnteriorCombo
          : existing?.precioAnterior,
        precio,
      );

      comboData = comboPriceData(article.id, precio, previous);
    }

    await article.update(data, { transaction });

    if (targetCombo) {
      const [combo, created] = await ProductPrice.findOrCreate({
        where: {
          productType: "articulo",
          productId: article.id,
          tipo: COMBO_TIPO,
          kind: "combo",
        },
        defaults: comboData,
        transaction,
      });

      if (!created) {
        await combo.update(
          {
            precio: comboData.precio,
            precioAnterior: comboData.precioAnterior,
            activo: true,
          },
          { transaction },
        );
      }
    } else {
      await ProductPrice.destroy({
        where: {
          productType: "articulo",
          productId: article.id,
          kind: "combo",
        },
        transaction,
      });
    }

    await transaction.commit();
    return res.json("Post actualizado con éxito!");
  } catch (error) {
    await transaction.rollback();

    if (error.name === "SequelizeValidationError") {
      return res
        .status(400)
        .json(error.errors?.[0]?.message || "Datos del artículo inválidos");
    }
    console.error("Error en updateArticle:", error);
    return res.status(500).json("Error interno del servidor");
  }
};

const getArticleByID = async (req, res) => {
  try {
    const article = await Articulos.findByPk(req.params.id);

    if (!article) {
      return res.status(404).json("No Hay Articulos por ID");
    }
    return res.status(200).json(await decorateArticle(article));
  } catch (error) {
    console.error(error);
    return res.status(500).json("Error interno del servidor");
  }
};

module.exports = {
  addArticle,
  getArticle,
  getArticleByTitle,
  deleteArticle,
  updateArticle,
  getArticleByID,
};
