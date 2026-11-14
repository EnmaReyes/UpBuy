// Pruebas de la seguridad personal del administrador (ADM-S2 / ADM-S3):
// estado de MFA, códigos de respaldo y sesiones activas.
//
// Igual que el resto del repo: sin supertest y con salto automático cuando no
// hay PostgreSQL disponible.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

process.chdir(path.join(__dirname, ".."));

const {
  sequelize,
  Usuarios,
  AdminBackupCode,
  AdminSession,
} = require("../DataBase/models/index.js");
const {
  countBackupCodes,
  regenerateBackupCodes,
} = require("../Services/mfa.js");
const {
  securityOverview,
  regenerateCodes,
} = require("../Controllers/adminAdmins.js");
const {
  isStepUpAction,
  permissionForStepUpAction,
} = require("../Services/permissions.js");
const { createAdminSession } = require("../Services/adminSessions.js");
const {
  ensureAdminSecuritySchema,
} = require("../DataBase/ensureAdminSecuritySchema.js");

const makeRes = () => {
  let statusCode = 200;
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      return { status: statusCode, body };
    },
  };
};

test("regenerar códigos es una acción de step-up sin permiso de gobierno", () => {
  assert.equal(isStepUpAction("security.backup_codes"), true);
  assert.equal(permissionForStepUpAction("security.backup_codes"), null);
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

const makeAdmin = async ({ mfaEnabled = true, withSecret = true } = {}) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  return Usuarios.create({
    username: `secadmin${stamp}`,
    email: `secadmin${stamp}@test.local`,
    password: "hash-que-no-debe-salir",
    role: "admin",
    admin: true,
    mfaEnabled,
    mfaSecretEncrypted: withSecret ? "secreto-cifrado-que-no-debe-salir" : null,
    mfaEnrolledAt: mfaEnabled ? new Date() : null,
  });
};

const cleanup = async (userId) => {
  await AdminBackupCode.destroy({ where: { userId } });
  await AdminSession.destroy({ where: { userId } });
  await Usuarios.destroy({ where: { id: userId } });
};

test("regenerateBackupCodes invalida los anteriores y deja solo los nuevos", async (t) => {
  if (skipIfNoDb(t)) return;

  const admin = await makeAdmin();
  try {
    const first = await regenerateBackupCodes({ userId: admin.id });
    assert.equal(first.backupCodes.length, first.count);
    assert.ok(first.count > 0);

    const afterFirst = await countBackupCodes(admin.id);
    assert.equal(afterFirst.total, first.count);
    assert.equal(afterFirst.remaining, first.count);

    // Los códigos en claro nunca se guardan: solo el hash.
    const stored = await AdminBackupCode.findAll({ where: { userId: admin.id } });
    for (const row of stored) {
      assert.equal(first.backupCodes.includes(row.codeHash), false);
      assert.ok(row.codeHash.length > 20);
    }

    const second = await regenerateBackupCodes({ userId: admin.id });
    const afterSecond = await countBackupCodes(admin.id);
    assert.equal(afterSecond.total, second.count);
    assert.equal(afterSecond.remaining, second.count);

    const overlap = second.backupCodes.filter((code) =>
      first.backupCodes.includes(code),
    );
    assert.equal(overlap.length, 0);
  } finally {
    await cleanup(admin.id);
  }
});

test("cuenta los códigos usados por separado de los disponibles", async (t) => {
  if (skipIfNoDb(t)) return;

  const admin = await makeAdmin();
  try {
    const { backupCodes } = await regenerateBackupCodes({ userId: admin.id });
    const [first] = await AdminBackupCode.findAll({
      where: { userId: admin.id },
      order: [["createdAt", "ASC"]],
    });
    await first.update({ usedAt: new Date() });

    const counts = await countBackupCodes(admin.id);
    assert.equal(counts.total, backupCodes.length);
    assert.equal(counts.remaining, backupCodes.length - 1);
  } finally {
    await cleanup(admin.id);
  }
});

test("GET /api/admin/admins/security no expone secretos", async (t) => {
  if (skipIfNoDb(t)) return;

  const admin = await makeAdmin();
  try {
    const { backupCodes } = await regenerateBackupCodes({ userId: admin.id });
    const session = await createAdminSession({
      userId: admin.id,
      mfaAt: new Date(),
    });

    const result = await securityOverview(
      { user: { id: admin.id, sessionId: session.id } },
      makeRes(),
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.mfa.enabled, true);
    assert.ok(result.body.mfa.enrolledAt);
    assert.equal(result.body.backupCodes.total, backupCodes.length);
    assert.equal(result.body.backupCodes.remaining, backupCodes.length);
    assert.equal(result.body.sessions.active, 1);
    assert.equal(result.body.sessions.currentSessionId, session.id);
    assert.ok(Number.isFinite(result.body.policy.idleMinutes));
    assert.ok(Number.isFinite(result.body.policy.maxHours));
    assert.ok(Number.isFinite(result.body.policy.stepUpMinutes));

    const serialized = JSON.stringify(result.body);
    assert.equal(serialized.includes("secreto-cifrado-que-no-debe-salir"), false);
    assert.equal(serialized.includes(backupCodes[0]), false);
  } finally {
    await cleanup(admin.id);
  }
});

test("regenerar códigos responde 409 si el MFA no está activo", async (t) => {
  if (skipIfNoDb(t)) return;

  const admin = await makeAdmin({ mfaEnabled: false, withSecret: false });
  try {
    const result = await regenerateCodes(
      { user: { id: admin.id, sessionId: null } },
      makeRes(),
    );

    assert.equal(result.status, 409);
    assert.equal(result.body.code, "MFA_NOT_ENABLED");
    assert.equal(result.body.backupCodes, undefined);
  } finally {
    await cleanup(admin.id);
  }
});

test("regenerar códigos devuelve el juego nuevo una sola vez", async (t) => {
  if (skipIfNoDb(t)) return;

  const admin = await makeAdmin();
  try {
    const result = await regenerateCodes(
      { user: { id: admin.id, sessionId: null }, ip: "127.0.0.1" },
      makeRes(),
    );

    assert.equal(result.status, 200);
    assert.ok(Array.isArray(result.body.backupCodes));
    assert.equal(result.body.backupCodes.length, result.body.count);

    const counts = await countBackupCodes(admin.id);
    assert.equal(counts.remaining, result.body.count);
  } finally {
    await cleanup(admin.id);
  }
});
