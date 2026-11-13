// Pruebas de ADM-2: vista de detalle y transiciones permitidas.
//
// Son pruebas unitarias de la capa de presentacion (`decorateAdminOrder`).
// No tocan la base: reciben el pedido y los SyncLog ya cargados.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

process.chdir(path.join(__dirname, ".."));

const {
  decorateAdminOrder,
  allowedFulfillmentTransitions,
} = require("../Services/adminOrders.js");

test("el detalle traduce el estado del proveedor y nunca expone el crudo", () => {
  const order = {
    id: "11111111-1111-4111-8111-111111111111",
    orderNumber: "UPBUY-2026-000001",
    fulfillmentStatus: "pending_payment",
    paymentState: "unpaid",
    provider: "vendelo",
    providerOrderId: "V-9001",
    providerStatus: "pending",
    providerOutOfSync: true,
    manualOverride: false,
  };

  const data = decorateAdminOrder(order, [
    {
      id: "log-1",
      provider: "vendelo",
      direction: "in",
      attempt: 2,
      ok: false,
      error: "timeout del proveedor",
      createdAt: "2026-11-13T12:00:00.000Z",
    },
  ]);

  assert.equal("providerStatus" in data, false);
  assert.equal(JSON.stringify(data).includes("pending\""), false);

  assert.equal(data.providerSync.provider, "vendelo");
  assert.equal(data.providerSync.providerOrderId, "V-9001");
  assert.equal(data.providerSync.fulfillmentStatus, "pending_payment");
  assert.equal(data.providerSync.fulfillmentLabel, "Pendiente de pago");
  assert.equal(data.providerSync.paymentState, "unpaid");
  assert.equal(data.providerSync.paymentLabel, "Sin pagar");
  assert.equal(data.providerSync.outOfSync, true);
  assert.equal(data.providerSync.lastSyncOk, false);
  assert.equal(data.providerSync.lastSyncDirection, "in");
  assert.equal(data.providerSync.lastSyncError, "timeout del proveedor");
  assert.equal(data.lastSyncAt, "2026-11-13T12:00:00.000Z");
  assert.equal(data.lastSyncOk, false);
});

test("un pedido sin proveedor devuelve providerSync vacio y sin errores", () => {
  const data = decorateAdminOrder(
    {
      fulfillmentStatus: "pending_payment",
      paymentState: "unpaid",
      provider: null,
      providerStatus: null,
    },
    [],
  );

  assert.equal(data.providerSync.provider, null);
  assert.equal(data.providerSync.outOfSync, false);
  assert.equal(data.providerSync.lastSyncAt, null);
  assert.equal(data.providerSync.lastSyncOk, null);
  assert.equal(data.providerSync.fulfillmentStatus, null);
});

test("las transiciones permitidas salen de la maquina de estados", () => {
  assert.deepEqual(allowedFulfillmentTransitions("pending_payment"), [
    {
      value: "paid",
      label: "Pagado",
      requiresTracking: false,
      requiresStepUp: false,
    },
    {
      value: "cancelled",
      label: "Cancelado",
      requiresTracking: false,
      requiresStepUp: true,
    },
  ]);

  const shipped = allowedFulfillmentTransitions("shipped");
  assert.equal(shipped[0].value, "delivered");
  assert.equal(shipped[1].value, "cancelled");
  assert.equal(shipped[1].requiresStepUp, true);

  // delivered y cancelled son terminales.
  assert.deepEqual(allowedFulfillmentTransitions("delivered"), []);
  assert.deepEqual(allowedFulfillmentTransitions("cancelled"), []);

  // shipped es el unico estado que exige guia al entrar.
  assert.equal(
    allowedFulfillmentTransitions("packing").find(
      (item) => item.value === "shipped",
    ).requiresTracking,
    true,
  );
});
