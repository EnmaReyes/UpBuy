// Prueba end-to-end del webhook de Wompi sobre un pedido y pago de PRUEBA
// creados en la base LOCAL y eliminados al final.
//
// Requiere el servidor corriendo (npm run dev) y la base local disponible.
//
// Casos:
//   A. APPROVED valido              -> applied true, pago/estado = aprobado
//   B. Repetir el mismo evento      -> applied false, reason ya_procesado
//   C. Otra transaccion, misma ref  -> applied false, reason otra_transaccion
//   D. Monto distinto               -> applied false, reason monto_no_coincide
//   E. VOIDED sobre pago aprobado   -> applied true, estado = reembolsado
//
// Uso: node scripts/testWebhookApplied.js

process.chdir(require("path").join(__dirname, ".."));

const crypto = require("crypto");
const { WOMPI_EVENTS_SECRET, WOMPI_ENV } = require("../config.js");
const {
  sequelize,
  Order,
  Payment,
  OrderStatusHistory,
} = require("../DataBase/models/index.js");
const { ORDER_STATUS, PAYMENT_STATUS } = require("../DataBase/models/enums.js");

const API_URL = process.env.API_TEST_URL || "http://localhost:3000";

const sha256 = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

const signar = (event) => {
  const values = event.signature.properties.map((property) => {
    let current = event.data;
    for (const key of property.split(".")) {
      if (current === undefined || current === null) return undefined;
      current = current[key];
    }
    return current;
  });
  const checksum = sha256(`${values.join("")}${event.timestamp}${WOMPI_EVENTS_SECRET}`);
  event.signature.checksum = checksum;
  return checksum;
};

const buildEvent = ({ reference, amountInCents, currency, id, status }) => {
  const event = {
    event: "transaction.updated",
    environment: WOMPI_ENV,
    timestamp: Math.floor(Date.now() / 1000),
    data: {
      transaction: {
        id,
        reference,
        status,
        amount_in_cents: amountInCents,
        currency,
        payment_method_type: "CARD",
        status_message: "Evento sintetico local",
      },
    },
    signature: {
      properties: [
        "transaction.id",
        "transaction.status",
        "transaction.amount_in_cents",
      ],
    },
  };
  signar(event);
  return event;
};

const post = async (event) => {
  const response = await fetch(`${API_URL}/api/payments/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    // sin cuerpo
  }
  return { status: response.status, body };
};

const results = [];
const check = (name, condition, detalle) => {
  results.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? "OK  " : "FAIL"} ${name} -> ${detalle}`);
};

const rnd = () => crypto.randomBytes(6).toString("hex");

