// Pruebas de ADM-S2: MFA TOTP obligatorio para administradores.
//
// Cubren la criptografia pura (TOTP, cifrado, codigos de respaldo) y los
// flujos completos contra la base real, si esta disponible:
//   - login admin sin MFA -> ticket de enrolamiento.
//   - setup -> enroll -> cookie con sesion que tiene mfaAt.
//   - login posterior -> 202 + reto; TOTP o codigo de respaldo.
//   - bloqueo del reto tras ADMIN_MFA_MAX_ATTEMPTS.
//   - requireAdminSession exige mfaEnabled y session.mfaAt.
//
// El archivo fija ADMIN_MFA_REQUIRED=true ANTES de cargar config/controllers:
// en pruebas el default es false y el flujo se saltaria.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const bcrypt = require("bcryptjs");

process.env.ADMIN_MFA_REQUIRED = "true";
process.chdir(path.join(__dirname, ".."));

const { ADMIN_MFA_MAX_ATTEMPTS } = require("../config.js");
const mfa = require("../Services/mfa.js");
const {
  sequelize,
  Usuarios,
  AdminSession,
  AdminMfaChallenge,
  AdminBackupCode,
} = require("../DataBase/models/index.js");
const {
  ensureAdminSecuritySchema,
} = require("../DataBase/ensureAdminSecuritySchema.js");
const {
  login,
  verifyAdminMfa,
  setupAdminMfa,
  enrollAdminMfa,
} = require("../Controllers/auth.js");
const { requireAdminSession } = require("../Middleware/auth.js");
const { createAdminSession } = require("../Services/adminSessions.js");

// ---------------------------------------------------------------------------
// Helpers HTTP minimos (sin supertest)
// ---------------------------------------------------------------------------

const makeReq = ({ body = {}, ip = "127.0.0.1", headers = {} } = {}) => ({
  body,
  cookies: {},
  ip,
  headers,
  get: (name) => headers[String(name).toLowerCase()],
});

const makeRes = () => {
  const state = { statusCode: 200, body: undefined, cookies: [] };
  const res = {
    status(code) {
      state.statusCode = code;
      return res;
    },
    json(body) {
      state.body = body;
      return res;
    },
    cookie(name, value, options) {
      state.cookies.push({ name, value, options });
      return res;
    },
    clearCookie() {
      return res;
    },
    end() {
      return res;
    },
  };
  return { res, state };
};

const callController = async (handler, req) => {
  const { res, state } = makeRes();
  await handler(req, res);
  return state;
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

// ---------------------------------------------------------------------------
// Criptografia pura (no requiere base)
// ---------------------------------------------------------------------------

test("base32 codifica y decodifica sin perdida", () => {
  const raw = Buffer.from("12345678901234567890", "ascii");
  const encoded = mfa.base32Encode(raw);
  assert.equal(encoded, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.deepEqual(mfa.base32Decode(encoded), raw);
});

test("TOTP coincide con el vector de la RFC 6238 (6 digitos)", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  // RFC 6238 usa 8 digitos; con 6 el sufijo es 287082.
  assert.equal(mfa.generateTotp(secret, { time: 59_000 }), "287082");
  // 1111111109 -> 08180428 (8) -> 081804 (6)
  assert.equal(mfa.generateTotp(secret, { time: 1_111_111_109_000 }), "081804");
});

test("verifyTotp tolera +/- una ventana y rechaza fuera de rango", () => {
  const secret = mfa.generateTotpSecret();
  const now = 1_700_000_000_000;
  const code = mfa.generateTotp(secret, { time: now });

  assert.equal(mfa.verifyTotp(secret, code, { time: now }), true);
  assert.equal(mfa.verifyTotp(secret, code, { time: now + 30_000 }), true);
  assert.equal(mfa.verifyTotp(secret, code, { time: now + 60_000 }), false);
  assert.equal(mfa.verifyTotp(secret, code, { time: now - 60_000 }), false);
  assert.equal(mfa.verifyTotp(secret, "abc", { time: now }), false);
});

test("el secreto TOTP se cifra y detecta manipulacion", () => {
  const secret = mfa.generateTotpSecret();
  const encrypted = mfa.encryptSecret(secret);

  assert.match(encrypted, /^mfa1:/);
  assert.equal(encrypted.includes(secret), false);
  assert.equal(mfa.decryptSecret(encrypted), secret);

  const parts = encrypted.split(":");
  const tag = parts[2];
  const flipped = `${tag[0] === "A" ? "B" : "A"}${tag.slice(1)}`;
  const tampered = [parts[0], parts[1], flipped, parts[3]].join(":");
  assert.throws(() => mfa.decryptSecret(tampered));
});

test("los codigos de respaldo se generan y normalizan", async () => {
  const codes = mfa.generateBackupCodes();

  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) {
    assert.match(code, /^[0-9A-F]{5}-[0-9A-F]{5}$/);
    assert.equal(mfa.normalizeBackupCode(code).length, 10);
  }

  const hash = await mfa.hashBackupCode(codes[0]);
  const normalized = mfa.normalizeBackupCode(codes[0]);
  assert.equal(await bcrypt.compare(normalized, hash), true);
});

