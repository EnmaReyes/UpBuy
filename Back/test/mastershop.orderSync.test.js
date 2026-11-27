// Pruebas de integracion (necesitan base local; se saltan si no hay) del
// identificador externo de la creacion de pedidos en MasterShop.
//
// Cubren el hallazgo #1 de la Fase A (ver
// Back/docs/validacion-pedidos-mastershop-faseA.md): el `id_order` que se
// manda a MasterShop es `order.orderNumber`, por lo que `msExternalOrderId`
// y la recuperacion por duplicado deben usar ESE valor, NO la `reference` de
// Wompi.
process.chdir(require("path").join(__dirname, ".."));

// Fallback: si el entorno no trae la configuracion de MasterShop, se define una
// de prueba. No se hace `UPBUY_SKIP_DOTENV` para conservar la config de la base.
process.env.MASTERSHOP_API_KEY =
  process.env.MASTERSHOP_API_KEY || "test-ms-api-key-integracion";
process.env.MASTERSHOP_API_URL =
  process.env.MASTERSHOP_API_URL || "https://mastershop.test";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  sequelize,
  Order,
  OrderItem,
  Payment,
  Product,
  Supplier,
  SupplierProduct,
  MastershopOrderAttempt,
  MastershopOrderOutbox,
} = require("../DataBase/models/index.js");
const { PAYMENT_STATUS } = require("../DataBase/models/enums.js");
const {
  syncPaidOrderToMastershop,
  syncOrderToMastershopByOrderId,
  enqueueMastershopOrderIfNeeded,
  retryMastershopOrder,
  buildReconciliationReport,
} = require("../Services/mastershopOrders.service.js");

let dbError = null;

test.before(async () => {
  try {
    await sequelize.authenticate();
    const { ensureMastershopSchema } = require("../DataBase/ensureMastershopSchema.js");
    await ensureMastershopSchema();
  } catch (error) {
    dbError = error;
  }
});

test.after(async () => {
  global.fetch = originalFetch;
  await sequelize.close().catch(() => {});
});

const skipIfNoDb = (t) => {
  if (dbError) {
    t.skip(`sin base de datos: ${dbError.message}`);
    return true;
  }
  return false;
};

const originalFetch = global.fetch;

const jsonResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { entries: () => [] },
  data: body,
  text: async () => (body === undefined ? "" : JSON.stringify(body)),
});

const captureFetch = (handler) => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const response = handler(url, options);
    calls.push({ url, options, response });
    return response;
  };
  return calls;
};

const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

const ensureSupplier = async (slug) => {
  const found = await Supplier.findOne({ where: { slug } });
  if (found) return { supplier: found, created: false };
  const supplier = await Supplier.create({ name: slug, slug, isActive: true });
  return { supplier, created: true };
};

// Crea un pedido pagado con UN item de un producto del proveedor indicado.
// `withWompiPayment: false` simula una venta manual: solo el estado canonico
// del dinero (`paymentState`) acredita el pago.
const seed = async ({
  slug = "mastershop",
  provider = "mastershop",
  withWompiPayment = true,
  paymentState = null,
} = {}) => {
  const s = suffix();
  const { supplier, created: supplierCreated } = await ensureSupplier(slug);

  const supplierProduct = await SupplierProduct.create({
    supplierId: supplier.id,
    // id_product debe ser entero positivo (resolveOrderItem lo valida).
    externalId: String(Date.now()),
    name: "Producto integracion",
  });

  const product = await Product.create({
    sku: `it-${slug}-${s}`,
    name: "Producto integracion",
    provider,
    supplierId: supplier.id,
    supplierProductId: supplierProduct.id,
    price: 65000,
    cost: 0,
    status: "active",
  });

  const order = await Order.create({
    orderNumber: `UPBUY-IT-${Date.now()}${Math.floor(Math.random() * 1000)}`,
    recipientName: "Ana Perez",
    phone: "3001234567",
    email: "ana@example.com",
    subtotal: 65000,
    shippingCost: 0,
    discountTotal: 0,
    total: 65000,
    currency: "COP",
    ...(paymentState ? { paymentState } : {}),
    addressSnapshot: {
      recipientName: "Ana Perez",
      phone: "3001234567",
      email: "ana@example.com",
      address: "Calle 1 # 2-3",
      city: "Medellin",
      department: "Antioquia",
      postalCode: "050001",
    },
  });

  const item = await OrderItem.create({
    orderId: order.id,
    productType: "product",
    productId: product.id,
    title: "Producto integracion",
    unitPrice: 65000,
    quantity: 1,
    lineTotal: 65000,
    supplierProductId: supplierProduct.id,
    nameSnapshot: "Producto integracion",
  });

  const payment = withWompiPayment
    ? await Payment.create({
        orderId: order.id,
        provider: "wompi",
        reference: `ref-it-${s}`,
        status: PAYMENT_STATUS.APROBADO,
        amountInCents: 6500000,
        wompiStatus: "APPROVED",
      })
    : null;

  return { supplier, supplierCreated, supplierProduct, product, order, item, payment };
};

