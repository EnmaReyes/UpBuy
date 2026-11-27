// Fase B — pruebas de los huecos detectados en la validacion (Fase A).
//
// Ver Back/docs/validacion-pedidos-mastershop-faseA.md.
//
// Estas pruebas son PURAS (sin red, sin base de datos):
//   - `buildOrderPayload` (payload de POST /api/orders).
//   - `mapAddress` / `mapCustomer` (mapeo snapshot -> contrato MasterShop).
//
// Convencion: cubren lo que exige el contrato de MasterShop y que la Fase A
// detecto como huecos (charset de id_order, weight > 0, nombres solo
// letras/espacios, total con envio, id_variant presente/ausente).
//
// Hallazgo #1 (identificador externo: se crea con
// `order.orderNumber` pero se recupera/conciliacion con la `reference` de
// Wompi) vive dentro de `syncPaidOrderToMastershop`, que necesita base de
// datos: se cubre en la Fase D con una prueba de integracion, no aqui.
process.env.UPBUY_SKIP_DOTENV = "1";
process.env.MASTERSHOP_API_URL = "https://mastershop.test";
process.env.MASTERSHOP_API_KEY = "test-ms-api-key-secreta";
process.env.MASTERSHOP_HTTP_TIMEOUT_MS = "2000";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildOrderPayload,
  isValidEmail,
} = require("../integrations/suppliers/mastershop/mastershop.orders.js");
const {
  mapAddress,
  mapCustomer,
} = require("../Services/mastershopOrders.service.js");

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
    payment_method: "pia",
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
    {
      id_product: 269130,
      id_variant: 753806,
      hasVariants: true,
      quantity: 2,
      sku: "M101",
      name: "Sandalia",
      weight: 0.5,
      price: 65000,
    },
  ],
  additionalCharge: [],
  notes: [],
  tags: ["upbuy", "wompi"],
};

// ---------------------------------------------------------------------------
// Total con envio
// ---------------------------------------------------------------------------

test("el envio viaja en additional_charge y el total debe incluirlo", () => {
  // 2 x 65000 = 130000 (items) + 8000 (envio) = 138000.
  const conEnvio = {
    ...baseInput,
    additionalCharge: [{ type_charge: "shipping", value: 8000 }],
    orderTransaction: { ...baseInput.orderTransaction, total: 138000 },
  };
  const ok = buildOrderPayload(conEnvio);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.payload.additional_charge[0].type_charge, "shipping");
  assert.equal(ok.payload.additional_charge[0].value, 8000);
  assert.equal(ok.payload.order_transaction.total, 138000);
});

test("un total que omite el envio se rechaza (no se envia a MasterShop)", () => {
  const input = {
    ...baseInput,
    additionalCharge: [{ type_charge: "shipping", value: 8000 }],
    orderTransaction: { ...baseInput.orderTransaction, total: 130000 },
  };
  const { errors } = buildOrderPayload(input);
  assert.ok(errors.some((e) => e.includes("total no coincide")));
});

// ---------------------------------------------------------------------------
// id_variant presente / ausente
// ---------------------------------------------------------------------------

test("producto con variantes -> id_variant presente en el payload", () => {
  const { payload, errors } = buildOrderPayload(baseInput);
  assert.deepEqual(errors, []);
  assert.equal(payload.order_items[0].id_variant, 753806);
});

test("producto sin variantes -> id_variant omitido (no null)", () => {
  const input = {
    ...baseInput,
    orderItems: [
      {
        id_product: 269130,
        hasVariants: false,
        quantity: 1,
        sku: null,
        name: "Accesorio",
        weight: 0.5,
        price: 20000,
      },
    ],
    orderTransaction: { ...baseInput.orderTransaction, total: 20000 },
  };
  const { payload, errors } = buildOrderPayload(input);
  assert.deepEqual(errors, []);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.order_items[0], "id_variant"), false);
});

// ---------------------------------------------------------------------------
// id_order: charset
// ---------------------------------------------------------------------------