// ---------------------------------------------------------------------------
// Flujos con base real (se saltan si no hay PostgreSQL)
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

const PASSWORD = "ClaveSegura123";

const createAdmin = async () => {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return Usuarios.create({
    username: `mfaadmin${stamp}`,
    email: `mfaadmin${stamp}@test.local`,
    password: await bcrypt.hash(PASSWORD, 4),
    role: "admin",
    admin: true,
  });
};

const cleanupUser = async (user) => {
  if (!user) return;
  await AdminBackupCode.destroy({ where: { userId: user.id } });
  await AdminMfaChallenge.destroy({ where: { userId: user.id } });
  await AdminSession.destroy({ where: { userId: user.id } });
  await Usuarios.destroy({ where: { id: user.id } });
};

const wrongCode = (valid) => (valid === "000000" ? "111111" : "000000");

test("login admin sin MFA devuelve ticket y el enrolamiento emite sesion", async (t) => {
  if (skipIfNoDb(t)) return;

  const admin = await createAdmin();

  try {
    const first = await callController(login, makeReq({
      body: { username: admin.username, password: PASSWORD },
    }));

    assert.equal(first.statusCode, 403);
    assert.equal(first.body.code, "ADMIN_MFA_SETUP_REQUIRED");
    assert.equal(typeof first.body.enrollmentTicket, "string");
    assert.equal(first.cookies.length, 0);

    const setup = await callController(setupAdminMfa, makeReq({
      body: { enrollmentTicket: first.body.enrollmentTicket },
    }));

    assert.equal(setup.statusCode, 200);
    assert.equal(typeof setup.body.secret, "string");
    assert.match(setup.body.otpauthUrl, /^otpauth:\/\/totp\//);
    assert.equal(setup.body.backupCodes.length, 10);

    const code = mfa.generateTotp(setup.body.secret);
    const enrolled = await callController(enrollAdminMfa, makeReq({
      body: { enrollmentTicket: first.body.enrollmentTicket, code },
    }));

    assert.equal(enrolled.statusCode, 200);
    assert.equal(enrolled.body.mfaEnabled, true);
    assert.equal(enrolled.body.mfaSecretEncrypted, undefined);
    assert.equal(enrolled.cookies.length, 1);
    assert.equal(enrolled.cookies[0].name, "access_token");

    const stored = await Usuarios.findByPk(admin.id);
    assert.equal(stored.mfaEnabled, true);
    assert.ok(stored.mfaEnrolledAt);
    assert.ok(stored.mfaSecretEncrypted.startsWith("mfa1:"));

    const sessions = await AdminSession.findAll({
      where: { userId: admin.id },
    });
    assert.equal(sessions.length, 1);
    assert.ok(sessions[0].mfaAt);
  } finally {
    await cleanupUser(admin);
  }
});

test("login con MFA exige el reto y acepta un TOTP valido", async (t) => {
  if (skipIfNoDb(t)) return;

  const admin = await createAdmin();

  try {
    const enrollment = await mfa.beginEnrollment({ userId: admin.id });
    await admin.update({ mfaEnabled: true, mfaEnrolledAt: new Date() });

    const started = await callController(login, makeReq({
      body: { username: admin.username, password: PASSWORD },
    }));

    assert.equal(started.statusCode, 202);
    assert.equal(started.body.mfaRequired, true);
    assert.equal(typeof started.body.challengeId, "string");
    assert.equal(started.cookies.length, 0);

    const valid = mfa.generateTotp(enrollment.secret);

    const invalid = await callController(verifyAdminMfa, makeReq({
      body: { challengeId: started.body.challengeId, code: wrongCode(valid) },
    }));
    assert.equal(invalid.statusCode, 401);
    assert.equal(invalid.body.code, "MFA_INVALID_CODE");
    assert.equal(invalid.body.attemptsRemaining, 4);

    const verified = await callController(verifyAdminMfa, makeReq({
      body: { challengeId: started.body.challengeId, code: valid },
    }));
    assert.equal(verified.statusCode, 200);
    assert.equal(verified.body.role, "admin");
    assert.equal(verified.cookies.length, 1);

    const session = await AdminSession.findOne({
      where: { userId: admin.id },
    });
    assert.ok(session.mfaAt);
  } finally {
    await cleanupUser(admin);
  }
});

test("un codigo de respaldo sirve una sola vez", async (t) => {
  if (skipIfNoDb(t)) return;

  const admin = await createAdmin();

  try {
    const enrollment = await mfa.beginEnrollment({ userId: admin.id });
    await admin.update({ mfaEnabled: true, mfaEnrolledAt: new Date() });

    const backupCode = enrollment.backupCodes[0];

    const firstChallenge = await mfa.createLoginChallenge({
      userId: admin.id,
    });
    const first = await mfa.verifyLoginChallenge({
      challengeId: firstChallenge.id,
      code: backupCode,
    });
    assert.equal(first.ok, true);
    assert.equal(first.method, "backup_code");

    const secondChallenge = await mfa.createLoginChallenge({
      userId: admin.id,
    });
    const second = await mfa.verifyLoginChallenge({
      challengeId: secondChallenge.id,
      code: backupCode,
    });
    assert.equal(second.ok, false);
    assert.equal(second.code, "MFA_INVALID_CODE");

    const used = await AdminBackupCode.count({
      where: { userId: admin.id, usedAt: { [require("sequelize").Op.ne]: null } },
    });
    assert.equal(used, 1);
  } finally {
    await cleanupUser(admin);
  }
});

test("el reto se bloquea tras el maximo de intentos", async (t) => {
  if (skipIfNoDb(t)) return;

  const admin = await createAdmin();

  try {
    const enrollment = await mfa.beginEnrollment({ userId: admin.id });
    await admin.update({ mfaEnabled: true, mfaEnrolledAt: new Date() });
    const valid = mfa.generateTotp(enrollment.secret);
    const challenge = await mfa.createLoginChallenge({ userId: admin.id });

    let last = null;
    for (let attempt = 0; attempt < ADMIN_MFA_MAX_ATTEMPTS; attempt += 1) {
      last = await mfa.verifyLoginChallenge({
        challengeId: challenge.id,
        code: wrongCode(valid),
      });
      assert.equal(last.ok, false);
    }

    assert.equal(last.code, "MFA_CHALLENGE_LOCKED");
    assert.equal(last.attemptsRemaining, 0);

    const afterLock = await mfa.verifyLoginChallenge({
      challengeId: challenge.id,
      code: valid,
    });
    assert.equal(afterLock.ok, false);
    assert.equal(afterLock.code, "MFA_CHALLENGE_LOCKED");
  } finally {
    await cleanupUser(admin);
  }
});

test("requireAdminSession exige session.mfaAt para un admin con MFA", async (t) => {
  if (skipIfNoDb(t)) return;

  const admin = await createAdmin();

  try {
    await admin.update({ mfaEnabled: true });

    const withoutMfa = await createAdminSession({ userId: admin.id });
    const tokenPayload = {
      id: admin.id,
      sid: withoutMfa.id,
      ver: admin.tokenVersion,
    };
    const jwt = require("jsonwebtoken");
    const {
      JWT_SECRET,
      JWT_ALGORITHM,
      JWT_ISSUER,
      JWT_AUDIENCE,
    } = require("../config.js");
    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      subject: String(admin.id),
      expiresIn: "5m",
    });

    const denied = await callMiddleware(requireAdminSession, {
      cookies: { access_token: token },
      headers: {},
      get: (name) => undefined,
    });
    assert.equal(denied.passed, false);
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, "MFA_REQUIRED");

    const withMfa = await createAdminSession({
      userId: admin.id,
      mfaAt: new Date(),
    });
    const okToken = jwt.sign(
      { id: admin.id, sid: withMfa.id, ver: admin.tokenVersion },
      JWT_SECRET,
      {
        algorithm: JWT_ALGORITHM,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        subject: String(admin.id),
        expiresIn: "5m",
      },
    );

    const accepted = await callMiddleware(requireAdminSession, {
      cookies: { access_token: okToken },
      headers: {},
      get: (name) => undefined,
    });
    assert.equal(accepted.passed, true);
    assert.ok(accepted.body === undefined);
  } finally {
    await cleanupUser(admin);
  }
});

test("la migracion con las tablas MFA sigue siendo idempotente", async (t) => {
  if (skipIfNoDb(t)) return;

  const result = await ensureAdminSecuritySchema();
  assert.equal(result.migrated, false);
});
