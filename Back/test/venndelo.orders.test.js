// Pruebas PURAS del payload de creacion de pedido en Venndelo (sin red).
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildVenndeloOrderPayload,
} = require("../Services/venndeloOrders.service.js");
const {
  normalizeCityQuery,
  resolveCity,
  cityCount,
} = require("../integrations/suppliers/venndelo/venndelo.regions.js");

const order = {
  orderNumber: "UPBUY-2026-000011",
  notes: "Entregar en portería",
  addressSnapshot: {
    recipientName: "Ana Pérez",
    phone: "3001234567",
    email: "ana@example.com",
    address: "Calle 1 # 2-3",
    city: "Medellín",
    department: "Antioquia",
  },
};

const item = {
  variation_id: 753806,
  sku: "M101",
  name: "Sandalia",
  unit_price: 65000,
  quantity: 1,
  height: 10,
  width: 20,
  length: 30,
  weight: 0.5,
};

const city = {
  code: "05001000",
  name: "Medellin",
  subdivision_code: "05",
  subdivision_name: "Antioquia",
  service_status: "ACTIVE",
};

test("arma el payload con variation_id y EXTERNAL_PAYMENT", () => {
  const payload = buildVenndeloOrderPayload(order, [item], city);

  assert.equal(payload.external_order_id, "UPBUY-2026-000011-VD");
  assert.equal(payload.payment_method_code, "EXTERNAL_PAYMENT");
  assert.equal(payload.billing_info.first_name, "Ana");
  assert.equal(payload.billing_info.last_name, "Pérez");
  assert.equal(payload.shipping_info.address_1, "Calle 1 # 2-3");
  assert.equal(payload.shipping_info.city_code, "05001000");
  assert.equal(payload.shipping_info.city_name, "Medellin");
  assert.equal(payload.shipping_info.subdivision_code, "05");
  assert.equal(payload.shipping_info.country_code, "CO");
  assert.equal(payload.buyer_note, "Entregar en portería");
  assert.deepEqual(payload.line_items[0], {
    type: "STANDARD",
    variation_id: 753806,
    sku: "M101",
    name: "Sandalia",
    unit_price: 65000,
    height: 10,
    width: 20,
    length: 30,
    dimensions_unit: "CM",
    weight: 0.5,
    weight_unit: "KG",
    quantity: 1,
  });
});

test("omite variation_id y sku cuando no existen, pero mantiene dimensiones", () => {
  const payload = buildVenndeloOrderPayload(
    order,
    [{ ...item, variation_id: null, sku: null }],
    city,
  );
  assert.equal("variation_id" in payload.line_items[0], false);
  assert.equal("sku" in payload.line_items[0], false);
  assert.equal(payload.line_items[0].height, 10);
});

test("rechaza un pedido sin ciudad resuelta", () => {
  assert.throws(
    () => buildVenndeloOrderPayload(order, [item], null),
    (error) => error.status === 400 && /No se pudo resolver la ciudad/.test(error.message),
  );
});

test("rechaza un pedido sin items", () => {
  assert.throws(
    () => buildVenndeloOrderPayload(order, [], city),
    (error) => error.status === 400 && /line_items/.test(error.message),
  );
});

test("normaliza el nombre de ciudad para el catálogo de Venndelo", () => {
  assert.equal(normalizeCityQuery("Medellín"), "medellin");
  assert.equal(normalizeCityQuery("Bogotá D.C."), "bogota");
  assert.equal(normalizeCityQuery("  Valle del Cauca "), "valle del cauca");
});

test("resuelve municipios con código DANE desde el catálogo empaquetado", () => {
  assert.ok(cityCount > 1000);

  const medellin = resolveCity({ city: "Medellín", department: "Antioquia" });
  assert.equal(medellin.code, "05001000");
  assert.equal(medellin.name, "Medellin");
  assert.equal(medellin.subdivision_code, "05");

  const bogota = resolveCity({
    city: "Bogotá D.C.",
    department: "Cundinamarca",
  });
  assert.equal(bogota.code, "11001000");
  assert.equal(bogota.name, "Bogota");

  const cartagena = resolveCity({
    city: "Cartagena",
    department: "Bolívar",
  });
  assert.equal(cartagena.code, "13001000");

  assert.equal(resolveCity({ city: "Ciudad Inventada" }), null);
});