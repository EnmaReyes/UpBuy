// Pruebas de la curaduria de la Home (secciones y relleno automatico).
// Se saltan solas cuando no hay base de datos.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

process.chdir(path.join(__dirname, ".."));

const {
  sequelize,
  Product,
  Category,
  ProductHomeSection,
  Order,
  OrderItem,
} = require("../DataBase/models/index.js");
const home = require("../Services/catalog/home.service.js");
const catalogQuery = require("../Services/catalog/catalogQuery.service.js");
const { fetchUnitsSold } = require("../Services/catalog/bestSellers.service.js");
const {
  HOME_SECTION,
  FULFILLMENT_STATUS,
} = require("../DataBase/models/enums.js");
const HttpError = require("../Utils/HttpError.js");

let dbError = null;

test.before(async () => {
  try {
    await sequelize.authenticate();
    const { ensureCatalogSchema } = require("../DataBase/ensureCatalogSchema.js");
    await ensureCatalogSchema();
  } catch (error) {
    dbError = error;
  }
});

test.after(async () => {
  await sequelize.close().catch(() => {});
});

const skipIfNoDb = (t) => {
  if (dbError) {
    t.skip(`sin base de datos: ${dbError.message}`);
    return true;
  }
  return false;
};

const withHomeData = async (fn) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const category = await Category.create({
    name: `Home ${suffix}`,
    slug: `home-test-${suffix}`,
    description: null,
    sortOrder: 500,
    isActive: true,
  });

  const products = [];
  const orders = [];

  const makeProduct = async (key, overrides = {}) => {
    const product = await Product.create({
      sku: `HOME-${key}-${suffix}`,
      slug: `home-${key}-${suffix}`,
      name: `Producto ${key} ${suffix}`,
      description: null,
      images: [],
      sizes: [],
      price: 50000,
      stock: 10,
      active: true,
      status: "active",
      provider: "manual",
      destacadas: false,
      ...overrides,
    });
    await product.setCategories([category.id]);
    products.push(product);
    return product;
  };

  const makeSale = async (product, { quantity = 1, cancelled = false } = {}) => {
    const order = await Order.create({
      orderNumber: `HOME-${suffix}-${orders.length + 1}`,
      recipientName: "Cliente de prueba",
      phone: "3000000000",
      fulfillmentStatus: cancelled
        ? FULFILLMENT_STATUS.CANCELLED
        : FULFILLMENT_STATUS.DELIVERED,
      paymentState: "settled",
    });
    orders.push(order);
    await OrderItem.create({
      orderId: order.id,
      productType: "product",
      productId: product.id,
      title: product.name,
      unitPrice: product.price,
      quantity,
      lineTotal: product.price * quantity,
    });
    return order;
  };

  try {
    return await fn({ category, makeProduct, makeSale });
  } finally {
    const ids = products.map((product) => product.id);
    if (ids.length > 0) {
      await ProductHomeSection.destroy({ where: { productId: ids } }).catch(
        () => {},
      );
      await OrderItem.destroy({ where: { productId: ids } }).catch(() => {});
    }
    for (const order of orders) {
      await order.destroy().catch(() => {});
    }
    for (const product of products) {
      await product.setCategories([]).catch(() => {});
      await product.destroy().catch(() => {});
    }
    await category.destroy().catch(() => {});
  }
};

const ids = (rows) => rows.map((row) => row.id);

test("una seccion nunca devuelve mas de 4 productos", async (t) => {
  if (skipIfNoDb(t)) return;

  await withHomeData(async ({ makeProduct }) => {
    const products = [];
    for (let index = 0; index < 6; index += 1) {
      products.push(await makeProduct(`size-${index}`));
    }

    await home.replaceSection(
      HOME_SECTION.FEATURED,
      ids(products.slice(0, 4)),
    );

    const payload = await home.getHomePayload();
    assert.ok(payload.sections.featured.length <= home.HOME_SECTION_SIZE);
    assert.equal(payload.sections.featured.length, 4);

    await home.replaceSection(HOME_SECTION.FEATURED, []);
  });
});

test("la posicion manual define el orden de la seccion", async (t) => {
  if (skipIfNoDb(t)) return;

  await withHomeData(async ({ makeProduct }) => {
    const first = await makeProduct("order-a");
    const second = await makeProduct("order-b");

    await home.replaceSection(HOME_SECTION.FEATURED, [second.id, first.id]);

    const payload = await home.getHomePayload();
    const featuredIds = ids(payload.sections.featured);
    assert.deepEqual(featuredIds.slice(0, 2), [second.id, first.id]);

    await home.replaceSection(HOME_SECTION.FEATURED, []);
  });
});

