// Catalogo publico unificado.
//
// Upbuy tiene dos origenes de producto: `articulos` (camisetas/combos) y
// `dtfs` (disenos). NO se unifican las tablas (ver docs): esta vista entrega
// ambos en una forma comun para que el front tenga un solo endpoint.
//
// Cada producto trae `source` ("articulo" | "dtf") y conserva `raw` para los
// campos propios de cada origen.

const { Op } = require("sequelize");
const { Articulos, Dtf, Category } = require("../DataBase/models/index.js");
const { decorateArticles } = require("./prices.js");

const normalizeArticle = (article) => ({
  id: article.id,
  source: "articulo",
  title: article.title,
  description: article.desc || null,
  image: article.img || null,
  price: article.precio ?? null,
  previousPrice: article.precioAnterior ?? null,
  discountPercent: article.descuentoPorcentaje || 0,
  stock: article.stock !== false,
  sizes: article.sizes || [],
  oversize: Boolean(article.oversize),
  combo: Boolean(article.combo),
  featured: Boolean(article.destacadas),
  createdAt: article.createdAt || null,
  raw: article,
});

const normalizeDtf = (dtf, categoryNames = {}) => ({
  id: dtf.id,
  source: "dtf",
  title: categoryNames[dtf.categoryId] || `DTF ${String(dtf.id).slice(0, 8)}`,
  description: null,
  image: dtf.img || null,
  price: null, // el DTF se cobra por la prenda a la que se aplica
  previousPrice: null,
  discountPercent: 0,
  stock: dtf.stock !== false,
  sizes: [],
  oversize: false,
  combo: false,
  featured: false,
  createdAt: dtf.createdAt || null,
  raw: dtf,
});

// GET /api/products
const listProducts = async ({
  q,
  source,
  featured,
  limit = 24,
  offset = 0,
} = {}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 24, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const wantsArticulo = !source || source === "articulo";
  const wantsDtf = !source || source === "dtf";

  const search = String(q || "").trim();

  const [articles, dtfs, categories] = await Promise.all([
    wantsArticulo
      ? Articulos.findAll({
          where: search ? { title: { [Op.iLike]: `%${search}%` } } : {},
          order: [["createdAt", "DESC"]],
        })
      : [],
    wantsDtf ? Dtf.findAll({ order: [["createdAt", "DESC"]] }) : [],
    wantsDtf ? Category.findAll() : [],
  ]);

  const decorated = articles.length ? await decorateArticles(articles) : [];

  const categoryNames = {};
  for (const category of categories) {
    categoryNames[category.id] =
      category.name || category.title || null;
  }

  let products = [
    ...decorated.map(normalizeArticle),
    ...dtfs.map((dtf) => normalizeDtf(dtf, categoryNames)),
  ];

  if (featured === true || featured === "true") {
    products = products.filter((product) => product.featured);
  }

  if (search) {
    const term = search.toLowerCase();
    products = products.filter((product) =>
      String(product.title || "").toLowerCase().includes(term),
    );
  }

  products.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const total = products.length;
  const page = products.slice(safeOffset, safeOffset + safeLimit);

  return {
    products: page,
    total,
    limit: safeLimit,
    offset: safeOffset,
  };
};

module.exports = { listProducts };
