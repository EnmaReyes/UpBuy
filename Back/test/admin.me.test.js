// Pruebas de ADM-1: perfil y resumen del panel.
//
// Sin supertest: se llama al middleware y a los controladores con objetos
// `req`/`res` minimos. Las pruebas que dependen de PostgreSQL se saltan solas
// cuando no hay base (igual que el resto del repo).

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

process.chdir(path.join(__dirname, ".."));

const {
  sequelize,
  Usuarios,
  AdminSession,
} = require("../DataBase/models/index.js");
const { requireAdminSession } = require("../Middleware/auth.js");
const { me, summary } = require("../Controllers/adminMe.js");
const {
  monthRangeBogota,
  getDashboardSummary,
} = require("../Services/adminDashboard.js");
const { createAdminSession } = require("../Services/adminSessions.js");
const {
  ensureAdminSecuritySchema,
} = require("../DataBase/ensureAdminSecuritySchema.js");

const makeRes = () => {
  let statusCode = 200;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      return { status: statusCode, body };
    },
  };
  return res;
};

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

const missingSession = { cookies: {}, headers: {}, get: () => undefined };

test("requireAdminSession responde 401 sin cookie de sesion", async () => {
  const result = await callMiddleware(requireAdminSession, missingSession);
  assert.equal(result.passed, false);
  assert.equal(result.status, 401);
});

test("monthRangeBogota cubre del dia 1 al dia de hoy", () => {
  const range = monthRangeBogota(new Date("2026-11-13T18:00:00.000Z"));
  assert.deepEqual(range, { from: "2026-11-01", to: "2026-11-13" });
});

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

test("GET /api/admin/me no expone campos sensibles", async (t) => {
  if (skipIfNoDb(t)) return;

  const stamp = Date.now();
  const admin = await Usuarios.create({
    username: `meadmin${stamp}`,
    email: `meadmin${stamp}@test.local`,
    password: "hash-que-no-debe-salir",
    role: "superadmin",
    admin: true,
    mfaEnabled: true,
    mfaSecretEncrypted: "secreto-cifrado-que-no-debe-salir",
  });
  const session = await createAdminSession({
    userId: admin.id,
    mfaAt: new Date(),
  });

  try {
    const res = makeRes();
    const result = await me(
      {
        user: {
          id: admin.id,
          role: "superadmin",
          sessionId: session.id,
        },
      },
      res,
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.id, admin.id);
    assert.equal(result.body.role, "superadmin");
    assert.equal(result.body.mfaEnabled, true);
    assert.ok(Array.isArray(result.body.permissions));
    assert.ok(result.body.permissions.includes("audit.read"));
    assert.ok(result.body.session?.expiresAt);
    assert.ok(result.body.session?.mfaAt);

    const serialized = JSON.stringify(result.body);
    assert.equal(serialized.includes("hash-que-no-debe-salir"), false);
    assert.equal(
      serialized.includes("secreto-cifrado-que-no-debe-salir"),
      false,
    );
    assert.equal("password" in result.body, false);
    assert.equal("mfaSecretEncrypted" in result.body, false);
  } finally {
    await AdminSession.destroy({ where: { userId: admin.id } });
    await Usuarios.destroy({ where: { id: admin.id } });
  }
});

test("el resumen del panel compone stats, ventas, contabilidad y recientes", async (t) => {
  if (skipIfNoDb(t)) return;

  const data = await getDashboardSummary({ periodo: "mes" });

  assert.ok(data.stats);
  assert.ok(data.sales);
  assert.equal(data.sales.periodo, "mes");
  assert.ok(data.accounting);
  assert.ok(Array.isArray(data.recentOrders));
  assert.ok(data.recentOrders.length <= 5);
  assert.ok(Array.isArray(data.providers));
  assert.deepEqual(data.period.accounting.from.slice(-2), "01");
  assert.equal(typeof data.generatedAt, "string");
});

test("GET /api/admin/dashboard/summary responde con el contrato del panel", async (t) => {
  if (skipIfNoDb(t)) return;

  const res = makeRes();
  const result = await summary({ query: { periodo: "mes" } }, res);

  assert.equal(result.status, 200);
  assert.ok(result.body.stats);
  assert.ok(result.body.sales);
  assert.ok(result.body.accounting);
  assert.ok(Array.isArray(result.body.recentOrders));
  assert.ok(Array.isArray(result.body.providers));
});
