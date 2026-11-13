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
  ADMIN_STEP_UP_MINUTES,
  SESSION_COOKIE_NAME,
  ADMIN_ALERT_FAILED_ATTEMPTS,
} = require("../config.js");
const { requireAuth, requireAdminSession, requirePermission } = require("../Middleware/auth.js");
const {
  requireTrustedOrigin,
} = require("../Middlewares/requireTrustedOrigin.js");
const {
  sequelize,
  Usuarios,
  Order,
  AdminSession,
} = require("../DataBase/models/index.js");
const {
  getOrderForUser,
  cancelOrder,
} = require("../Services/orders.js");
const {
  hasPermission,
  permissionsFor,
  resolveRole,
  evaluateAdminChange,
  isStepUpAction,
  permissionForStepUpAction,
} = require("../Services/permissions.js");
const {
  requireStepUp,
  isStepUpFresh,
  STEP_UP_WINDOW_MS,
} = require("../Middlewares/requireStepUp.js");
const {
  createAdminSession,
  revokeSession,
  rotateAdminSession,
  findActiveSession,
} = require("../Services/adminSessions.js");
const {
  cookieNames,
  readSessionToken,
  sessionCookieOptions,
} = require("../Services/sessionCookie.js");
const {
  parseEntry,
  compileAllowlist,
  isIpAllowed,
  isRequestIpAllowed,
} = require("../Middlewares/requireAdminIp.js");
const {
  shouldAlertOnFailures,
  alertBucket,
} = require("../Services/securityAlerts.js");
const { purgeAuthEvents } = require("../Services/securityLogs.js");
const {
  ensureAdminSecuritySchema,
} = require("../DataBase/ensureAdminSecuritySchema.js");

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
// ADM-S1: roles y permisos (logica pura)
// ---------------------------------------------------------------------------

test("support puede leer pedidos pero no reembolsar ni escribir", () => {
  assert.equal(hasPermission("support", "orders.read"), true);
  assert.equal(hasPermission("support", "users.read"), true);
  assert.equal(hasPermission("support", "orders.write"), false);
  assert.equal(hasPermission("support", "orders.refund"), false);
});

test("admin reembolsa y gestiona proveedores; solo superadmin gestiona admins", () => {
  assert.equal(hasPermission("admin", "orders.refund"), true);
  assert.equal(hasPermission("admin", "providers.manage"), true);
  assert.equal(hasPermission("admin", "admins.manage"), false);
  assert.equal(hasPermission("superadmin", "admins.manage"), true);
  assert.equal(hasPermission("superadmin", "audit.read"), true);
});

test("customer no tiene permisos administrativos", () => {
  assert.deepEqual(permissionsFor("customer"), []);
  assert.equal(hasPermission("customer", "orders.read"), false);
});

test("resolveRole usa role y cae al booleano admin legacy", () => {
  assert.equal(resolveRole({ role: "support", admin: false }), "support");
  assert.equal(resolveRole({ role: "customer", admin: true }), "admin");
  assert.equal(resolveRole({ role: "customer", admin: false }), "customer");
  assert.equal(resolveRole({ role: null, admin: true }), "admin");
});

test("requirePermission rechaza a support y acepta a admin", async () => {
  const req = { user: { permissions: permissionsFor("support") } };

  const denied = await callMiddleware(
    requirePermission("orders.refund"),
    req,
  );
  assert.equal(denied.passed, false);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, "PERMISSION_DENIED");

  const allowed = await callMiddleware(
    requirePermission("orders.read"),
    req,
  );
  assert.equal(allowed.passed, true);
});

// ---------------------------------------------------------------------------
// ADM-S3: step-up y gobierno de administradores (logica pura)
// ---------------------------------------------------------------------------

const adminUser = (overrides = {}) => ({
  id: "admin-1",
  permissions: permissionsFor("admin"),
  mfaAt: new Date(),
  ...overrides,
});