const cleanup = async (ctx) => {
  await MastershopOrderAttempt.destroy({ where: { orderId: ctx.order.id } }).catch(() => {});
  await MastershopOrderOutbox.destroy({ where: { orderId: ctx.order.id } }).catch(() => {});
  if (ctx.payment) {
    await Payment.destroy({ where: { id: ctx.payment.id } }).catch(() => {});
  }
  await OrderItem.destroy({ where: { id: ctx.item.id } }).catch(() => {});
  await Order.destroy({ where: { id: ctx.order.id } }).catch(() => {});
  await Product.destroy({ where: { id: ctx.product.id } }).catch(() => {});
  await SupplierProduct.destroy({ where: { id: ctx.supplierProduct.id } }).catch(() => {});
  if (ctx.supplierCreated) await ctx.supplier.destroy().catch(() => {});
};

test("al crear el pedido, msExternalOrderId es orderNumber (no la reference)", async (t) => {
  if (skipIfNoDb(t)) return;

  const calls = captureFetch(() =>
    jsonResponse(200, { idOrder: 555, status: "Por Confirmar" }),
  );

  const ctx = await seed();
  try {
    const result = await syncPaidOrderToMastershop(ctx.payment.reference);

    assert.equal(result.ok, true);
    assert.equal(result.idOrder, 555);

    await ctx.order.reload();
    assert.equal(Number(ctx.order.msIdOrder), 555);
    assert.equal(ctx.order.msExternalOrderId, ctx.order.orderNumber);
    assert.equal(ctx.order.msSyncState, "synced");

    // El POST manda id_order = orderNumber.
    const post = calls.find((c) => c.options.method === "POST");
    assert.match(post.url, /\/api\/orders$/);
    assert.equal(JSON.parse(post.options.body).id_order, ctx.order.orderNumber);
  } finally {
    await cleanup(ctx);
  }
});

test("duplicado: recupera el idOrder buscando por externalOrderId = orderNumber", async (t) => {
  if (skipIfNoDb(t)) return;

  const calls = captureFetch((url, options) => {
    if (options.method === "POST") {
      return jsonResponse(500, { error: "Código 409 - La orden ya existe" });
    }
    return jsonResponse(200, { idOrder: 777, status: "Por Confirmar" });
  });

  const ctx = await seed();
  try {
    const result = await syncPaidOrderToMastershop(ctx.payment.reference);

    assert.equal(result.idOrder, 777);
    await ctx.order.reload();
    assert.equal(Number(ctx.order.msIdOrder), 777);
    assert.equal(ctx.order.msExternalOrderId, ctx.order.orderNumber);

    const get = calls.find((c) => c.options.method === "GET");
    assert.ok(get, "debe consultar GET /api/orders tras el duplicado");
    assert.match(
      get.url,
      new RegExp(`externalOrderId=${encodeURIComponent(ctx.order.orderNumber)}`),
    );
    assert.ok(
      !get.url.includes(encodeURIComponent(ctx.payment.reference)),
      "no debe usar la reference de Wompi para recuperar el pedido",
    );
  } finally {
    await cleanup(ctx);
  }
});

