// Home publica: arma las tres secciones curadas y su relleno automatico.
//
// Regla unica (identica para las tres secciones):
//
//   curados  = filas de product_home_sections, primero las `manual` y luego
//              las `default`, respetando `position`. Solo productos publicados.
//   huecos   = HOME_SECTION_SIZE - curados.length
//   seccion  = curados ++ automaticos[0..huecos]
//
// Lo curado SIEMPRE gana: el relleno automatico solo completa huecos.
const { Op, literal } = require("sequelize");
const {
  sequelize,
  Product,
  Category,
  ProductHomeSection,
} = require("../../DataBase/models/index.js");
const {
  PRODUCT_STATUS,
  HOME_SECTION,
  HOME_SECTION_VALUES,
} = require("../../DataBase/models/enums.js");
const catalogQuery = require("./catalogQuery.service.js");
const {
  COMMUNITY_FAVORITES_WINDOW_DAYS,
  fetchUnitsSold,
} = require("./bestSellers.service.js");
const HttpError = require("../../Utils/HttpError.js");

const HOME_SECTION_SIZE = 4;
const NEW_ARRIVAL_WINDOW_DAYS = 30;

const SECTION_KEYS = {
  [HOME_SECTION.FEATURED]: "featured",
  [HOME_SECTION.NEW_ARRIVALS]: "newArrivals",
  [HOME_SECTION.FAVORITES]: "communityFavorites",
};

const BADGE_BY_SECTION = {
  [HOME_SECTION.FEATURED]: null,
  [HOME_SECTION.NEW_ARRIVALS]: "nuevo",
  [HOME_SECTION.FAVORITES]: "bestseller",
};

const publishedWhere = () => ({
  status: PRODUCT_STATUS.ACTIVE,
  active: true,
});

const sinceDays = (days) => new Date(Date.now() - Number(days) * 86400000);

const coverImage = (product) => {
  const images = Array.isArray(product?.images) ? product.images : [];
  const first = images[0];
  if (!first) return null;
  if (typeof first === "string") return first || null;
  return first.url ?? null;
};

// Filas curadas de una seccion, ya con el producto y sus categorias.
const loadCurated = async (section) =>
  ProductHomeSection.findAll({
    where: { section },
    include: [
      {
        model: Product,
        as: "product",
        required: true,
        where: publishedWhere(),
        include: [catalogQuery.categoryInclude()],
      },
    ],
    order: [
      [
        literal(
          `CASE WHEN "ProductHomeSection"."source" = 'manual' THEN 0 ELSE 1 END`,
        ),
        "ASC",
      ],
      ["position", "ASC"],
    ],
  });

// Candidatos automaticos por seccion (sin los ya curados).
const automaticCandidates = async (section, excludeIds, take) => {
  const exclude = { [Op.notIn]: excludeIds.length > 0 ? excludeIds : ["00000000-0000-0000-0000-000000000000"] };
  const include = [catalogQuery.categoryInclude()];

  if (section === HOME_SECTION.FEATURED) {
    return Product.findAll({
      where: { ...publishedWhere(), id: exclude },
      include,
      order: [
        ["destacadas", "DESC"],
        ["createdAt", "DESC"],
      ],
      limit: take,
    });
  }

  if (section === HOME_SECTION.NEW_ARRIVALS) {
    // Primero lo publicado dentro de la ventana de 30 dias; despues el resto,
    // siempre con `publishedAt` y, si no existe, `createdAt`.
    const rows = await Product.findAll({
      where: { ...publishedWhere(), id: exclude },
      include,
      order: [
        [literal(`COALESCE("Product"."publishedAt", "Product"."createdAt")`), "DESC"],
      ],
      limit: 60,
    });
    const since = sinceDays(NEW_ARRIVAL_WINDOW_DAYS);
    const recent = [];
    const older = [];
    for (const row of rows) {
      const publishedAt = row.publishedAt ?? row.createdAt;
      if (publishedAt && new Date(publishedAt) >= since) recent.push(row);
      else older.push(row);
    }
    return [...recent, ...older];
  }

  // Favoritos: ranking real por unidades vendidas (90 dias). Si no hay ventas
  // queda vacio y la semilla `default` (Fase 4) es la que llena la seccion.
  const ranking = await fetchUnitsSold({
    days: COMMUNITY_FAVORITES_WINDOW_DAYS,
    limit: 100,
  });
  const rankedIds = ranking
    .map((row) => row.productId)
    .filter((id) => !excludeIds.includes(id))
    .slice(0, take);

  if (rankedIds.length === 0) return [];

  const products = await Product.findAll({
    where: { ...publishedWhere(), id: rankedIds },
    include,
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  return rankedIds.map((id) => byId.get(id)).filter(Boolean);
};

const buildSection = async (section) => {
  const curated = await loadCurated(section);
  const curatedProducts = curated.map((row) => row.product).filter(Boolean);
  const curatedIds = curatedProducts.map((product) => product.id);
  const missing = Math.max(HOME_SECTION_SIZE - curatedProducts.length, 0);

  let fillers = [];
  if (missing > 0) {
    fillers = await automaticCandidates(section, curatedIds, HOME_SECTION_SIZE);
    fillers = fillers.slice(0, missing);
  }

  return [...curatedProducts, ...fillers].slice(0, HOME_SECTION_SIZE);
};

const toPublic = (product, section) => ({
  ...catalogQuery.publicShape(product),
  badge: BADGE_BY_SECTION[section] ?? null,
  categoryLabel: product.categories?.[0]?.name ?? null,
});

// GET /api/home
const getHomePayload = async () => {
  const [featured, newArrivals, communityFavorites, categories] =
    await Promise.all([
      buildSection(HOME_SECTION.FEATURED),
      buildSection(HOME_SECTION.NEW_ARRIVALS),
      buildSection(HOME_SECTION.FAVORITES),
      Category.findAll({
        where: { isActive: true },
        attributes: ["id", "name", "slug", "description"],
        order: [
          ["sortOrder", "ASC"],
          ["name", "ASC"],
        ],
      }),
    ]);

  return {
    sections: {
      featured: featured.map((product) => toPublic(product, HOME_SECTION.FEATURED)),
      newArrivals: newArrivals.map((product) =>
        toPublic(product, HOME_SECTION.NEW_ARRIVALS),
      ),
      communityFavorites: communityFavorites.map((product) =>
        toPublic(product, HOME_SECTION.FAVORITES),
      ),
    },
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description ?? null,
    })),
  };
};