test("las acciones destructivas estan mapeadas a su permiso", () => {
  assert.equal(isStepUpAction("orders.refund"), true);
  assert.equal(isStepUpAction("orders.cancel"), true);
  assert.equal(isStepUpAction("campaigns.send"), true);
  assert.equal(isStepUpAction("admins.manage"), true);
  assert.equal(isStepUpAction("catalog.unpublish"), true);
  assert.equal(isStepUpAction("orders.read"), false);

  assert.equal(permissionForStepUpAction("orders.cancel"), "orders.write");
  assert.equal(
    permissionForStepUpAction("catalog.unpublish"),
    "catalog.write",
  );
});

test("una accion de step-up desconocida falla al construir la ruta", () => {
  assert.throws(() => requireStepUp("accion.inventada"), /step-up desconocida/);
});

test("step-up rechaza una accion destructiva sin segundo factor reciente", async () => {
  const req = {
    user: adminUser({ mfaAt: null }),
  };

  const result = await callMiddleware(requireStepUp("orders.refund"), req);

  assert.equal(result.passed, false);
  assert.equal(result.status, 403);
  assert.equal(result.body.code, "STEP_UP_REQUIRED");
  assert.equal(result.body.action, "orders.refund");
  assert.equal(result.body.maxAgeMinutes, ADMIN_STEP_UP_MINUTES);
});

test("step-up acepta un mfaAt dentro de la ventana y rechaza el vencido", async () => {
  const fresh = await callMiddleware(
    requireStepUp("orders.refund"),
    { user: adminUser({ mfaAt: new Date() }) },
  );
  assert.equal(fresh.passed, true);

  const expiredAt = new Date(
    Date.now() - STEP_UP_WINDOW_MS - 60 * 1000,
  );
  const expired = await callMiddleware(
    requireStepUp("orders.refund"),
    { user: adminUser({ mfaAt: expiredAt }) },
  );
  assert.equal(expired.passed, false);
  assert.equal(expired.body.code, "STEP_UP_REQUIRED");

  assert.equal(isStepUpFresh(null), false);
  assert.equal(isStepUpFresh(new Date()), true);
});

test("step-up no aplica cuando la condicion de la ruta no se cumple", async () => {
  const req = {
    user: adminUser({ mfaAt: null }),
    body: { status: "packing" },
  };

  const result = await callMiddleware(
    requireStepUp("orders.cancel", { when: (r) => r.body.status === "cancelled" }),
    req,
  );

  assert.equal(result.passed, true);
});

test("step-up exige el permiso que habilita la accion", async () => {
  const result = await callMiddleware(requireStepUp("orders.refund"), {
    user: {
      id: "support-1",
      permissions: permissionsFor("support"),
      mfaAt: new Date(),
    },
  });

  assert.equal(result.passed, false);
  assert.equal(result.status, 403);
  assert.equal(result.body.code, "PERMISSION_DENIED");
  assert.deepEqual(result.body.required, ["orders.refund"]);
});

