// Categorias internas de UpBuy (agrupan productos publicados).
//
// Venndelo NO expone categorias, asi que se administran aqui. La relacion es
// N:M (product_categories): un producto puede estar en varias categorias.
const {
  Category,
  Product,
} = require("../../DataBase/models/index.js");
const HttpError = require("../../Utils/HttpError.js");

const slugify = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);

const sanitize = (payload = {}) => {
  const name = String(payload.name || "").trim();
  if (!name) {
    throw new HttpError(400, "El nombre de la categoría es obligatorio");
  }
  const slug = slugify(payload.slug || name);
  if (!slug) {
    throw new HttpError(400, "El slug de la categoría no es válido");
  }
  return {
    name: name.slice(0, 120),
    slug,
    description: payload.description
      ? String(payload.description).trim().slice(0, 255)
      : null,
    sortOrder: Number.isFinite(Number(payload.sortOrder))
      ? Number(payload.sortOrder)
      : 0,
    isActive:
      payload.isActive === undefined ? true : Boolean(payload.isActive),
  };
};

const list = async ({ includeInactive = false } = {}) => {
  const where = includeInactive ? {} : { isActive: true };
  const rows = await Category.findAll({
    where,
    order: [
      ["sortOrder", "ASC"],
      ["name", "ASC"],
    ],
    include: [
      {
        model: Product,
        as: "products",
        attributes: ["id"],
        through: { attributes: [] },
        required: false,
      },
    ],
  });

  return rows.map((row) => {
    const json = row.toJSON();
    return {
      ...json,
      productCount: (json.products || []).length,
      products: undefined,
    };
  });
};

const create = async (payload) => {
  const data = sanitize(payload);
  const existing = await Category.findOne({ where: { slug: data.slug } });
  if (existing) {
    throw new HttpError(409, "Ya existe una categoría con ese nombre");
  }
  return Category.create(data);
};

const update = async (id, payload) => {
  const category = await Category.findByPk(id);
  if (!category) {
    throw new HttpError(404, "La categoría no existe");
  }

  // Partial update: solo se valida lo que llega.
  const patch = {};
  if (payload.name !== undefined) {
    const data = sanitize({ ...category.toJSON(), ...payload });
    Object.assign(patch, data);
  } else {
    if (payload.description !== undefined) {
      patch.description = payload.description
        ? String(payload.description).trim().slice(0, 255)
        : null;
    }
    if (payload.sortOrder !== undefined) {
      patch.sortOrder = Number(payload.sortOrder) || 0;
    }
    if (payload.isActive !== undefined) {
      patch.isActive = Boolean(payload.isActive);
    }
  }

  await category.update(patch);
  return category.toJSON();
};

// Baja logica: no se borra una categoria con productos.
const remove = async (id) => {
  const category = await Category.findByPk(id);
  if (!category) {
    throw new HttpError(404, "La categoría no existe");
  }

  // Sequelize agrega countProducts() al belongsToMany.
  const total = await category.countProducts();

  if (total > 0) {
    await category.update({ isActive: false });
    return { deactivated: true, productCount: total };
  }

  await category.destroy();
  return { deleted: true, productCount: 0 };
};

module.exports = { list, create, update, remove, slugify };