const unitsForProductIds = async (productIds) => {
  if (productIds.length === 0) return new Map();
  const rows = await fetchUnitsSold({
    days: COMMUNITY_FAVORITES_WINDOW_DAYS,
    limit: 1000,
    productIds,
  });
  return new Map(rows.map((row) => [row.productId, row.units]));
};

const toAdminSlot = (productId, product, position, unitsSold) => ({
  productId,
  name: product?.name ?? "",
  sku: product?.sku ?? "",
  position,
  unitsSold: unitsSold ?? 0,
  image: coverImage(product),
});

// GET /api/admin/products/home-sections
const getAdminHomeSections = async () => {
  const sections = await Promise.all(
    HOME_SECTION_VALUES.map(async (section) => {
      const rows = await ProductHomeSection.findAll({
        where: { section },
        include: [
          {
            model: Product,
            as: "product",
            required: false,
            include: [catalogQuery.categoryInclude()],
          },
        ],
        order: [
          [
            literal(
              `CASE WHEN "ProductHomeSection"."source" = 'manual' THEN 0 ELSE 1 END`,
            ),
            "ASC",
          ],
          ["position", "ASC"],
        ],
      });
      return { section, rows };
    }),
  );

  const allIds = sections.flatMap(({ rows }) =>
    rows.map((row) => row.productId),
  );
  const units = await unitsForProductIds(allIds);

  const payload = {};
  for (const { section, rows } of sections) {
    payload[SECTION_KEYS[section]] = rows.map((row, index) =>
      toAdminSlot(
        row.productId,
        row.product,
        row.position ?? index + 1,
        units.get(row.productId) ?? 0,
      ),
    );
  }

  const rankingRows = await fetchUnitsSold({
    days: COMMUNITY_FAVORITES_WINDOW_DAYS,
    limit: 20,
  });
  const rankingIds = rankingRows.map((row) => row.productId);
  const rankingProducts = await Product.findAll({
    where: { ...publishedWhere(), id: rankingIds },
    attributes: ["id", "name", "sku", "images"],
  });
  const rankingById = new Map(
    rankingProducts.map((product) => [product.id, product]),
  );

  payload.ranking = rankingRows
    .filter((row) => rankingById.has(row.productId))
    .map((row, index) =>
      toAdminSlot(row.productId, rankingById.get(row.productId), index + 1, row.units),
    );

  return payload;
};

const normalizeProductIds = (productIds) => {
  if (!Array.isArray(productIds)) {
    throw new HttpError(400, "productIds debe ser un arreglo");
  }
  const ids = productIds.map((value) => String(value || "").trim());
  if (ids.some((id) => !id)) {
    throw new HttpError(400, "productIds contiene un identificador vacío");
  }
  if (new Set(ids).size !== ids.length) {
    throw new HttpError(422, "No se puede repetir un producto en la misma sección");
  }
  if (ids.length > HOME_SECTION_SIZE) {
    throw new HttpError(422, "Máximo 4 productos por sección");
  }
  return ids;
};

// PUT /api/admin/products/home-sections/:section
const replaceSection = async (section, productIds) => {
  const key = String(section || "").trim();
  if (!HOME_SECTION_VALUES.includes(key)) {
    throw new HttpError(400, "La sección no es válida");
  }

  const ids = normalizeProductIds(productIds);

  if (ids.length > 0) {
    const found = await Product.findAll({
      where: { id: ids, ...publishedWhere() },
      attributes: ["id"],
    });
    if (found.length !== ids.length) {
      throw new HttpError(
        422,
        "Algún producto no existe o no está publicado en la tienda",
      );
    }
  }

  await sequelize.transaction(async (transaction) => {
    await ProductHomeSection.destroy({ where: { section: key }, transaction });
    if (ids.length > 0) {
      await ProductHomeSection.bulkCreate(
        ids.map((productId, index) => ({
          productId,
          section: key,
          position: index + 1,
          source: "manual",
        })),
        { transaction },
      );
    }
  });

  return { section: key, productIds: ids };
};

module.exports = {
  HOME_SECTION_SIZE,
  NEW_ARRIVAL_WINDOW_DAYS,
  getHomePayload,
  getAdminHomeSections,
  replaceSection,
};