test("no se puede degradar al ultimo superadmin activo", () => {
  const result = evaluateAdminChange({
    actorId: "super-1",
    targetId: "super-2",
    targetRole: "superadmin",
    targetDisabled: false,
    nextRole: "admin",
    otherActiveSuperAdmins: 0,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.code, "LAST_SUPERADMIN");
});

test("desactivar al ultimo superadmin tambien se bloquea", () => {
  const result = evaluateAdminChange({
    actorId: "super-1",
    targetId: "super-2",
    targetRole: "superadmin",
    targetDisabled: false,
    nextRole: "superadmin",
    nextDisabled: true,
    otherActiveSuperAdmins: 0,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "LAST_SUPERADMIN");
});

test("degradar a un superadmin es valido si queda otro activo", () => {
  const result = evaluateAdminChange({
    actorId: "super-1",
    targetId: "super-2",
    targetRole: "superadmin",
    targetDisabled: false,
    nextRole: "admin",
    otherActiveSuperAdmins: 1,
  });

  assert.equal(result.ok, true);
});

test("nadie puede cambiar su propio rol ni desactivarse", () => {
  const demoteSelf = evaluateAdminChange({
    actorId: "super-1",
    targetId: "super-1",
    targetRole: "superadmin",
    targetDisabled: false,
    nextRole: "admin",
    otherActiveSuperAdmins: 3,
  });
  assert.equal(demoteSelf.ok, false);
  assert.equal(demoteSelf.code, "SELF_ADMIN_CHANGE");

  const disableSelf = evaluateAdminChange({
    actorId: "super-1",
    targetId: "super-1",
    targetRole: "admin",
    targetDisabled: false,
    nextRole: "admin",
    nextDisabled: true,
    otherActiveSuperAdmins: 3,
  });
  assert.equal(disableSelf.ok, false);
  assert.equal(disableSelf.code, "SELF_ADMIN_CHANGE");
});

// ---------------------------------------------------------------------------
// ADM-S4: cookie endurecida, IP allowlist, alertas y retencion
// ---------------------------------------------------------------------------

test("la cookie de sesion se lee del nombre actual y del historico", () => {
  if (SESSION_COOKIE_NAME !== "access_token") {
    assert.ok(cookieNames().includes(SESSION_COOKIE_NAME));
  }
  assert.ok(cookieNames().includes("access_token"));

  assert.equal(
    readSessionToken({ cookies: { access_token: "token-viejo" } }),
    "token-viejo",
  );
  assert.equal(readSessionToken({ cookies: {} }), undefined);

  const options = sessionCookieOptions({ maxAge: 1000 });
  assert.equal(options.httpOnly, true);
  assert.equal(options.path, "/");
  assert.equal(options.maxAge, 1000);
});

test("la allowlist acepta IPs exactas y rangos CIDR", () => {
  assert.ok(parseEntry("190.1.2.3"));
  assert.ok(parseEntry("10.0.0.0/8"));
  assert.equal(parseEntry("10.0.0.0/33"), null);
  assert.equal(parseEntry("no-es-ip"), null);

  const entries = compileAllowlist([
    "190.1.2.3",
    "10.0.0.0/8",
    "::1/128",
    "2800:3f0::/32",
  ]);

  assert.equal(isIpAllowed("190.1.2.3", entries), true);
  assert.equal(isIpAllowed("190.1.2.4", entries), false);
  assert.equal(isIpAllowed("10.200.1.9", entries), true);
  assert.equal(isIpAllowed("::ffff:10.1.2.3", entries), true);
  assert.equal(isIpAllowed("::1", entries), true);
  assert.equal(isIpAllowed("2800:3f0::1", entries), true);
  assert.equal(isIpAllowed("11.0.0.1", entries), false);

  // Lista vacia = sin restriccion.
  assert.equal(isIpAllowed("8.8.8.8", []), true);
  assert.equal(isRequestIpAllowed({ ip: "8.8.8.8" }), true);
});

test("las alertas se disparan al alcanzar el umbral de fallos", () => {
  assert.equal(shouldAlertOnFailures(ADMIN_ALERT_FAILED_ATTEMPTS - 1), false);
  assert.equal(shouldAlertOnFailures(ADMIN_ALERT_FAILED_ATTEMPTS), true);
  assert.equal(shouldAlertOnFailures(10, 5), true);

  const bucket = alertBucket(60_000);
  assert.equal(typeof bucket, "number");
  assert.equal(alertBucket(60_000), bucket);
});

test("la retencion desactivada no borra auth_events", async () => {
  const result = await purgeAuthEvents({ olderThanDays: 0 });
  assert.equal(result.deleted, 0);
  assert.equal(result.disabled, true);
});

// ---------------------------------------------------------------------------
// F-01 con base real: el dueno estricto (se salta si no hay base)
// ---------------------------------------------------------------------------

let dbError = null;

test.before(async () => {
  try {
    await sequelize.authenticate();
    await ensureAdminSecuritySchema();
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

// ---------------------------------------------------------------------------
// ADM-S1 con base real: sesiones revocables y rol desde la base
// ---------------------------------------------------------------------------

test("requireAdminSession acepta una sesion viva y la rechaza al revocarla", async (t) => {
  if (skipIfNoDb(t)) return;

  const stamp = Date.now();
  const admin = await Usuarios.create({
    username: `admin${stamp}`,
    email: `admin${stamp}@test.local`,
    password: "x",
    role: "admin",
    admin: true,
  });

  const session = await createAdminSession({ userId: admin.id });
  const token = signToken({
    id: admin.id,
    sid: session.id,
    ver: admin.tokenVersion,
  });

  try {
    const req = makeReq({ cookies: { access_token: token } });
    const accepted = await callMiddleware(requireAdminSession, req);
    assert.equal(accepted.passed, true);
    assert.equal(req.user.role, "admin");
    assert.equal(req.user.sessionId, session.id);
    assert.equal(hasPermission(req.user.role, "orders.write"), true);

    await revokeSession({ sessionId: session.id, userId: admin.id });

    const rejected = await callMiddleware(
      requireAdminSession,
      makeReq({ cookies: { access_token: token } }),
    );
    assert.equal(rejected.passed, false);
    assert.equal(rejected.status, 403);
    assert.equal(rejected.body.code, "ADMIN_SESSION_REVOKED");
  } finally {
    await AdminSession.destroy({ where: { userId: admin.id } });
    await Usuarios.destroy({ where: { id: admin.id } });
  }
});

test("un customer con sesion creada no entra al panel", async (t) => {
  if (skipIfNoDb(t)) return;

  const stamp = Date.now();
  const customer = await Usuarios.create({
    username: `customer${stamp}`,
    email: `customer${stamp}@test.local`,
    password: "x",
    role: "customer",
    admin: false,
  });

  const session = await createAdminSession({ userId: customer.id });
  const token = signToken({
    id: customer.id,
    sid: session.id,
    ver: customer.tokenVersion,
  });

  try {
    const result = await callMiddleware(
      requireAdminSession,
      makeReq({ cookies: { access_token: token } }),
    );
    assert.equal(result.passed, false);
    assert.equal(result.status, 403);
    assert.equal(result.body.code, "ADMIN_REQUIRED");
  } finally {
    await AdminSession.destroy({ where: { userId: customer.id } });
    await Usuarios.destroy({ where: { id: customer.id } });
  }
});

test("tokenVersion obsoleto invalida la sesion del admin", async (t) => {
  if (skipIfNoDb(t)) return;

  const stamp = Date.now();
  const admin = await Usuarios.create({
    username: `stale${stamp}`,
    email: `stale${stamp}@test.local`,
    password: "x",
    role: "admin",
    admin: true,
  });

  const session = await createAdminSession({ userId: admin.id });
  const token = signToken({ id: admin.id, sid: session.id, ver: 0 });

  try {
    await admin.update({ tokenVersion: 1 });

    const result = await callMiddleware(
      requireAdminSession,
      makeReq({ cookies: { access_token: token } }),
    );
    assert.equal(result.passed, false);
    assert.equal(result.status, 401);
    assert.equal(result.body.code, "SESSION_STALE");
  } finally {
    await AdminSession.destroy({ where: { userId: admin.id } });
    await Usuarios.destroy({ where: { id: admin.id } });
  }
});

test("la rotacion de step-up revoca la sesion anterior y crea una nueva", async (t) => {
  if (skipIfNoDb(t)) return;

  const stamp = Date.now();
  const admin = await Usuarios.create({
    username: `rotate${stamp}`,
    email: `rotate${stamp}@test.local`,
    password: "x",
    role: "superadmin",
    admin: true,
  });

  const previous = await createAdminSession({ userId: admin.id });

  try {
    const rotated = await rotateAdminSession({
      sessionId: previous.id,
      userId: admin.id,
      mfaAt: new Date(),
    });

    assert.ok(rotated?.id);
    assert.notEqual(rotated.id, previous.id);

    const oldStillActive = await findActiveSession({
      sessionId: previous.id,
      userId: admin.id,
    });
    assert.equal(oldStillActive, null);

    const newStillActive = await findActiveSession({
      sessionId: rotated.id,
      userId: admin.id,
    });
    assert.ok(newStillActive);
    assert.ok(newStillActive.mfaAt);
  } finally {
    await AdminSession.destroy({ where: { userId: admin.id } });
    await Usuarios.destroy({ where: { id: admin.id } });
  }
});

test("la migracion de seguridad administrativa es idempotente", async (t) => {
  if (skipIfNoDb(t)) return;

  const result = await ensureAdminSecuritySchema();
  assert.equal(result.migrated, false);
});
