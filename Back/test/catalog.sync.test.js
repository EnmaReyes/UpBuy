// Pruebas del catalogo contra la base LOCAL (idempotencia, sincronizacion y
// reglas de negocio). Se saltan si no hay base de datos.
//
// Regla: cada prueba crea un proveedor temporal y lo borra en `finally`. Nunca
// toca datos reales ni productos de Venndelo.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

process.chdir(path.join(__dirname, ".."));

const {
  sequelize,
  Supplier,
  SupplierProduct,
  SupplierProductVariation,
  Product,
  ProductImage,
  Category,
} = require("../DataBase/models/index.js");
const { importPage } = require("../Services/catalog/catalogImport.service.js");
const {
  publishSupplierProduct,
  syncPublishedProducts,
  unpublishProduct,
} = require("../Services/catalog/catalogSync.service.js");

let dbError = null;

test.before(async () => {
  try {
    await sequelize.authenticate();
    // Asegura que las tablas existan (idempotente).
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

const RAW_PRODUCT = (externalId) => ({
  id: externalId,
  name: "Producto de prueba",
  description: "Descripción original",
  processing_time: "2",
  options: [],
  // Los ids de asset de Venndelo son cortos (VARCHAR(20) en la base).
  variations: [
    {
      id: "v1",
      option: [],
      quantity: 10,
      price: 20000,
      sku: `${externalId}-SKU`,
    },
  ],
  assets: [
    {
      id: "a1",
      position: 1,
      url: `https://cdn.example.test/${externalId}/1.jpg`,
      file_name: "1.jpg",
      content_type: "image/jpeg",
      size: 123,
    },
  ],
});

const withTempSupplier = async (fn) => {
  const supplier = await Supplier.create({
    name: "Proveedor de prueba",
    slug: `test-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    isActive: true,
  });

  try {
    return await fn(supplier);
  } finally {
    // Cascada: supplier_products -> variaciones/assets/published (SET NULL).
    const products = await Product.findAll({ where: { supplierId: supplier.id } });
    for (const product of products) {
      await ProductImage.destroy({ where: { productId: product.id } });
      await product.setCategories([]).catch(() => {});
      await product.destroy();
    }
    await SupplierProduct.destroy({ where: { supplierId: supplier.id } });
    await supplier.destroy();
  }
};

test("la importación es idempotente (no duplica productos)", async (t) => {
  if (skipIfNoDb(t)) return;

  await withTempSupplier(async (supplier) => {
    const externalId = `idem-${Date.now()}`;
    const items = [RAW_PRODUCT(externalId)];

    const first = await importPage({ supplierId: supplier.id, items });
    assert.deepEqual(
      { created: first.created, updated: first.updated, unchanged: first.unchanged },
      { created: 1, updated: 0, unchanged: 0 },
    );

    const second = await importPage({ supplierId: supplier.id, items });
    assert.deepEqual(
      { created: second.created, updated: second.updated, unchanged: second.unchanged },
      { created: 0, updated: 0, unchanged: 1 },
    );

    const total = await SupplierProduct.count({ where: { supplierId: supplier.id } });
    assert.equal(total, 1);

    const variations = await SupplierProductVariation.count({
      where: { supplierProductId: (await SupplierProduct.findOne({ where: { supplierId: supplier.id } })).id },
    });
    assert.equal(variations, 1);
  });
});

test("actualiza el stock real y respeta el precio del administrador", async (t) => {
  if (skipIfNoDb(t)) return;

  await withTempSupplier(async (supplier) => {
    const externalId = `sync-${Date.now()}`;
    await importPage({ supplierId: supplier.id, items: [RAW_PRODUCT(externalId)] });
    const supplierProduct = await SupplierProduct.findOne({
      where: { supplierId: supplier.id },
    });

    const product = await publishSupplierProduct({
      supplierProductId: supplierProduct.id,
      price: 55500,
    });
    assert.equal(product.price, 55500);
    assert.equal(product.stock, 10);
    assert.equal(product.cost, 20000);
    assert.equal(product.status, "active");

    // El proveedor cambia stock y nombre; el admin ya fijó el precio.
    await supplierProduct.update({ totalQuantity: 3, name: "Nombre del proveedor" });
    await sequelize.transaction((transaction) =>
      syncPublishedProducts({ supplierId: supplier.id, transaction }),
    );

    const refreshed = await Product.findByPk(product.id);
    assert.equal(refreshed.stock, 3, "el stock sigue al proveedor");
    assert.equal(refreshed.name, "Nombre del proveedor");
    assert.equal(refreshed.price, 55500, "el precio del admin no se pisa");
    assert.equal(refreshed.manualOverrides.price, true);
  });
});

test("sin disponibilidad el producto se desactiva pero NO se borra", async (t) => {
  if (skipIfNoDb(t)) return;

  await withTempSupplier(async (supplier) => {
    const externalId = `out-${Date.now()}`;
    await importPage({ supplierId: supplier.id, items: [RAW_PRODUCT(externalId)] });
    const supplierProduct = await SupplierProduct.findOne({
      where: { supplierId: supplier.id },
    });

    const product = await publishSupplierProduct({
      supplierProductId: supplierProduct.id,
      price: 10000,
    });
    assert.equal(product.active, true);

    await supplierProduct.update({ totalQuantity: 0, availability: false });
    await sequelize.transaction((transaction) =>
      syncPublishedProducts({ supplierId: supplier.id, transaction }),
    );

    const refreshed = await Product.findByPk(product.id);
    assert.ok(refreshed, "el producto debe seguir existiendo");
    assert.equal(refreshed.active, false);
    assert.equal(refreshed.stock, 0);
  });
});

test("despublicar archiva sin borrar", async (t) => {
  if (skipIfNoDb(t)) return;

  await withTempSupplier(async (supplier) => {
    const externalId = `unpub-${Date.now()}`;
    await importPage({ supplierId: supplier.id, items: [RAW_PRODUCT(externalId)] });
    const supplierProduct = await SupplierProduct.findOne({
      where: { supplierId: supplier.id },
    });

    const product = await publishSupplierProduct({
      supplierProductId: supplierProduct.id,
      price: 10000,
    });

    await unpublishProduct({ productId: product.id });

    const refreshed = await Product.findByPk(product.id);
    assert.equal(refreshed.status, "archived");
    assert.equal(refreshed.active, false);
  });
});

test("una imagen repetida no se duplica", async (t) => {
  if (skipIfNoDb(t)) return;

  await withTempSupplier(async (supplier) => {
    const externalId = `img-${Date.now()}`;
    const items = [RAW_PRODUCT(externalId)];

    await importPage({ supplierId: supplier.id, items });
    await importPage({ supplierId: supplier.id, items });

    const supplierProduct = await SupplierProduct.findOne({
      where: { supplierId: supplier.id },
    });
    const product = await publishSupplierProduct({
      supplierProductId: supplierProduct.id,
      price: 10000,
    });

    const images = await ProductImage.count({ where: { productId: product.id } });
    assert.equal(images, 1);

    await sequelize.transaction((transaction) =>
      syncPublishedProducts({ supplierId: supplier.id, transaction }),
    );
    const again = await ProductImage.count({ where: { productId: product.id } });
    assert.equal(again, 1, "sincronizar no duplica imágenes");
  });
});