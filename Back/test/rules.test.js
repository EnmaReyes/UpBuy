// Pruebas de las 4 reglas criticas que NO tocan la base de datos.
//
//   node --test test/
//
// Reglas cubiertas:
//   1. Transiciones validas / invalidas (422).
//   2. Efectos COD: shipped -> pending_collection, delivered -> collected.
//   3. Gating de perfil (que datos faltan).
//   4. Calculo de net_profit.

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertFulfillmentTransition,
  assertPaymentTransition,
  applyFulfillmentSideEffects,
  mapProviderToCanonical,
} = require("../Services/statusMachine.js");
const { calculateNetProfit } = require("../Services/orderService.js");
const { findMissingProfileFields } = require("../Services/profile.js");

const NO_ERROR = (fn) => {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
};

// ---------------------------------------------------------------------------
// 1. Transiciones
// ---------------------------------------------------------------------------

test("transiciones de cumplimiento validas", () => {
  assert.equal(NO_ERROR(() => assertFulfillmentTransition("pending_payment", "paid")), null);
  assert.equal(NO_ERROR(() => assertFulfillmentTransition("paid", "packing")), null);
  assert.equal(NO_ERROR(() => assertFulfillmentTransition("packing", "shipped")), null);
  assert.equal(NO_ERROR(() => assertFulfillmentTransition("shipped", "delivered")), null);
});

test("transiciones de cumplimiento invalidas -> 422", () => {
  const error = NO_ERROR(() => assertFulfillmentTransition("paid", "shipped"));
  assert.ok(error, "debio lanzar");
  assert.equal(error.status, 422);

  assert.equal(NO_ERROR(() => assertFulfillmentTransition("delivered", "cancelled")).status, 422);
  assert.equal(NO_ERROR(() => assertFulfillmentTransition("shipped", "shipped")).status, 422);
  assert.equal(NO_ERROR(() => assertFulfillmentTransition("inventado", "paid")).status, 422);
});

test("transiciones de dinero invalidas -> 422", () => {
  assert.equal(NO_ERROR(() => assertPaymentTransition("unpaid", "settled")), null);
  assert.equal(NO_ERROR(() => assertPaymentTransition("unpaid", "pending_collection")), null);
  assert.equal(NO_ERROR(() => assertPaymentTransition("pending_collection", "collected")), null);
  assert.equal(NO_ERROR(() => assertPaymentTransition("collected", "settled")), null);

  assert.equal(NO_ERROR(() => assertPaymentTransition("settled", "collected")).status, 422);
  assert.equal(NO_ERROR(() => assertPaymentTransition("refunded", "settled")).status, 422);
});

// ---------------------------------------------------------------------------
// 2. Efectos COD
// ---------------------------------------------------------------------------

test("shipped sin guia -> 422", () => {
  const error = NO_ERROR(() =>
    applyFulfillmentSideEffects(
      { paymentMethodCode: "cod_dropi", paymentState: "unpaid" },
      "shipped",
    ),
  );
  assert.ok(error);
  assert.equal(error.status, 422);
});

test("shipped en COD promueve el pago a pending_collection", () => {
  const result = applyFulfillmentSideEffects(
    {
      paymentMethodCode: "cod_dropi",
      paymentState: "unpaid",
      trackingNumber: "G-123",
    },
    "shipped",
  );

  assert.equal(result.fulfillmentStatus, "shipped");
  assert.equal(result.paymentState, "pending_collection");
});

test("shipped online no toca el pago", () => {
  const result = applyFulfillmentSideEffects(
    {
      paymentMethodCode: "wompi",
      paymentState: "settled",
      trackingNumber: "G-123",
    },
    "shipped",
  );

  assert.equal(result.paymentState, "settled");
});

test("delivered en COD cobra (collected)", () => {
  const result = applyFulfillmentSideEffects(
    { paymentMethodCode: "cod_vendelo", paymentState: "pending_collection" },
    "delivered",
  );

  assert.equal(result.paymentState, "collected");
});

test("delivered online no inventa un cobro", () => {
  const result = applyFulfillmentSideEffects(
    { paymentMethodCode: "wompi", paymentState: "settled" },
    "delivered",
  );

  assert.equal(result.paymentState, "settled");
});

// ---------------------------------------------------------------------------
// 3. Gating de perfil
// ---------------------------------------------------------------------------

test("perfil incompleto enumera exactamente lo que falta", () => {
  const missing = findMissingProfileFields({
    user: { name: "Ana", lastName: "", phone: null },
    defaultAddress: null,
  });

  assert.deepEqual(missing, ["lastName", "phone", "address"]);
});

test("perfil completo no exige nada", () => {
  const missing = findMissingProfileFields({
    user: { name: "Ana", lastName: "Perez", phone: "+573001234567" },
    defaultAddress: { address: "Calle 1 #2-3" },
  });

  assert.deepEqual(missing, []);
});

test("telefono demasiado corto cuenta como faltante", () => {
  const missing = findMissingProfileFields({
    user: { name: "Ana", lastName: "Perez", phone: "123" },
    defaultAddress: { address: "Calle 1" },
  });

  assert.deepEqual(missing, ["phone"]);
});

// ---------------------------------------------------------------------------
// 4. net_profit
// ---------------------------------------------------------------------------

test("netProfit = ingreso - costos", () => {
  const net = calculateNetProfit({
    subtotal: 100000,
    shippingCost: 10000,
    discountTotal: 5000,
    providerCost: 60000,
    gatewayFee: 3000,
    providerFee: 2000,
  });

  // 100000 + 10000 - 5000 - 60000 - 3000 - 2000
  assert.equal(net, 40000);
});

test("netProfit usa total cuando existe", () => {
  const net = calculateNetProfit({
    subtotal: 100000,
    shippingCost: 10000,
    discountTotal: 0,
    total: 105000,
    providerCost: 50000,
  });

  assert.equal(net, 55000);
});

// ---------------------------------------------------------------------------
// Extra: mapa de proveedores
// ---------------------------------------------------------------------------

test("mapProviderToCanonical entiende Vendelo y Dropi", () => {
  assert.deepEqual(mapProviderToCanonical("vendelo", "shipped"), {
    fulfillmentStatus: "shipped",
  });
  assert.deepEqual(mapProviderToCanonical("dropi", "DELIVERED"), {
    fulfillmentStatus: "delivered",
  });
  assert.deepEqual(mapProviderToCanonical("dropi", "estado_raro"), {});
});
