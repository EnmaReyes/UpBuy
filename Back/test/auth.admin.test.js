// Pruebas de regresion de ADM-S0 (F-01, F-02, F-05).
//
// Cubren, sin supertest:
//   - requireAuth nunca copia el claim `admin` del JWT a req.user.
//   - Un token firmado con otro secreto o con alg:none se rechaza.
//   - La proteccion CSRF solo aplica a mutaciones con cookie de sesion.
//   - El dueno estricto de las rutas del comprador (con base real, si existe).

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const jwt = require("jsonwebtoken");

process.chdir(path.join(__dirname, ".."));

const {
  JWT_SECRET,
  JWT_ALGORITHM,
  JWT_ISSUER,
  JWT_AUDIENCE,
  FRONTEND_URLS,
} = require("../config.js");
const { requireAuth } = require("../Middleware/auth.js");
const {
  requireTrustedOrigin,
} = require("../Middlewares/requireTrustedOrigin.js");
const { sequelize, Usuarios, Order } = require("../DataBase/models/index.js");
const {
  getOrderForUser,
  cancelOrder,
} = require("../Services/orders.js");

const TRUSTED_ORIGIN = FRONTEND_URLS[0] || "http://localhost:3001";

const base64url = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const signToken = (payload, options = {}) =>
  jwt.sign(payload, options.secret || JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    subject: String(payload.id),
    expiresIn: "5m",
    ...options.sign,
  });

const makeReq = ({
  method = "GET",
  cookies = {},
  headers = {},
} = {}) => ({
  method,
  cookies,
  headers,
  get: (name) => headers[String(name).toLowerCase()],
});

const callMiddleware = (middleware, req) =>
  new Promise((resolve, reject) => {
    let statusCode = 200;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        resolve({ status: statusCode, body, passed: false });
        return this;
      },
    };

    try {
      middleware(req, res, () => resolve({ status: statusCode, passed: true }));
    } catch (error) {
      reject(error);
    }
  });

// ---------------------------------------------------------------------------
// F-01: el rol no viaja en el JWT
// ---------------------------------------------------------------------------

test("requireAuth ignora el claim admin del token", async () => {
  const token = signToken({ id: "usuario-1", admin: true });
  const req = makeReq({ cookies: { access_token: token } });

  const result = await callMiddleware(requireAuth, req);

  assert.equal(result.passed, true);
  assert.deepEqual(req.user, { id: "usuario-1" });
  assert.equal("admin" in req.user, false);
});

test("requireAuth rechaza un token firmado con otro secreto", async () => {
  const token = signToken(
    { id: "usuario-1", admin: true },
    { secret: "otro-secreto-que-no-es-el-de-upbuy-1234567890" },
  );
  const req = makeReq({ cookies: { access_token: token } });

  const result = await callMiddleware(requireAuth, req);

  assert.equal(result.passed, false);
  assert.equal(result.status, 403);
});

test("requireAuth rechaza un token con alg:none", async () => {
  const header = base64url({ alg: "none", typ: "JWT" });
  const payload = base64url({
    id: "usuario-1",
    admin: true,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
  });
  const token = `${header}.${payload}.`;
  const req = makeReq({ cookies: { access_token: token } });

  const result = await callMiddleware(requireAuth, req);

  assert.equal(result.passed, false);
  assert.equal(result.status, 403);
});

// ---------------------------------------------------------------------------
// F-02: CSRF en mutaciones con cookie
// ---------------------------------------------------------------------------

test("una lectura con cookie no exige CSRF", async () => {
  const req = makeReq({
    method: "GET",
    cookies: { access_token: "token" },
  });

  const result = await callMiddleware(requireTrustedOrigin, req);
  assert.equal(result.passed, true);
});

test("una mutacion con cookie exige la cabecera X-Upbuy-CSRF", async () => {
  const req = makeReq({
    method: "POST",
    cookies: { access_token: "token" },
    headers: { origin: TRUSTED_ORIGIN },
  });

  const result = await callMiddleware(requireTrustedOrigin, req);

  assert.equal(result.passed, false);
  assert.equal(result.status, 403);
  assert.equal(result.body.code, "CSRF_HEADER_REQUIRED");
});

test("una mutacion con cookie y origen ajeno se rechaza", async () => {
  const req = makeReq({
    method: "DELETE",
    cookies: { access_token: "token" },
    headers: {
      origin: "https://sitio-malicioso.example",
      "x-upbuy-csrf": "1",
    },
  });

  const result = await callMiddleware(requireTrustedOrigin, req);

  assert.equal(result.passed, false);
  assert.equal(result.status, 403);
  assert.equal(result.body.code, "CSRF_ORIGIN_REJECTED");
});

test("una mutacion con cookie, origen permitido y cabecera pasa", async () => {
  const req = makeReq({
    method: "PATCH",
    cookies: { access_token: "token" },
    headers: {
      origin: TRUSTED_ORIGIN,
      "x-upbuy-csrf": "1",
    },
  });

  const result = await callMiddleware(requireTrustedOrigin, req);
  assert.equal(result.passed, true);
});

test("un webhook sin cookie no pasa por la proteccion CSRF", async () => {
  const req = makeReq({
    method: "POST",
    cookies: {},
    headers: { origin: "https://sitio-malicioso.example" },
  });

  const result = await callMiddleware(requireTrustedOrigin, req);
  assert.equal(result.passed, true);
});

// ---------------------------------------------------------------------------
// F-01 con base real: el dueno estricto (se salta si no hay base)
// ---------------------------------------------------------------------------

let dbError = null;

test.before(async () => {
  try {
    await sequelize.authenticate();
  } catch (error) {
    dbError = error;
  }
});

test.after(async () => {
  await sequelize.close().catch(() => {});
});

const skipIfNoDb = (t) => {
  if (dbError) {
    t.skip(`sin base de datos: ${dbError.message}`);
    return true;
  }
  return false;
};

test("un comprador no puede leer ni cancelar el pedido de otro", async (t) => {
  if (skipIfNoDb(t)) return;

  const stamp = Date.now();
  const owner = await Usuarios.create({
    username: `owner${stamp}`,
    email: `owner${stamp}@test.local`,
    password: "x",
  });
  const other = await Usuarios.create({
    username: `other${stamp}`,
    email: `other${stamp}@test.local`,
    password: "x",
  });

  const order = await Order.create({
    orderNumber: `TEST-${stamp}`,
    userId: owner.id,
    recipientName: "Compradora Prueba",
    phone: "+573001234567",
  });

  try {
    await assert.rejects(
      () => getOrderForUser({ orderId: order.id, userId: other.id }),
      (error) => error.status === 404,
    );

    await assert.rejects(
      () => cancelOrder({ orderId: order.id, userId: other.id }),
      (error) => error.status === 404,
    );
  } finally {
    await Order.destroy({ where: { id: order.id } });
    await Usuarios.destroy({ where: { id: [owner.id, other.id] } });
  }
});
