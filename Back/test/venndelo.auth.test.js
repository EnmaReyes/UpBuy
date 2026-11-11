// Pruebas de la autenticacion OAuth de Venndelo (SIN red real).
//
// Se reemplaza `global.fetch` por un mock que imita a Venndelo, y se verifica:
//   1. Renovacion del access token.
//   2. Single-flight: N llamadas concurrentes = 1 sola renovacion.
//   3. Token proximo a expirar -> se renueva.
//   4. Refresh token rotado -> se propaga y NO rompe.
//   5. 401 en una peticion -> se renueva y se reintenta UNA vez.
//   6. Los tokens completos no aparecen en los logs.

// No cargar .env.local: esta prueba usa un fetch mockeado y credenciales
// ficticias (nunca debe tocar la API real).
process.env.UPBUY_SKIP_DOTENV = "1";

process.env.VENNDELO_CLIENT_ID = "test-client";
process.env.VENNDELO_CLIENT_SECRET = "test-secret";
process.env.VENNDELO_REFRESH_TOKEN = "test-refresh-token";
process.env.VENNDELO_OAUTH_URL = "https://venndelo.test/v1/admin/oauth/token";
process.env.VENNDELO_API_URL = "https://venndelo.test";
process.env.VENNDELO_ADMIN_PATH = "/v1/admin";
process.env.SUPPLIER_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
  "base64",
);

const test = require("node:test");
const assert = require("node:assert/strict");

const auth = require("../integrations/suppliers/venndelo/venndelo.auth.js");
const client = require("../integrations/suppliers/venndelo/venndelo.client.js");

const originalFetch = global.fetch;

const jsonResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { entries: () => [] },
  text: async () => (body === undefined ? "" : JSON.stringify(body)),
});

const tokenBody = (n, extra = {}) => ({
  access_token: `access-token-${n}-abcdefghijklmnop`,
  token_type: "Bearer",
  expires_in: 3600,
  ...extra,
});

test.beforeEach(() => {
  auth.resetCache();
});

test.after(() => {
  global.fetch = originalFetch;
});

test("renueva el access token con grant_type=refresh_token", async () => {
  let received = null;
  global.fetch = async (url, options) => {
    received = { url, options };
    return jsonResponse(200, tokenBody(1));
  };

  const token = await auth.getAccessToken(null);
  assert.equal(token, "access-token-1-abcdefghijklmnop");
  assert.match(received.url, /oauth\/token$/);
  assert.equal(received.options.method, "POST");
  assert.match(received.options.headers["Content-Type"], /x-www-form-urlencoded/);
  assert.match(received.options.body, /grant_type=refresh_token/);
  assert.match(received.options.body, /refresh_token=test-refresh-token/);
  assert.match(received.options.body, /client_secret=test-secret/);
});

test("single-flight: 5 llamadas concurrentes producen 1 renovacion", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return jsonResponse(200, tokenBody(calls));
  };

  const tokens = await Promise.all(
    Array.from({ length: 5 }, () => auth.getAccessToken(null)),
  );

  assert.equal(calls, 1, "solo debe renovar una vez");
  assert.equal(new Set(tokens).size, 1);
});

test("un token a menos de 60s de expirar se renueva", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    // expires_in 30s < margen de 60s -> siempre hay que renovar.
    return jsonResponse(200, tokenBody(calls, { expires_in: 30 }));
  };

  await auth.getAccessToken(null);
  await auth.getAccessToken(null);
  assert.equal(calls, 2);
});

test("un token vigente se reutiliza desde la cache", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return jsonResponse(200, tokenBody(calls));
  };

  await auth.getAccessToken(null);
  await auth.getAccessToken(null);
  await auth.getAccessToken(null);
  assert.equal(calls, 1);
});

test("acepta la rotacion del refresh token sin romperse", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return jsonResponse(
      200,
      tokenBody(calls, {
        refresh_token: "rotated-refresh-token",
        refresh_token_expires_at: new Date(Date.now() + 86400000).toISOString(),
      }),
    );
  };

  const token = await auth.getAccessToken(null);
  assert.equal(token, "access-token-1-abcdefghijklmnop");
  // Sin proveedor en la base no hay donde persistir: no debe lanzar.
  assert.equal(calls, 1);
});

test("credenciales incorrectas -> error controlado", async () => {
  global.fetch = async () => jsonResponse(401, { error: "invalid_client" });

  await assert.rejects(
    () => auth.getAccessToken(null),
    (error) => {
      assert.equal(error.status, 502);
      assert.match(error.message, /autenticación|credenciales/i);
      return true;
    },
  );
});

test("un 401 en una peticion renueva el token y reintenta una vez", async () => {
  const sequence = [];
  global.fetch = async (url) => {
    sequence.push(url);
    if (url.includes("/oauth/token")) {
      return jsonResponse(200, tokenBody(sequence.length));
    }
    // La primera consulta protegida responde 401; la segunda, 200.
    if (sequence.filter((u) => u.includes("/check-auth")).length === 1) {
      return jsonResponse(401, { message: "expired" });
    }
    return jsonResponse(200, { message: "Success" });
  };

  const data = await client.checkAuth(null);
  assert.equal(data.message, "Success");
  assert.equal(sequence.filter((u) => u.includes("/oauth/token")).length, 2);
  assert.equal(sequence.filter((u) => u.includes("/check-auth")).length, 2);
});

test("los tokens completos no se escriben en los logs", async () => {
  global.fetch = async () => jsonResponse(200, tokenBody(9));

  const captured = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = (...args) => captured.push(args.join(" "));
  console.warn = (...args) => captured.push(args.join(" "));

  try {
    await auth.getAccessToken(null);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }

  const all = captured.join("\n");
  assert.ok(!all.includes("access-token-9-abcdefghijklmnop"));
});