(async () => {
  const ref1 = `TEST-APROBADO-${rnd()}`;
  const ref2 = `TEST-MONTO-${rnd()}`;
  const amount = 1234500; // 12.345 COP

  let order;
  let order2;

  try {
    order = await Order.create({
      orderNumber: `TEST-${rnd()}`,
      userId: null,
      status: ORDER_STATUS.PENDIENTE_PAGO,
      paymentStatus: PAYMENT_STATUS.PENDIENTE,
      currency: "COP",
      subtotal: 12345,
      shippingCost: 0,
      discountTotal: 0,
      total: 12345,
      recipientName: "Prueba Local",
      phone: "3000000000",
    });

    order2 = await Order.create({
      orderNumber: `TEST-${rnd()}`,
      userId: null,
      status: ORDER_STATUS.PENDIENTE_PAGO,
      paymentStatus: PAYMENT_STATUS.PENDIENTE,
      currency: "COP",
      subtotal: 12345,
      shippingCost: 0,
      discountTotal: 0,
      total: 12345,
      recipientName: "Prueba Local 2",
      phone: "3000000001",
    });

    const p1 = await Payment.create({
      orderId: order.id,
      provider: "wompi",
      reference: ref1,
      status: PAYMENT_STATUS.PENDIENTE,
      amountInCents: amount,
      currency: "COP",
    });

    await Payment.create({
      orderId: order2.id,
      provider: "wompi",
      reference: ref2,
      status: PAYMENT_STATUS.PENDIENTE,
      amountInCents: amount,
      currency: "COP",
    });

    // A. Aprobado valido
    const txId = `local-approved-${rnd()}`;
    const rA = await post(
      buildEvent({ reference: ref1, amountInCents: amount, currency: "COP", id: txId, status: "APPROVED" }),
    );
    await p1.reload();
    await order.reload();
    check(
      "A. aprobado valido",
      rA.status === 200 &&
        rA.body?.applied === true &&
        p1.status === PAYMENT_STATUS.APROBADO &&
        order.paymentStatus === PAYMENT_STATUS.APROBADO &&
        order.status === ORDER_STATUS.PAGADO &&
        Boolean(order.paymentApprovedAt),
      `http ${rA.status} ${JSON.stringify(rA.body)} | pago=${p1.status} pedido.paymentStatus=${order.paymentStatus} pedido.status=${order.status}`,
    );

    // B. Repetir el mismo evento (idempotencia)
    const rB = await post(
      buildEvent({ reference: ref1, amountInCents: amount, currency: "COP", id: txId, status: "APPROVED" }),
    );
    check(
      "B. repetido idempotente",
      rB.status === 200 && rB.body?.applied === false && rB.body?.reason === "ya_procesado",
      `http ${rB.status} ${JSON.stringify(rB.body)}`,
    );

    // C. Otro id de transaccion para la misma referencia
    const rC = await post(
      buildEvent({ reference: ref1, amountInCents: amount, currency: "COP", id: `local-otra-${rnd()}`, status: "APPROVED" }),
    );
    check(
      "C. otra transaccion rechazada",
      rC.status === 200 && rC.body?.applied === false && rC.body?.reason === "otra_transaccion",
      `http ${rC.status} ${JSON.stringify(rC.body)}`,
    );

    // D. Monto distinto
    const rD = await post(
      buildEvent({ reference: ref2, amountInCents: amount + 1, currency: "COP", id: `local-monto-${rnd()}`, status: "APPROVED" }),
    );
    check(
      "D. monto no coincide",
      rD.status === 200 && rD.body?.applied === false && rD.body?.reason === "monto_no_coincide",
      `http ${rD.status} ${JSON.stringify(rD.body)}`,
    );

    // E. VOIDED sobre un pago aprobado -> reembolsado
    const rE = await post(
      buildEvent({ reference: ref1, amountInCents: amount, currency: "COP", id: txId, status: "VOIDED" }),
    );
    await p1.reload();
    await order.reload();
    check(
      "E. voided -> reembolsado",
      rE.status === 200 &&
        rE.body?.applied === true &&
        p1.status === PAYMENT_STATUS.REEMBOLSADO &&
        order.paymentStatus === PAYMENT_STATUS.REEMBOLSADO,
      `http ${rE.status} ${JSON.stringify(rE.body)} | pago=${p1.status} pedido=${order.paymentStatus}`,
    );
  } catch (error) {
    check("ejecucion", false, `${error.name}: ${error.message}`);
  } finally {
    try {
      const ids = [order?.id, order2?.id].filter(Boolean);
      if (ids.length) {
        await OrderStatusHistory.destroy({ where: { orderId: ids } });
        await Payment.destroy({ where: { orderId: ids } });
        await Order.destroy({ where: { id: ids } });
        console.log("\nDatos de prueba eliminados.");
      }
    } catch (error) {
      console.error("No se pudieron limpiar los datos de prueba:", error.message);
    }
    await sequelize.close();
  }

  const failures = results.filter((r) => !r.ok).length;
  console.log(failures ? `\n${failures} prueba(s) fallaron` : "\nTodas las pruebas pasaron");
  process.exitCode = failures ? 1 : 0;
})();
