// Pruebas de las reglas administrativas del catalogo contra la base LOCAL.
// Se saltan solas cuando no hay base de datos.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

process.chdir(path.join(__dirname, ".."));

const {
  sequelize,
  Supplier,
  SupplierProduct,
  Product,
  ProductImage,
  Category,
} = require("../DataBase/models/index.js");
const { importPage } = require("../Services/catalog/catalogImport.service.js");
const {
  publishSupplierProduct,
} = require("../Services/catalog/catalogSync.service.js");
const catalogQuery = require("../Services/catalog/catalogQuery.service.js");
const catalogAdmin = require("../Services/catalog/catalogAdmin.service.js");
const {
  PRODUCT_STATUS,
  DEFAULT_CATEGORY_SLUG,
} = require("../DataBase/models/enums.js");

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

const RAW_PRODUCT = (externalId) => ({
  id: externalId,
  name: "Producto administrativo",
  description: "Descripción original",
  processing_time: "2",
  options: [],
  variations: [
    {
      id: "v1",
      option: [],
      quantity: 7,
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
    name: "Proveedor administrativo",
    slug: `admin-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    isActive: true,
  });

  try {
    return await fn(supplier);
  } finally {
    const products = await Product.findAll({
      where: { supplierId: supplier.id },
    });
    for (const product of products) {
      await ProductImage.destroy({ where: { productId: product.id } });
      await product.setCategories([]).catch(() => {});
      await product.destroy();
    }
    await SupplierProduct.destroy({ where: { supplierId: supplier.id } });
    await supplier.destroy();
  }
};

const createSupplierProduct = async (supplier, externalId) => {
  await importPage({
    supplierId: supplier.id,
    items: [RAW_PRODUCT(externalId)],
  });
  return SupplierProduct.findOne({
    where: { supplierId: supplier.id, externalId },
  });
};

test("publicar deja borrador y asigna Sin clasificar", async (t) => {
  if (skipIfNoDb(t)) return;

  await withTempSupplier(async (supplier) => {
    const supplierProduct = await createSupplierProduct(
      supplier,
      `draft-${Date.now()}`,
    );

    const product = await publishSupplierProduct({
      supplierProductId: supplierProduct.id,
    });

    assert.equal(product.status, PRODUCT_STATUS.DRAFT);
    assert.equal(product.active, false);
    assert.equal(product.publishedAt, null);

    const categories = await Category.findAll({
      include: [
        {
          model: Product,
          as: "products",
          where: { id: product.id },
          attributes: [],
          through: { attributes: [] },
        },
      ],
    });
    assert.ok(categories.some((category) => category.slug === DEFAULT_CATEGORY_SLUG));

    const visible = await catalogAdmin.setVisibility({
      productId: product.id,
      visible: true,
    });
    assert.equal(visible.status, PRODUCT_STATUS.ACTIVE);
    assert.equal(visible.active, true);
    assert.ok(
      visible.publishedAt,
      "publicar desde el panel fija la primera fecha de publicacion",
    );
  });
});

test("auto_visible publica activo desde el primer momento", async (t) => {
  if (skipIfNoDb(t)) return;

  await withTempSupplier(async (supplier) => {
    await supplier.update({ publishPolicy: "auto_visible" });
    const supplierProduct = await createSupplierProduct(
      supplier,
      `auto-${Date.now()}`,
    );

    const product = await publishSupplierProduct({
      supplierProductId: supplierProduct.id,
    });

    assert.equal(product.status, PRODUCT_STATUS.ACTIVE);
    assert.equal(product.active, true);
    assert.ok(product.publishedAt, "auto_visible fija publishedAt al publicar");
  });
});

test("republicar respeta imágenes y visibilidad fijadas por el admin", async (t) => {
  if (skipIfNoDb(t)) return;

  await withTempSupplier(async (supplier) => {
    const externalId = `override-${Date.now()}`;
    const supplierProduct = await createSupplierProduct(supplier, externalId);
    const product = await publishSupplierProduct({
      supplierProductId: supplierProduct.id,
      visibility: "visible",
    });

    const customUrl = "https://cdn.upbuy.test/custom.jpg";
    await catalogAdmin.setImages({
      productId: product.id,
      images: [{ url: customUrl }],
    });
    await catalogAdmin.setVisibility({ productId: product.id, visible: false });

    const republished = await publishSupplierProduct({
      supplierProductId: supplierProduct.id,
    });

    assert.equal(republished.active, false);
    assert.equal(republished.status, PRODUCT_STATUS.ACTIVE);
    assert.deepEqual(republished.images, [customUrl]);
  });
});

test("PATCH rechaza editar el stock de un producto de proveedor", async (t) => {
  if (skipIfNoDb(t)) return;

  await withTempSupplier(async (supplier) => {
    const supplierProduct = await createSupplierProduct(
      supplier,
      `stock-${Date.now()}`,
    );
    const product = await publishSupplierProduct({
      supplierProductId: supplierProduct.id,
    });

    await assert.rejects(
      () =>
        catalogQuery.updateProduct({
          productId: product.id,
          patch: { stock: 99 },
        }),
      (error) => error.status === 422,
    );
  });
});

test("el lote devuelve skipped por ids inexistentes y no falla completo", async (t) => {
  if (skipIfNoDb(t)) return;

  await withTempSupplier(async (supplier) => {
    const supplierProduct = await createSupplierProduct(
      supplier,
      `bulk-${Date.now()}`,
    );
    const product = await publishSupplierProduct({
      supplierProductId: supplierProduct.id,
      visibility: "visible",
    });

    const result = await catalogAdmin.bulk({
      ids: [product.id, "00000000-0000-0000-0000-000000000000"],
      action: "hide",
    });

    assert.equal(result.requested, 2);
    assert.equal(result.updated, 1);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].id, "00000000-0000-0000-0000-000000000000");

    const hidden = await Product.findByPk(product.id);
    assert.equal(hidden.active, false);
  });
});

test("restaurar imágenes deshace el override y vuelve al proveedor", async (t) => {
  if (skipIfNoDb(t)) return;

  await withTempSupplier(async (supplier) => {
    const externalId = `restore-${Date.now()}`;
    const supplierProduct = await createSupplierProduct(supplier, externalId);
    const product = await publishSupplierProduct({
      supplierProductId: supplierProduct.id,
    });

    await catalogAdmin.setImages({
      productId: product.id,
      images: [{ url: "https://cdn.upbuy.test/otra.jpg" }],
    });
    const restored = await catalogAdmin.restoreImages({
      productId: product.id,
    });

    assert.deepEqual(restored.images, [
      `https://cdn.example.test/${externalId}/1.jpg`,
    ]);
    assert.ok(!restored.manualOverrides.images);
  });
});

