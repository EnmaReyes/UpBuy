// Prueba local del webhook de pagos (POST /api/payments/webhook).
// Requiere el servidor corriendo: `npm run dev` en Api/.
//
// Fabrica eventos sinteticos firmados con WOMPI_EVENTS_SECRET y comprueba:
//   1. Sin firma                     -> 401
//   2. Firma con secreto equivocado  -> 401
//   3. Evento no soportado           -> 200 ignored
//   4. transaction.updated valido    -> 200, referencia desconocida
//   5. Ambiente equivocado           -> 200 ignored
//   6. Timestamp en el futuro        -> 401
//
// Ningun caso toca datos reales: la referencia es inventada y el id de la
// transaccion no existe en Wompi.
//
// Uso: node scripts/testWebhookLocal.js

process.chdir(require("path").join(__dirname, ".."));

const crypto = require("crypto");
const { WOMPI_EVENTS_SECRET, WOMPI_ENV } = require("../config.js");

const API_URL = process.env.API_TEST_URL || "http://localhost:3000";

const sha256 = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

// Replica la formula de Wompi: SHA256(valores de properties + timestamp + secret)
const sign = (event, secret = WOMPI_EVENTS_SECRET) => {
  const values = event.signature.properties.map((property) => {
    let current = event.data;
    for (const key of property.split(".")) {
      if (current === undefined || current === null) return undefined;
      current = current[key];
    }
    return current;
  });
  const checksum = sha256(`${values.join("")}${event.timestamp}${secret}`);
  event.signature.checksum = checksum;
  return checksum;
};

const baseEvent = (overrides = {}) => ({
  event: "transaction.updated",
  environment: WOMPI_ENV,
  timestamp: Math.floor(Date.now() / 1000),
  data: {
    transaction: {
      id: "sintetica_local_no_existe",
      reference: `LOCAL-${Date.now()}`,
      status: "APPROVED",
      amount_in_cents: 10000,
      currency: "COP",
      payment_method_type: "CARD",
      status_message: "Evento sintetico de prueba local",
    },
  },
  signature: {
    properties: [
      "transaction.id",
      "transaction.status",
      "transaction.amount_in_cents",
    ],
  },
  ...overrides,
});

const post = async (event, headerChecksum) => {
  const response = await fetch(`${API_URL}/api/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(headerChecksum ? { "X-Event-Checksum": headerChecksum } : {}),
    },
    body: JSON.stringify(event),
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    // respuesta sin cuerpo JSON
  }
  return { status: response.status, body };
};

const results = [];
const check = (name, condition, detalle) => {
  results.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? "OK  " : "FAIL"} ${name} -> ${detalle}`);
};

(async () => {
  if (!WOMPI_EVENTS_SECRET) {
    console.error("Falta WOMPI_EVENTS_SECRET en .env.local");
    process.exit(1);
  }

  // 1. Sin firma
  {
    const r = await post(baseEvent());
    check("sin firma", r.status === 401, `status ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 2. Firma con secreto equivocado
  {
    const event = baseEvent();
    const checksum = sign(event, "secreto_equivocado");
    const r = await post(event, checksum);
    check("firma falsa", r.status === 401, `status ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 3. Evento no soportado, firma valida
  {
    const event = baseEvent({ event: "transaction.created" });
    const checksum = sign(event);
    const r = await post(event, checksum);
    check(
      "evento no soportado",
      r.status === 200 && r.body?.ignored === "evento_no_soportado",
      `status ${r.status}: ${JSON.stringify(r.body)}`,
    );
  }

  // 4. transaction.updated valido pero con referencia desconocida
  {
    const event = baseEvent();
    const checksum = sign(event);
    const r = await post(event, checksum);
    check(
      "referencia desconocida",
      r.status === 200 &&
        r.body?.applied === false &&
        r.body?.reason === "referencia_desconocida",
      `status ${r.status}: ${JSON.stringify(r.body)}`,
    );
  }

  // 5. Ambiente distinto al configurado
  {
    const event = baseEvent({
      environment: WOMPI_ENV === "prod" ? "test" : "prod",
    });
    const checksum = sign(event);
    const r = await post(event, checksum);
    check(
      "ambiente distinto",
      r.status === 200 && r.body?.ignored === "ambiente_distinto",
      `status ${r.status}: ${JSON.stringify(r.body)}`,
    );
  }

  // 6. Timestamp una hora en el futuro (fuera de la tolerancia de 5 min)
  {
    const event = baseEvent({
      timestamp: Math.floor(Date.now() / 1000) + 3600,
    });
    const checksum = sign(event);
    const r = await post(event, checksum);
    check("timestamp futuro", r.status === 401, `status ${r.status}: ${JSON.stringify(r.body)}`);
  }

  const failures = results.filter((r) => !r.ok).length;
  console.log(
    failures ? `\n${failures} prueba(s) fallaron` : "\nTodas las pruebas pasaron",
  );
  process.exit(failures ? 1 : 0);
})();
