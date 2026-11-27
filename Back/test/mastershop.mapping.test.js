// Pruebas de integracion (necesitan base local; se saltan si no hay) del mapeo
// de items de pedido a variantes de MasterShop.
//
// Foco: los pedidos multivariante deben resolverse por el `variantId` exacto
// que guardo el checkout (`order_items.variantId` -> supplier_product_variations),
// y solo caer a talla/color cuando no haya variante guardada.
process.chdir(require("path").join(__dirname, ".."));

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  sequelize,
  Supplier,
  SupplierProduct,
  SupplierProductVariation,
  Product,
} = require("../DataBase/models/index.js");
const { resolveOrderItem } = require("../Services/mastershopMapping.service.js");

let dbError = null;

test.before(async () => {
  try {
    await sequelize.authenticate();
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

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

const ensureSupplier = async (slug) => {
  const found = await Supplier.findOne({ where: { slug } });
  if (found) return { supplier: found, created: false };
  const supplier = await Supplier.create({ name: slug, slug, isActive: true });
  return { supplier, created: true };
};

// Crea un producto con DOS variantes (talla L, colores ROJO y AZUL).
const withVariants = async (fn, { slug = "mastershop", provider = "mastershop" } = {}) => {
  const { supplier, created } = await ensureSupplier(slug);
  const externalId = String(Date.now());
  const supplierProduct = await SupplierProduct.create({
    supplierId: supplier.id,
    externalId,
    name: "Producto multivariante",
  });
  const rojo = await SupplierProductVariation.create({
    supplierProductId: supplierProduct.id,
    externalId: `${externalId}1`,
    sku: "SKU-ROJO",
    attributes: { size: "L", color: "ROJO" },
    quantity: 10,
    available: true,
    rawData: { weight: 0.5 },
  });
  const azul = await SupplierProductVariation.create({
    supplierProductId: supplierProduct.id,
    externalId: `${externalId}2`,
    sku: "SKU-AZUL",
    attributes: { size: "L", color: "AZUL" },
    quantity: 10,
    available: true,
    rawData: { weight: 0.5 },
  });

  const product = await Product.create({
    sku: `map-${unique()}`,
    name: "Producto multivariante",
    provider,
    supplierId: supplier.id,
    supplierProductId: supplierProduct.id,
    price: 10000,
    cost: 0,
    status: "active",
  });

  try {
    return await fn({ product, rojo, azul, supplierProduct, supplier });
  } finally {
    await Product.destroy({ where: { id: product.id } }).catch(() => {});
    await SupplierProductVariation.destroy({
      where: { supplierProductId: supplierProduct.id },
    }).catch(() => {});
    await SupplierProduct.destroy({ where: { id: supplierProduct.id } }).catch(() => {});
    if (created) await supplier.destroy().catch(() => {});
  }
};

test("variantId exacto resuelve aunque la linea no traiga talla ni color", async (t) => {
  if (skipIfNoDb(t)) return;

  await withVariants(async ({ product, azul }) => {
    const resolution = await resolveOrderItem({
      orderItem: {
        productId: product.id,
        variantId: azul.id,
        size: null,
        shirtColor: null,
      },
    });

    assert.equal(resolution.ok, true);
    assert.equal(resolution.reason, "resuelto_por_variante_id");
    assert.equal(resolution.idVariant, Number(azul.externalId));
    assert.equal(resolution.sku, "SKU-AZUL");
  });
});

test("sin variantId y sin color, un producto multivariante es ambiguo", async (t) => {
  if (skipIfNoDb(t)) return;

  await withVariants(async ({ product }) => {
    const resolution = await resolveOrderItem({
      orderItem: {
        productId: product.id,
        variantId: null,
        size: "L",
        shirtColor: null,
      },
    });

    assert.equal(resolution.ok, false);
    assert.equal(resolution.reason, "ambiguo");
    assert.ok(Array.isArray(resolution.candidates));
    assert.equal(resolution.candidates.length, 2);
  });
});

test("sin variantId, talla + color resuelven la variante exacta", async (t) => {
  if (skipIfNoDb(t)) return;

  await withVariants(async ({ product, azul }) => {
    const resolution = await resolveOrderItem({
      orderItem: {
        productId: product.id,
        variantId: null,
        size: "L",
        shirtColor: "AZUL",
      },
    });

    assert.equal(resolution.ok, true);
    assert.equal(resolution.idVariant, Number(azul.externalId));
    assert.equal(resolution.sku, "SKU-AZUL");
  });
});

test("un variantId que ya no existe cae al respaldo por talla/color (no falla de golpe)", async (t) => {
  if (skipIfNoDb(t)) return;

  await withVariants(async ({ product }) => {
    const resolution = await resolveOrderItem({
      orderItem: {
        productId: product.id,
        variantId: "00000000-0000-0000-0000-000000000000",
        size: "L",
        shirtColor: null,
      },
    });

    // Sin color, el respaldo es ambiguo (no elige una variante al azar).
    assert.equal(resolution.ok, false);
    assert.equal(resolution.reason, "ambiguo");
  });
});

test("un producto de otro proveedor no se mapea como MasterShop", async (t) => {
  if (skipIfNoDb(t)) return;

  await withVariants(
    async ({ product, rojo }) => {
      const resolution = await resolveOrderItem({
        orderItem: {
          productId: product.id,
          variantId: rojo.id,
          size: "L",
          shirtColor: "ROJO",
        },
      });

      assert.equal(resolution.ok, false);
      assert.equal(resolution.reason, "proveedor_no_mastershop");
    },
    { slug: "test-otro-proveedor", provider: "test-otro-proveedor" },
  );
});