test("la bandeja global muestra los no publicados de todos los proveedores", async (t) => {
  if (skipIfNoDb(t)) return;

  await withTempSupplier(async (supplierA) => {
    await withTempSupplier(async (supplierB) => {
      const stamp = Date.now();
      const externalA = `tray-a-${stamp}`;
      const externalB = `tray-b-${stamp}`;

      const productA = await createSupplierProduct(supplierA, externalA);
      await importPage({
        supplierId: supplierB.id,
        items: [RAW_PRODUCT(externalB)],
      });

      // Uno se publica: deja de estar pendiente.
      await publishSupplierProduct({ supplierProductId: productA.id });

      const result = await catalogQuery.listUnpublished({
        q: "tray-",
        limit: 100,
      });
      const ids = result.products.map((row) => row.id);

      assert.ok(!ids.includes(productA.id), "lo publicado no va en la bandeja");
      assert.ok(
        result.products.some(
          (row) =>
            row.externalId === externalB &&
            row.supplier?.slug === supplierB.slug,
        ),
        "el producto del segundo proveedor debe aparecer con su proveedor",
      );

      const filtered = await catalogQuery.listUnpublished({
        q: "tray-",
        provider: supplierB.slug,
        limit: 100,
      });
      assert.ok(
        filtered.products.every((row) => row.supplier.slug === supplierB.slug),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Alta manual de productos (POST /api/admin/products)
// ---------------------------------------------------------------------------

const uniqueSku = (prefix) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

const cleanupProduct = async (productId) => {
  await ProductImage.destroy({ where: { productId } });
  const product = await Product.findByPk(productId);
  if (product) {
    await product.setCategories([]).catch(() => {});
    await product.destroy();
  }
};

test("el alta manual crea un producto con proveedor manual por defecto", async (t) => {
  if (skipIfNoDb(t)) return;

  const sku = uniqueSku("alta");
  const product = await catalogAdmin.createProduct({
    patch: {
      sku,
      name: "Producto de alta manual",
      price: 45000,
      stock: 3,
      images: ["https://cdn.upbuy.test/alta-1.jpg"],
    },
  });

  try {
    assert.equal(product.provider, "manual");
    assert.equal(product.status, PRODUCT_STATUS.DRAFT);
    assert.equal(product.price, 45000);
    assert.equal(product.stock, 3);
    assert.deepEqual(product.images, ["https://cdn.upbuy.test/alta-1.jpg"]);
    assert.equal(product.gallery.length, 1);
    assert.equal(product.gallery[0].isPrimary, true);
  } finally {
    await cleanupProduct(product.id);
  }
});

test("el alta manual rechaza un SKU repetido", async (t) => {
  if (skipIfNoDb(t)) return;

  const sku = uniqueSku("duplicado");
  const first = await catalogAdmin.createProduct({
    patch: { sku, name: "Primero", price: 1000 },
  });

  try {
    await assert.rejects(
      () =>
        catalogAdmin.createProduct({
          patch: { sku, name: "Segundo", price: 2000 },
        }),
      (error) => error.status === 409,
    );
  } finally {
    await cleanupProduct(first.id);
  }
});

test("el alta manual valida el proveedor asignado", async (t) => {
  if (skipIfNoDb(t)) return;

  await assert.rejects(
    () =>
      catalogAdmin.createProduct({
        patch: {
          sku: uniqueSku("proveedor"),
          name: "Con proveedor invalido",
          price: 1000,
          supplierId: "00000000-0000-0000-0000-000000000000",
        },
      }),
    (error) => error.status === 400,
  );
});

test("el alta manual normaliza moneda y tallas", async (t) => {
  if (skipIfNoDb(t)) return;

  const product = await catalogAdmin.createProduct({
    patch: {
      sku: uniqueSku("normaliza"),
      name: "Producto con tallas",
      price: 12000,
      currency: "usd",
      sizes: [" M ", "M", "", "L", null],
    },
  });

  try {
    assert.equal(product.currency, "USD");
    assert.deepEqual(product.sizes, ["M", "L"]);
  } finally {
    await cleanupProduct(product.id);
  }
});

test("el alta manual deriva el markup del costo y el precio", async (t) => {
  if (skipIfNoDb(t)) return;

  const product = await catalogAdmin.createProduct({
    patch: {
      sku: uniqueSku("markup"),
      name: "Producto con markup derivado",
      cost: 1000,
      price: 1300,
      markup: 999,
    },
  });

  try {
    assert.equal(product.cost, 1000);
    assert.equal(product.markup, 30);
  } finally {
    await cleanupProduct(product.id);
  }
});

test("restoreSync devuelve al proveedor los campos personalizados", async (t) => {
  if (skipIfNoDb(t)) return;

  const product = await catalogAdmin.createProduct({
    patch: { sku: uniqueSku("restore"), name: "Producto a restaurar", price: 1000 },
  });

  try {
    const edited = await catalogQuery.updateProduct({
      productId: product.id,
      patch: { cost: 700, name: "Nombre del admin" },
    });
    assert.equal(edited.manualOverrides.cost, true);
    assert.equal(edited.manualOverrides.name, true);

    const restored = await catalogAdmin.restoreSync({
      productId: product.id,
      fields: ["cost"],
    });
    assert.equal(restored.manualOverrides.cost, undefined);
    assert.equal(restored.manualOverrides.name, true);

    const all = await catalogAdmin.restoreSync({ productId: product.id });
    assert.deepEqual(all.manualOverrides, {});
  } finally {
    await cleanupProduct(product.id);
  }
});

test("el alta manual rechaza un SKU demasiado largo", async (t) => {
  if (skipIfNoDb(t)) return;

  await assert.rejects(
    () =>
      catalogAdmin.createProduct({
        patch: {
          sku: "x".repeat(101),
          name: "SKU largo",
          price: 1000,
        },
      }),
    (error) => error.status === 400,
  );
});

test("el alta manual asigna un proveedor existente y su slug", async (t) => {
  if (skipIfNoDb(t)) return;

  const supplier = await Supplier.create({
    name: "Proveedor de alta",
    slug: `alta-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    isActive: true,
  });

  let product = null;
  try {
    product = await catalogAdmin.createProduct({
      patch: {
        sku: uniqueSku("asignado"),
        name: "Producto con proveedor asignado",
        price: 30000,
        provider: "mastershop",
        supplierId: supplier.id,
        status: "active",
        active: true,
      },
    });

    assert.equal(product.provider, "mastershop");
    assert.equal(product.supplierId, supplier.id);
    assert.equal(product.status, PRODUCT_STATUS.ACTIVE);
    assert.ok(product.publishedAt);
  } finally {
    if (product) await cleanupProduct(product.id);
    await supplier.destroy();
  }
});
