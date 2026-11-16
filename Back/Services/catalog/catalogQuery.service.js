// Consulta del catalogo publicado (tienda) y edicion administrativa.
//
// El checkout resuelve precios y stock por su cuenta (Services/pricing.js);
// este servicio es para LEER el catalogo y para que el admin lo edite.
const { Op, literal } = require("sequelize");
const {
  Product,
  Category,
  ProductImage,
  Supplier,
  SupplierProduct,
  SupplierProductAsset,
} = require("../../DataBase/models/index.js");
const {
  PRODUCT_STATUS,
  PRODUCT_STATUS_VALUES,
} = require("../../DataBase/models/enums.js");
const { aplicarDescuento } = require("../prices.js");
const { isVisible } = require("./visibility.service.js");
const { unitsSoldOrderExpression } = require("./bestSellers.service.js");
const HttpError = require("../../Utils/HttpError.js");

const NEW_ARRIVAL_WINDOW_DAYS = 30;

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

const categoryInclude = (where) => ({
  model: Category,
  as: "categories",
  attributes: ["id", "name", "slug"],
  through: { attributes: [] },
  required: Boolean(where),
  ...(where ? { where } : {}),
});

const listPublished = async ({
  q,
  category,
  featured,
  onlyNew,
  sort,
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
  if (onlyNew === true || onlyNew === "true" || onlyNew === "1") {
    where[Op.and] = [
      literal(
        `COALESCE("Product"."publishedAt", "Product"."createdAt") >= NOW() - INTERVAL '${NEW_ARRIVAL_WINDOW_DAYS} days'`,
      ),
    ];
  }

  const include = [categoryInclude(category ? { slug: String(category) } : null)];

  // `best_sellers` ordena por unidades vendidas (90 dias); si no hay ventas
  // cae al orden editorial: destacadas y luego las mas recientes.
  const order =
    String(sort || "") === "best_sellers"
      ? [
          [literal(unitsSoldOrderExpression()), "DESC"],
          ["destacadas", "DESC"],
          ["createdAt", "DESC"],
        ]
      : [
          ["destacadas", "DESC"],
          ["createdAt", "DESC"],
        ];

  const { rows, count } = await Product.findAndCountAll({
    where,
    include,
    order,
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
      categoryInclude(),
      { model: ProductImage, as: "gallery" },
    ],
  });

  if (!product) {
    throw new HttpError(404, "Producto no encontrado");
  }

  return publicShape(product);
};

// Listado administrativo: incluye borradores/archivados y campos internos.
const listAdmin = async ({
  q,
  status,
  provider,
  visibility,
  hasCategory,
  published,
  stock,
  limit = 24,
  offset = 0,
} = {}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 24, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const where = {};
  const conditions = [];

  const search = String(q || "").trim();
  if (search) {
    // El panel busca por nombre o por SKU (propio o del proveedor).
    conditions.push({
      [Op.or]: [
        { name: { [Op.iLike]: `%${search}%` } },
        { sku: { [Op.iLike]: `%${search}%` } },
        { providerSku: { [Op.iLike]: `%${search}%` } },
      ],
    });
  }
  if (status) conditions.push({ status: String(status) });
  if (provider) conditions.push({ provider: String(provider) });

  // Visible = activo en la tienda (status active + active true). Oculto es su
  // complemento, incluidos borradores y archivados.
  if (visibility === "visible") {
    conditions.push({ status: PRODUCT_STATUS.ACTIVE, active: true });
  } else if (visibility === "hidden") {
    conditions.push({
      [Op.or]: [{ status: { [Op.ne]: PRODUCT_STATUS.ACTIVE } }, { active: false }],
    });
  }

  // published=1: productos ya promovidos desde el proveedor (no borrador);
  // published=0: solo borradores.
  if (published !== undefined && published !== "") {
    const flag = published === true || String(published) === "1" || String(published) === "true";
    conditions.push({
      status: flag ? { [Op.ne]: PRODUCT_STATUS.DRAFT } : PRODUCT_STATUS.DRAFT,
    });
  }

  if (hasCategory !== undefined && hasCategory !== "") {
    const flag = hasCategory === true || String(hasCategory) === "true" || String(hasCategory) === "1";
    const exists = `EXISTS (
      SELECT 1 FROM product_categories pc
       WHERE pc."productId" = "Product"."id"
    )`;
    conditions.push(literal(flag ? exists : `NOT ${exists}`));
  }

  if (stock === "in") conditions.push({ stock: { [Op.gt]: 0 } });
  else if (stock === "out") conditions.push({ stock: 0 });

  if (conditions.length > 0) where[Op.and] = conditions;

  const { rows, count } = await Product.findAndCountAll({
    where,
    include: [categoryInclude(), { model: ProductImage, as: "gallery" }],
    order: [["updatedAt", "DESC"]],
    limit: safeLimit,
    offset: safeOffset,
    distinct: true,
  });

  return {
    products: rows.map((row) => {
      const json = row.toJSON ? row.toJSON() : row;
      // `price` es el precio base; `precio` es el que se cobra (con el
      // descuento del producto). El panel de ventas necesita el que se cobra.
      const resultado = aplicarDescuento(
        Number(json.price) || 0,
        json.descuentoPorcentaje,
      );

      return {
        ...json,
        precio: resultado.precioFinal,
        precioOriginal: resultado.precioOriginal,
        available: Boolean(row.active) && Number(row.stock) > 0,
      };
    }),
    total: count,
    limit: safeLimit,
    offset: safeOffset,
  };
};