test("lo curado gana al relleno automatico", async (t) => {
  if (skipIfNoDb(t)) return;

  await withHomeData(async ({ makeProduct }) => {
    const curated = await makeProduct("curated");
    const promoted = await makeProduct("promoted", { destacadas: true });

    await home.replaceSection(HOME_SECTION.FEATURED, [curated.id]);

    const payload = await home.getHomePayload();
    const featuredIds = ids(payload.sections.featured);

    assert.equal(featuredIds[0], curated.id);
    if (featuredIds.includes(promoted.id)) {
      assert.ok(featuredIds.indexOf(promoted.id) > 0);
    }

    await home.replaceSection(HOME_SECTION.FEATURED, []);
  });
});

test("un producto no publicado no aparece en ninguna seccion", async (t) => {
  if (skipIfNoDb(t)) return;

  await withHomeData(async ({ makeProduct }) => {
    const draft = await makeProduct("draft", { status: "draft" });
    const inactive = await makeProduct("inactive", { active: false });

    const payload = await home.getHomePayload();
    const all = [
      ...payload.sections.featured,
      ...payload.sections.newArrivals,
      ...payload.sections.communityFavorites,
    ].map((product) => product.id);

    assert.ok(!all.includes(draft.id));
    assert.ok(!all.includes(inactive.id));
  });
});

test("el ranking ordena por unidades vendidas y excluye cancelados", async (t) => {
  if (skipIfNoDb(t)) return;

  await withHomeData(async ({ makeProduct, makeSale }) => {
    const best = await makeProduct("best");
    const second = await makeProduct("second");
    const cancelled = await makeProduct("cancelled");

    await makeSale(best, { quantity: 3 });
    await makeSale(second, { quantity: 1 });
    await makeSale(cancelled, { quantity: 50, cancelled: true });

    const rows = await fetchUnitsSold({
      productIds: [best.id, second.id, cancelled.id],
    });

    assert.equal(rows[0].productId, best.id);
    assert.equal(rows[0].units, 3);
    assert.equal(rows[1].productId, second.id);
    assert.ok(!rows.some((row) => row.productId === cancelled.id));
  });
});

test("replaceSection rechaza mas de 4, ids repetidos o inexistentes", async (t) => {
  if (skipIfNoDb(t)) return;

  await withHomeData(async ({ makeProduct }) => {
    const products = [];
    for (let index = 0; index < 5; index += 1) {
      products.push(await makeProduct(`invalid-${index}`));
    }

    await assert.rejects(
      () => home.replaceSection(HOME_SECTION.FEATURED, ids(products)),
      (error) => error instanceof HttpError && error.status === 422,
    );

    await assert.rejects(
      () =>
        home.replaceSection(HOME_SECTION.FEATURED, [
          products[0].id,
          products[0].id,
        ]),
      (error) => error instanceof HttpError && error.status === 422,
    );

    await assert.rejects(
      () =>
        home.replaceSection(HOME_SECTION.FEATURED, [
          "00000000-0000-0000-0000-000000000001",
        ]),
      (error) => error instanceof HttpError && error.status === 422,
    );

    await assert.rejects(
      () => home.replaceSection("otra", [products[0].id]),
      (error) => error instanceof HttpError && error.status === 400,
    );
  });
});

test("el badge depende de la seccion donde se muestra", async (t) => {
  if (skipIfNoDb(t)) return;

  await withHomeData(async ({ makeProduct }) => {
    const product = await makeProduct("badge");

    await home.replaceSection(HOME_SECTION.NEW_ARRIVALS, [product.id]);
    await home.replaceSection(HOME_SECTION.FAVORITES, [product.id]);

    const payload = await home.getHomePayload();
    const inNew = payload.sections.newArrivals.find(
      (item) => item.id === product.id,
    );
    const inFavorites = payload.sections.communityFavorites.find(
      (item) => item.id === product.id,
    );

    assert.equal(inNew?.badge, "nuevo");
    assert.equal(inFavorites?.badge, "bestseller");

    await home.replaceSection(HOME_SECTION.NEW_ARRIVALS, []);
    await home.replaceSection(HOME_SECTION.FAVORITES, []);
  });
});

test("GET /api/products acepta new y sort=best_sellers", async (t) => {
  if (skipIfNoDb(t)) return;

  await withHomeData(async ({ category, makeProduct, makeSale }) => {
    const older = await makeProduct("older", {
      createdAt: new Date(Date.now() - 90 * 86400000),
      publishedAt: new Date(Date.now() - 90 * 86400000),
    });
    const recent = await makeProduct("recent");
    const popular = await makeProduct("popular");
    await makeSale(popular, { quantity: 9 });

    const onlyNew = await catalogQuery.listPublished({
      category: category.slug,
      onlyNew: "1",
    });
    assert.ok(!ids(onlyNew.products).includes(older.id));
    assert.ok(ids(onlyNew.products).includes(recent.id));

    const bestSellers = await catalogQuery.listPublished({
      category: category.slug,
      sort: "best_sellers",
    });
    assert.equal(bestSellers.products[0]?.id, popular.id);
  });
});
