// Pruebas PURAS de buildOrderPayload (sin red).
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildOrderPayload } = require("../integrations/suppliers/mastershop/mastershop.orders.js");

const baseAddress = {
  zip: "050001",
  country: "CO",
  city: "Medellin",
  address1: "Calle 1 # 2-3",
  address2: null,
  full_name: "Ana Perez",
  first_name: "Ana",
  last_name: "Perez",
  phone: "3001234567",
  company: null,
  state: "Antioquia",
  district: null,
};

const baseInput = {
  idOrder: "UPBUY-2026-000011",
  shippingAddress: baseAddress,
  billingAddress: { ...baseAddress },
  orderTransaction: {
    total: 130000,
    currency: "COP",
    payment_method: "Tarjeta",
    payment_gateway: "Wompi",
  },
  customer: {
    full_name: "Ana Perez",
    first_name: "Ana",
    last_name: "Perez",
    phone: "3001234567",
    email: "ana@example.com",
    documentType: null,
    documentNumber: null,
    tags: [],
  },
  orderItems: [
    { id_product: 269130, id_variant: 753806, hasVariants: true, quantity: 2, sku: "M101", name: "Sandalia", weight: 0.5, price: 65000 },
  ],
  additionalCharge: [],
  notes: ["nota"],
  tags: ["upbuy"],
};

test("payload valido con una variante", () => {
  const { payload, errors } = buildOrderPayload(baseInput);
  assert.deepEqual(errors, []);
  assert.equal(payload.id_order, "UPBUY-2026-000011");
  assert.equal(payload.order_transaction.total, 130000);
  assert.equal(payload.order_transaction.currency, "COP");
  assert.equal(payload.order_items[0].id_variant, 753806);
  assert.equal(payload.order_items[0].price, 65000);
  // Las 11 llaves de direccion estan presentes.
  assert.equal(Object.keys(payload.shipping_address).length, 12);
});

test("total = suma exacta de items + cargos", () => {
  const input = {
    ...baseInput,
    orderItems: [
      { id_product: 1, hasVariants: false, quantity: 3, sku: null, name: "A", weight: 0, price: 10000 },
      { id_product: 2, hasVariants: false, quantity: 1, sku: null, name: "B", weight: 0, price: 5000 },
    ],
    additionalCharge: [{ type_charge: "envio", value: 8000 }],
    orderTransaction: { ...baseInput.orderTransaction, total: 43000 },
  };
  const { errors } = buildOrderPayload(input);
  assert.deepEqual(errors, []);
});

test("total declarado incorrecto se rechaza", () => {
  const input = { ...baseInput, orderTransaction: { ...baseInput.orderTransaction, total: 99999 } };
  const { errors } = buildOrderPayload(input);
  assert.ok(errors.some((e) => e.includes("total no coincide")));
});

test("moneda ilegal para el pais se rechaza", () => {
  const input = {
    ...baseInput,
    orderTransaction: { ...baseInput.orderTransaction, currency: "USD" },
  };
  const { errors } = buildOrderPayload(input);
  assert.ok(errors.some((e) => e.includes("no es legal")));
});

test("documentType/documentNumber ambos o ninguno", () => {
  const onlyType = buildOrderPayload({
    ...baseInput,
    customer: { ...baseInput.customer, documentType: "CC" },
  });
  assert.ok(onlyType.errors.some((e) => e.includes("ambos o ninguno")));

  const both = buildOrderPayload({
    ...baseInput,
    customer: { ...baseInput.customer, documentType: "CC", documentNumber: "123" },
  });
  assert.deepEqual(both.errors, []);
});

test("falta id_variant en producto con variantes", () => {
  const input = {
    ...baseInput,
    orderItems: [{ id_product: 269130, hasVariants: true, quantity: 1, sku: "M101", name: "Sandalia", weight: 0.5, price: 65000 }],
  };
  const { errors } = buildOrderPayload(input);
  assert.ok(errors.some((e) => e.includes("id_variant es obligatorio")));
});

test("cantidad cero o negativa se rechaza", () => {
  const input = {
    ...baseInput,
    orderItems: [{ ...baseInput.orderItems[0], quantity: 0 }],
  };
  const { errors } = buildOrderPayload(input);
  assert.ok(errors.some((e) => e.includes("quantity debe ser entero mayor a 0")));
});

test("items duplicados sin consolidar se rechazan", () => {
  const input = {
    ...baseInput,
    orderItems: [baseInput.orderItems[0], { ...baseInput.orderItems[0] }],
  };
  const { errors } = buildOrderPayload(input);
  assert.ok(errors.some((e) => e.includes("duplicado sin consolidar")));
});

test("direccion con llaves ausentes se rellena con null, no se omite", () => {
  const input = {
    ...baseInput,
    shippingAddress: { country: "CO", city: "Medellin" },
  };
  const { payload, errors } = buildOrderPayload(input);
  assert.deepEqual(errors, []);
  assert.equal(payload.shipping_address.address1, null);
  assert.equal(payload.shipping_address.zip, null);
  assert.equal(Object.keys(payload.shipping_address).length, 12);
});

test("carrito vacio se rechaza", () => {
  const input = { ...baseInput, orderItems: [] };
  const { errors } = buildOrderPayload(input);
  assert.ok(errors.some((e) => e.includes("no puede estar vacio")));
});

test("id_product invalido se rechaza", () => {
  const input = {
    ...baseInput,
    orderItems: [{ ...baseInput.orderItems[0], id_product: 0 }],
  };
  const { errors } = buildOrderPayload(input);
  assert.ok(errors.some((e) => e.includes("id_product debe ser entero positivo")));
});
