// Pruebas de ADM-4: salud de proveedores y exportacion operativa.
//
// Son unitarias: no tocan la base. Se prueban los helpers puros que alimentan
// el panel (tarjeta de uptime y CSV) para garantizar dos reglas de marca:
//   - nunca se expone el estado crudo del proveedor;
//   - el CSV se puede abrir en Excel (BOM + comillas + tildes).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

process.chdir(path.join(__dirname, ".."));

const { buildHealthService } = require("../Services/adminProviders.js");
const { buildOrdersCsv } = require("../Services/adminOrders.js");

test("la salud convierte fallos parciales en un dia degradado", () => {
  const service = buildHealthService({
    name: "Vendelo",
    days: 3,
    endDate: "2026-11-14",
    events: [
      { ok: false, error: "timeout", createdAt: "2026-11-13T12:00:00.000Z" },
      { ok: true, createdAt: "2026-11-13T13:00:00.000Z" },
    ],
  });

  assert.equal(service.missing, 1);
  assert.equal(service.totalEvents, 2);
  assert.equal(service.failures, 1);
  assert.equal(service.incidents[1].status, "degraded");
  assert.match(service.incidents[1].title, /1 sincronización falló/);
  assert.equal(service.incidents[1].updates[0].note, "timeout");
});

test("si fallan todos los intentos del dia, la salud lo marca como caida", () => {
  const service = buildHealthService({
    name: "Dropi",
    days: 2,
    endDate: "2026-11-14",
    events: [
      { ok: false, error: "500", createdAt: "2026-11-14T12:00:00.000Z" },
      { ok: false, error: "500", createdAt: "2026-11-14T13:00:00.000Z" },
    ],
  });

  assert.equal(service.missing, 1);
  assert.equal(service.incidents[1].status, "down");
  assert.equal(service.incidents[1].minutes, 10);
});

test("un dia sin eventos no genera incidente", () => {
  const service = buildHealthService({
    name: "Vendelo",
    days: 2,
    endDate: "2026-11-14",
    events: [],
  });

  assert.deepEqual(service.incidents, {});
  assert.equal(service.missing, 2);
  assert.equal(service.totalEvents, 0);
});

test("el CSV traduce estados y no filtra el estado crudo del proveedor", () => {
  const csv = buildOrdersCsv([
    {
      orderNumber: "UPBUY-2026-000001",
      createdAt: "2026-11-13T12:00:00.000Z",
      channel: "web",
      recipientName: 'Ana "La Jefa", Pérez',
      phone: "3001234567",
      city: "Medellín",
      department: "Antioquia",
      total: 120000,
      paymentMethodCode: "cod_vendelo",
      paymentState: "collected",
      fulfillmentStatus: "shipped",
      providerOrderId: "V-9001",
      trackingCarrier: "Servientrega",
      trackingNumber: "ABC123",
      providerStatus: "RAW_PROVIDER_STATE",
      items: [
        { title: "Camiseta, negra", size: "M", quantity: 2 },
      ],
    },
  ]);

  assert.ok(csv.startsWith("\uFEFFpedido,"));
  assert.match(csv, /UPBUY-2026-000001/);
  assert.match(csv, /"Ana ""La Jefa"", Pérez"/);
  assert.match(csv, /Contra entrega \(Vendelo\)/);
  assert.match(csv, /Cobrado/);
  assert.match(csv, /Enviado/);
  assert.match(csv, /2x Camiseta, negra \(M\)/);
  assert.doesNotMatch(csv, /RAW_PROVIDER_STATE/);
  assert.doesNotMatch(csv, /providerStatus/);
});