test("la conciliacion solo cuenta pedidos de MasterShop, no de otro proveedor", async (t) => {
  if (skipIfNoDb(t)) return;

  const ms = await seed({ slug: "mastershop", provider: "mastershop" });
  const other = await seed({
    slug: `test-otro-${suffix()}`,
    provider: "test-otro",
  });

  try {
    const report = await buildReconciliationReport({});
    const numbers = report.approvedWithoutMsOrder.map((row) => row.orderNumber);

    assert.ok(
      numbers.includes(ms.order.orderNumber),
      "debe incluir el pedido de MasterShop sin msIdOrder",
    );
    assert.ok(
      !numbers.includes(other.order.orderNumber),
      "NO debe incluir el pedido de otro proveedor",
    );
  } finally {
    await cleanup(ms);
    await cleanup(other);
  }
});

test("una venta manual pagada se encola sin pago de Wompi", async (t) => {
  if (skipIfNoDb(t)) return;

  const ctx = await seed({ withWompiPayment: false, paymentState: "settled" });
  try {
    const result = await enqueueMastershopOrderIfNeeded({
      orderId: ctx.order.id,
    });

    assert.equal(result.enqueued, true);

    const row = await MastershopOrderOutbox.findOne({
      where: { orderId: ctx.order.id },
    });
    assert.equal(row.status, "pending");

    await ctx.order.reload();
    assert.equal(ctx.order.msSyncState, "pending");
  } finally {
    await cleanup(ctx);
  }
});

test("una venta manual sin pagar no se encola", async (t) => {
  if (skipIfNoDb(t)) return;

  const ctx = await seed({ withWompiPayment: false, paymentState: "unpaid" });
  try {
    const result = await enqueueMastershopOrderIfNeeded({
      orderId: ctx.order.id,
    });

    assert.equal(result.enqueued, false);
    assert.match(result.reason, /^pedido_no_pagado/);

    const row = await MastershopOrderOutbox.findOne({
      where: { orderId: ctx.order.id },
    });
    assert.equal(row, null);
  } finally {
    await cleanup(ctx);
  }
});

test("un pedido de otro proveedor no se encola para MasterShop", async (t) => {
  if (skipIfNoDb(t)) return;

  const ctx = await seed({
    slug: `test-otro-${suffix()}`,
    provider: "test-otro",
    withWompiPayment: false,
    paymentState: "settled",
  });
  try {
    const result = await enqueueMastershopOrderIfNeeded({
      orderId: ctx.order.id,
    });

    assert.equal(result.enqueued, false);
    assert.equal(result.reason, "proveedor_no_soportado");

    const row = await MastershopOrderOutbox.findOne({
      where: { orderId: ctx.order.id },
    });
    assert.equal(row, null);
  } finally {
    await cleanup(ctx);
  }
});

test("se crea en MasterShop por id de pedido sin exigir pago de Wompi", async (t) => {
  if (skipIfNoDb(t)) return;

  const calls = captureFetch(() =>
    jsonResponse(200, { idOrder: 888, status: "Por Confirmar" }),
  );
  const ctx = await seed({ withWompiPayment: false, paymentState: "settled" });

  try {
    const result = await syncOrderToMastershopByOrderId(ctx.order.id);

    assert.equal(result.ok, true);
    assert.equal(result.idOrder, 888);

    await ctx.order.reload();
    assert.equal(Number(ctx.order.msIdOrder), 888);
    assert.equal(ctx.order.msExternalOrderId, ctx.order.orderNumber);

    const post = calls.find((c) => c.options.method === "POST");
    assert.equal(JSON.parse(post.options.body).id_order, ctx.order.orderNumber);
  } finally {
    await cleanup(ctx);
  }
});

test("el reintento del panel acepta una venta manual pagada", async (t) => {
  if (skipIfNoDb(t)) return;

  captureFetch(() => jsonResponse(200, { idOrder: 999, status: "Por Confirmar" }));
  const ctx = await seed({ withWompiPayment: false, paymentState: "settled" });

  try {
    const result = await retryMastershopOrder({ orderId: ctx.order.id });

    assert.equal(result.ok, true);
    assert.equal(result.action, "create");
    assert.equal(result.idOrder, 999);

    await ctx.order.reload();
    assert.equal(Number(ctx.order.msIdOrder), 999);
  } finally {
    await cleanup(ctx);
  }
});
