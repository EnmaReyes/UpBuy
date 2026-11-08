// Prueba de conectividad y configuracion de Wompi (solo lectura).
// No toca la base de datos ni crea transacciones.
//
// Uso: node scripts/testWompi.js   (desde la carpeta Api/)

// config.js carga .env/.env.local relativo al CWD: fijar CWD a la carpeta Api.
process.chdir(require("path").join(__dirname, ".."));

const {
  WOMPI_PUBLIC_KEY,
  WOMPI_PRIVATE_KEY,
  WOMPI_INTEGRITY_SECRET,
  WOMPI_EVENTS_SECRET,
  WOMPI_ENV,
  WOMPI_BASE_URL,
  WOMPI_CHECKOUT_URL,
  WOMPI_EVENT_MAX_AGE_SECONDS,
  FRONTEND_URL,
} = require("../config.js");

const mask = (value) =>
  value ? `${value.slice(0, 9)}... (${value.length} caracteres)` : "(vacio)";

const results = [];
const ok = (name, detalle) => results.push({ name, ok: true, detalle });
const fail = (name, detalle) => results.push({ name, ok: false, detalle });

const getJson = async (url, headers = {}) => {
  const started = Date.now();
  const response = await fetch(url, { headers });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { status: response.status, body, latencyMs: Date.now() - started };
};

(async () => {
  console.log("--- Config Wompi (valores derivados) ---");
  console.log("WOMPI_ENV:", WOMPI_ENV);
  console.log("WOMPI_BASE_URL:", WOMPI_BASE_URL);
  console.log("WOMPI_CHECKOUT_URL:", WOMPI_CHECKOUT_URL);
  console.log("FRONTEND_URL:", FRONTEND_URL);
  console.log("WOMPI_EVENT_MAX_AGE_SECONDS:", WOMPI_EVENT_MAX_AGE_SECONDS);
  console.log("WOMPI_PUBLIC_KEY:", mask(WOMPI_PUBLIC_KEY));
  console.log("WOMPI_PRIVATE_KEY:", mask(WOMPI_PRIVATE_KEY));
  console.log("WOMPI_INTEGRITY_SECRET:", mask(WOMPI_INTEGRITY_SECRET));
  console.log("WOMPI_EVENTS_SECRET:", mask(WOMPI_EVENTS_SECRET));
  console.log("");

  if (!WOMPI_PRIVATE_KEY) {
    fail("llaves", "Falta WOMPI_PRIVATE_KEY en .env.local");
  } else {
    // 1. Autenticacion + conectividad: listar transacciones (solo lectura).
    // Wompi exige from_date, until_date y page para listar; sin ellos responde
    // 422 de validacion, no 401 de autenticacion.
    const hoy = new Date().toISOString().slice(0, 10);
    try {
      const list = await getJson(
        `${WOMPI_BASE_URL}/transactions?from_date=${hoy}&until_date=${hoy}&page=1&page_size=1`,
        { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` },
      );

      if (list.status === 200) {
        const tx = Array.isArray(list.body?.data) ? list.body.data[0] : null;
        ok(
          "API: listar transacciones",
          `status 200 en ${list.latencyMs}ms; ${
            tx
              ? `ultima: ${tx.id} (${tx.status}, ${tx.created_at})`
              : "la cuenta no tiene transacciones todavia"
          }`,
        );

        // 2. Detalle de una transaccion: la misma ruta que usa
        //    POST /api/orders/:id/payment/verify (fetchTransaction).
        if (tx?.id) {
          const detail = await getJson(
            `${WOMPI_BASE_URL}/transactions/${encodeURIComponent(tx.id)}`,
            { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` },
          );
          if (detail.status === 200 && detail.body?.data?.id === tx.id) {
            ok(
              "API: consultar transaccion",
              `status 200 en ${detail.latencyMs}ms (ruta de /payment/verify)`,
            );
          } else {
            fail(
              "API: consultar transaccion",
              `status ${detail.status}: ${JSON.stringify(detail.body).slice(0, 200)}`,
            );
          }
        }
      } else if (list.status === 401) {
        fail(
          "API: listar transacciones",
          "401: la llave privada no es valida para este ambiente (revisa si es de test o de prod)",
        );
      } else {
        fail(
          "API: listar transacciones",
          `status ${list.status}: ${JSON.stringify(list.body).slice(0, 200)}`,
        );
      }
    } catch (error) {
      fail("API: conectividad", `${error.name}: ${error.message}`);
    }

    // 3. Una llave deliberadamente mala debe recibir 401.
    try {
      const bad = await getJson(
        `${WOMPI_BASE_URL}/transactions?from_date=${hoy}&until_date=${hoy}&page=1&page_size=1`,
        { Authorization: "Bearer prv_test_invalida000000000000000000" },
      );
      if (bad.status === 401) {
        ok("API: rechaza llave invalida", "401 como se esperaba");
      } else {
        fail(
          "API: rechaza llave invalida",
          `respondio ${bad.status}, se esperaba 401`,
        );
      }
    } catch (error) {
      fail("API: rechaza llave invalida", `${error.name}: ${error.message}`);
    }
  }

  console.log("");
  console.log("--- Resultados ---");
  for (const r of results) {
    console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name} -> ${r.detalle}`);
  }

  const failures = results.filter((r) => !r.ok).length;
  process.exit(failures ? 1 : 0);
})();
