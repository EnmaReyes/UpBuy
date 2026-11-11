// Consulta del catalogo publicado (tienda) y edicion administrativa.
//
// El checkout resuelve precios y stock por su cuenta (Services/pricing.js);
// este servicio es para LEER el catalogo y para que el admin lo edite.
const { Op } = require("sequelize");
const {
  Product,
  Category,
  ProductImage,
} = require("../../DataBase/models/index.js");
const { PRODUCT_STATUS } = require("../../DataBase/models/enums.js");
const { aplicarDescuento } = require("../prices.js");
const HttpError = require("../../Utils/HttpError.js");

const toArray = (value) => (Array.isArray(value) ? value : []);

// Forma publica del producto: sin cost ni markup.
const publicShape = (product) => {
  const json = product.toJSON ? product.toJSON() : product;
  const resultado = aplicarDescuento(
    Number(json.price) || 0,
    json.descuentoPorcentaje,
  );

  return {
    id: json.id,
    sku: json.sku,
    slug: json.slug,
    name: json.name,
    description: json.description,
    images: toArray(json.images),
    price: resultado.precioFinal,
    priceBase: resultado.precioOriginal,
    compareAtPrice: json.compareAtPrice ?? null,
    discountPercent: resultado.descuentoPorcentaje,
    currency: json.currency || "COP",
    stock: Number(json.stock) || 0,
    available: Boolean(json.active) && Number(json.stock) > 0,
    sizes: toArray(json.sizes),
    oversize: Boolean(json.oversize),
    combo: Boolean(json.combo),
    featured: Boolean(json.destacadas),
    categories: toArray(json.categories).map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
    })),
    createdAt: json.createdAt,
  };
};

const categoryInclude = {
  model: Category,
  as: "categories",
  attributes: ["id", "name", "slug"],
  through: { attributes: [] },
  required: false,
};

const listPublished = async ({
  q,
  category,
  featured,
  limit = 24,
  offset = 0,
  includeInactive = false,
} = {}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 24, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const where = includeInactive
    ? {}
    : { status: PRODUCT_STATUS.ACTIVE, active: true };

  const search = String(q || "").trim();
  if (search) {
    where.name = { [Op.iLike]: `%${search}%` };
  }
  if (featured === true || featured === "true") {
    where.destacadas = true;
  }

  const include = [categoryInclude];
  if (category) {
    // Filtra por slug de categoria sin perder el include para el shape.
    include[0].where = { slug: String(category) };
    include[0].required = true;
  }

  const { rows, count } = await Product.findAndCountAll({
    where,
    include,
    order: [
      ["destacadas", "DESC"],
      ["createdAt", "DESC"],
    ],
    limit: safeLimit,
    offset: safeOffset,
    distinct: true,
    subQuery: false,
  });

  return {
    products: rows.map(publicShape),
    total: count,
    limit: safeLimit,
    offset: safeOffset,
  };
};

const getBySlugOrSku = async (value) => {
  const key = String(value || "").trim();
  if (!key) throw new HttpError(400, "Falta el producto");

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
  const matches = [{ slug: key }, { sku: key }];
  if (isUuid) matches.push({ id: key });

  const product = await Product.findOne({
    where: {
      [Op.or]: matches,
      status: PRODUCT_STATUS.ACTIVE,
      active: true,
    },
    include: [
      categoryInclude,
      { model: ProductImage, as: "gallery" },
    ],
  });

  if (!product) {
    throw new HttpError(404, "Producto no encontrado");
  }

  return publicShape(product);
};

// Listado administrativo: incluye borradores/archivados y campos internos.
const listAdmin = async ({ q, status, provider, limit = 24, offset = 0 } = {}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 24, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const where = {};
  const search = String(q || "").trim();
  if (search) where.name = { [Op.iLike]: `%${search}%` };
  if (status) where.status = String(status);
  if (provider) where.provider = String(provider);

  const { rows, count } = await Product.findAndCountAll({
    where,
    include: [categoryInclude, { model: ProductImage, as: "gallery" }],
    order: [["updatedAt", "DESC"]],
    limit: safeLimit,
    offset: safeOffset,
    distinct: true,
  });

  return {
    products: rows.map((row) => ({
      ...row.toJSON(),
      available: Boolean(row.active) && Number(row.stock) > 0,
    })),
    total: count,
    limit: safeLimit,
    offset: safeOffset,
  };
};

const getAdmin = async (id) => {
  const product = await Product.findByPk(id, {
    include: [categoryInclude, { model: ProductImage, as: "gallery" }],
  });
  if (!product) throw new HttpError(404, "Producto no encontrado");
  return {
    ...product.toJSON(),
    available: Boolean(product.active) && Number(product.stock) > 0,
  };
};

// Campos que el admin puede personalizar. Al cambiarlos se marcan en
// manualOverrides para que la sincronizacion NO los pise.
const EDITABLE = {
  price: (value) => Math.max(0, Math.round(Number(value) || 0)),
  compareAtPrice: (value) =>
    value === null || value === "" ? null : Math.max(0, Math.round(Number(value) || 0)),
  name: (value) => String(value || "").trim().slice(0, 255),
  description: (value) => (value ? String(value).trim() : null),
  active: (value) => Boolean(value),
  status: (value) => String(value),
  destacadas: (value) => Boolean(value),
  stock: (value) => Math.max(0, Math.trunc(Number(value) || 0)),
  descuentoPorcentaje: (value) => {
    if (value === null || value === "") return null;
    const parsed = Math.trunc(Number(value));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      throw new HttpError(400, "El descuento debe estar entre 0 y 100");
    }
    return parsed;
  },
};

const updateProduct = async ({ productId, patch = {} }) => {
  const product = await Product.findByPk(productId);
  if (!product) throw new HttpError(404, "Producto no encontrado");

  const updates = {};
  const overrides = { ...(product.manualOverrides || {}) };
  let categories = null;

  for (const [field, transform] of Object.entries(EDITABLE)) {
    if (patch[field] === undefined) continue;
    updates[field] = transform(patch[field]);
    if (["price", "name", "description", "active", "stock"].includes(field)) {
      overrides[field] = true;
    }
  }

  if (patch.categoryIds !== undefined) {
    if (!Array.isArray(patch.categoryIds)) {
      throw new HttpError(400, "categoryIds debe ser un arreglo");
    }
    categories = patch.categoryIds;
    overrides.category = true;
  }

  await product.update({ ...updates, manualOverrides: overrides });

  if (categories) {
    const found = await Category.findAll({
      where: { id: categories },
      attributes: ["id"],
    });
    await product.setCategories(found.map((row) => row.id));
  }

  return getAdmin(product.id);
};

module.exports = {
  publicShape,
  listPublished,
  getBySlugOrSku,
  listAdmin,
  getAdmin,
  updateProduct,
};