test("id_order con charset valido (letras, numeros y guiones) se conserva", () => {
  const { payload, errors } = buildOrderPayload(baseInput);
  assert.deepEqual(errors, []);
  assert.equal(payload.id_order, "UPBUY-2026-000011");
});

test("id_order con guiones bajos se rechaza", () => {
  // El contrato avisa que un `_` crea el pedido pero luego rompe
  // GET /api/orders?externalOrderId=... (recuperacion por duplicado).
  const input = { ...baseInput, idOrder: "PED_0001" };
  const { errors } = buildOrderPayload(input);
  assert.ok(errors.some((e) => e.includes("id_order")));
});

// ---------------------------------------------------------------------------
// weight > 0
// ---------------------------------------------------------------------------

test("weight 0 se rechaza (MasterShop exige > 0)", () => {
  const input = {
    ...baseInput,
    orderItems: [{ ...baseInput.orderItems[0], weight: 0 }],
  };
  const { errors } = buildOrderPayload(input);
  assert.ok(errors.some((e) => e.includes("weight")));
});

// ---------------------------------------------------------------------------
// Nombres: solo letras y espacios
// ---------------------------------------------------------------------------

test("mapAddress sanea digitos y simbolos del nombre", () => {
  const address = mapAddress({ recipientName: "Juan123 Perez!" });
  assert.equal(address.first_name, "Juan");
  assert.equal(address.last_name, "Perez");
});

test("mapCustomer sanea digitos y simbolos del nombre", () => {
  const customer = mapCustomer({ recipientName: "Juan123 Perez!" });
  assert.equal(customer.first_name, "Juan");
  assert.equal(customer.last_name, "Perez");
});

// Un nombre normal debe seguir funcionando (no romper lo que ya va bien).
test("un nombre limpio se divide correctamente", () => {
  const address = mapAddress({ recipientName: "Ana Maria Perez" });
  assert.equal(address.first_name, "Ana");
  assert.equal(address.last_name, "Maria Perez");
});

// ---------------------------------------------------------------------------
// Email: forma y dominios de uso especial
// ---------------------------------------------------------------------------

test("isValidEmail acepta correos reales y rechaza especiales/mal formados", () => {
  assert.equal(isValidEmail("ana.perez@upbuy.com"), true);
  assert.equal(isValidEmail("ana+tag@sub.dominio.co"), true);

  assert.equal(isValidEmail("smoke-test@upbuy.local"), false); // mDNS
  assert.equal(isValidEmail("a@b.test"), false); // RFC 2606
  assert.equal(isValidEmail("a@b.invalid"), false);
  assert.equal(isValidEmail("a@b.example"), false);
  assert.equal(isValidEmail("sin-arroba.com"), false);
  assert.equal(isValidEmail("sin-tld@dominio"), false);
  assert.equal(isValidEmail("con espacio@dominio.com"), false);
  assert.equal(isValidEmail(null), false);
});

test("email con dominio .local se rechaza antes de llamar a MasterShop", () => {
  const input = {
    ...baseInput,
    customer: { ...baseInput.customer, email: "smoke-test@upbuy.local" },
  };
  const { payload, errors } = buildOrderPayload(input);
  assert.equal(payload, null);
  assert.ok(errors.some((e) => e.includes("customer.email no es valido")));
});

test("email mal formado se rechaza", () => {
  const input = {
    ...baseInput,
    customer: { ...baseInput.customer, email: "sin-tld@dominio" },
  };
  const { errors } = buildOrderPayload(input);
  assert.ok(errors.some((e) => e.includes("customer.email no es valido")));
});

test("email ausente se rechaza", () => {
  const input = {
    ...baseInput,
    customer: { ...baseInput.customer, email: null },
  };
  const { errors } = buildOrderPayload(input);
  assert.ok(errors.some((e) => e.includes("customer.email es obligatorio")));
});

test("email valido se conserva en el payload", () => {
  const { payload, errors } = buildOrderPayload(baseInput);
  assert.deepEqual(errors, []);
  assert.equal(payload.customer.email, "ana@example.com");
});