// ---------------------------------------------------------------------------
// Bandeja global: importados sin publicar de TODOS los proveedores
// ---------------------------------------------------------------------------

// La curaduria de /admin/catalogo debe ver todo lo que entre por API, sin
// importar de que proveedor venga. La publicacion sigue siendo por proveedor
// (`/api/admin/suppliers/:slug/products/...`), pero la lectura es una sola.
const listUnpublished = async ({
  q,
  availability,
  provider,
  page = 1,
  limit = 20,
} = {}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);

  const conditions = [
    literal(`NOT EXISTS (
      SELECT 1 FROM products p
       WHERE p."supplierProductId" = "SupplierProduct"."id"
    )`),
  ];

  const search = String(q || "").trim();
  if (search) {
    conditions.push({
      [Op.or]: [
        { name: { [Op.iLike]: `%${search}%` } },
        { externalId: { [Op.iLike]: `%${search}%` } },
      ],
    });
  }

  if (availability === "true" || availability === true) {
    conditions.push({ availability: true });
  } else if (availability === "false" || availability === false) {
    conditions.push({ availability: false });
  }

  const supplierSlug = String(provider || "").trim();

  const { rows, count } = await SupplierProduct.findAndCountAll({
    where: { [Op.and]: conditions },
    include: [
      {
        model: Supplier,
        as: "supplier",
        attributes: ["id", "slug", "name"],
        required: true,
        ...(supplierSlug ? { where: { slug: supplierSlug } } : {}),
      },
      { model: SupplierProductAsset, as: "assets" },
    ],
    order: [["updatedAt", "DESC"]],
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
    distinct: true,
  });

  return {
    products: rows.map((row) => {
      const json = row.toJSON ? row.toJSON() : row;
      json.assets = (json.assets || []).sort((a, b) => a.position - b.position);
      json.published = null;
      return json;
    }),
    total: count,
    page: safePage,
    limit: safeLimit,
  };
};

const getAdmin = async (id) => {
  const product = await Product.findByPk(id, {
    include: [categoryInclude(), { model: ProductImage, as: "gallery" }],
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
  status: (value) => {
    const status = String(value || "").trim();
    if (!PRODUCT_STATUS_VALUES.includes(status)) {
      throw new HttpError(400, "El estado del producto no es válido");
    }
    return status;
  },
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

// Slug publico: minusculas, numeros y guiones. No se acepta vacio.
const normalizeSlug = (value) => {
  const slug = String(value || "").trim().toLowerCase();
  if (!slug || slug.length > 180 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new HttpError(
      400,
      "El slug solo admite minúsculas, números y guiones (máx. 180)",
    );
  }
  return slug;
};

const updateProduct = async ({
  productId,
  patch = {},
  confirmSlugChange = false,
} = {}) => {
  const product = await Product.findByPk(productId);
  if (!product) throw new HttpError(404, "Producto no encontrado");

  // El stock de un producto de proveedor solo lo mueve la sincronizacion.
  if (patch.stock !== undefined && product.supplierProductId) {
    throw new HttpError(
      422,
      "El stock lo actualiza el proveedor; no se puede editar desde UPBUY",
    );
  }

  const updates = {};
  const overrides = { ...(product.manualOverrides || {}) };
  let categories = null;

  for (const [field, transform] of Object.entries(EDITABLE)) {
    if (patch[field] === undefined) continue;
    updates[field] = transform(patch[field]);
    if (["price", "name", "description", "active", "stock", "destacadas"].includes(field)) {
      overrides[field] = true;
    }
  }

  if (patch.slug !== undefined) {
    const slug = normalizeSlug(patch.slug);
    if (slug !== product.slug) {
      // Cambiar la URL de un producto visible rompe enlaces: exige confirmacion.
      if (isVisible(product) && !confirmSlugChange) {
        throw new HttpError(
          409,
          "El producto está visible: confirma el cambio de slug para no romper enlaces",
        );
      }
      const occupied = await Product.findOne({
        where: { slug, id: { [Op.ne]: product.id } },
        attributes: ["id"],
      });
      if (occupied) {
        throw new HttpError(409, "Ya existe un producto con ese slug");
      }
      updates.slug = slug;
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
  categoryInclude,
  listPublished,
  getBySlugOrSku,
  listAdmin,
  listUnpublished,
  getAdmin,
  updateProduct,
};