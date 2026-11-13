const bcrypt = require("bcryptjs");
const { Usuarios } = require("../DataBase/models/Usuarios.js");
const jwt = require("jsonwebtoken");
const {
  JWT_SECRET,
  JWT_ALGORITHM,
  JWT_ISSUER,
  JWT_AUDIENCE,
  ADMIN_SESSION_MAX_HOURS,
  ADMIN_MFA_REQUIRED,
  ADMIN_STEP_UP_MINUTES,
} = require("../config.js");
const { Op } = require("sequelize");
const {
  isAdminRole,
  resolveRole,
} = require("../Services/permissions.js");
const {
  createAdminSession,
  revokeSession,
  getClientMeta,
  recordAuthEvent,
  findActiveSession,
  rotateAdminSession,
} = require("../Services/adminSessions.js");
const {
  createEnrollmentTicket,
  verifyEnrollmentTicket,
  beginEnrollment,
  completeEnrollment,
  createLoginChallenge,
  verifyLoginChallenge,
  verifyAdminCode,
} = require("../Services/mfa.js");
const {
  setSessionCookie,
  clearSessionCookies,
  readSessionToken,
} = require("../Services/sessionCookie.js");
const { isRequestIpAllowed } = require("../Middlewares/requireAdminIp.js");
const { notifyFailedAttempts } = require("../Services/securityAlerts.js");

const TOKEN_EXPIRATION = "12h";
const COOKIE_MAX_AGE = 12 * 60 * 60 * 1000; // 12 horas

const verifyOptions = {
  algorithms: [JWT_ALGORITHM],
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
};

// Firma el JWT de sesion. Compartido por login y rotacion de step-up.
const signSessionToken = (user, { sessionId = null, mfaAt = null } = {}) => {
  const role = resolveRole(user);
  const admin = isAdminRole(role);
  const payload = { id: user.id, ver: Number(user.tokenVersion || 0) };
  if (sessionId) payload.sid = sessionId;
  if (mfaAt) payload.mfaAt = new Date(mfaAt).toISOString();

  return jwt.sign(payload, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    subject: String(user.id),
    expiresIn: admin ? `${ADMIN_SESSION_MAX_HOURS}h` : TOKEN_EXPIRATION,
  });
};

const cookieMaxAgeFor = (user) =>
  isAdminRole(resolveRole(user))
    ? ADMIN_SESSION_MAX_HOURS * 60 * 60 * 1000
    : COOKIE_MAX_AGE;

// Emite la sesion propia de UPBUY (JWT en cookie httpOnly) y responde con el
// usuario sin la contrasena. Compartida por login tradicional y social.
//
// El token lleva `id` (y `sub`) y `ver` (tokenVersion). Si el usuario es
// administrador tambien lleva `sid`, que apunta a una fila viva de
// `admin_sessions`. El rol se consulta en la base en cada ruta administrativa:
// un token viejo con `admin: true` no autoriza nada.
const issueSession = async (res, user, req = null, { mfaAt = null } = {}) => {
  const admin = isAdminRole(resolveRole(user));

  let session = null;
  if (admin) {
    session = await createAdminSession({
      userId: user.id,
      req,
      mfaAt: mfaAt || null,
    });
  }

  const token = signSessionToken(user, {
    sessionId: session?.id,
    mfaAt,
  });

  const {
    password,
    gmailRefreshToken,
    mfaSecretEncrypted,
    ...userData
  } = user.toJSON();

  setSessionCookie(res, token, { maxAge: cookieMaxAgeFor(user) });
  return res.status(200).json(userData);
};

const register = async (req, res) => {
  try {
    const { username, email, password } = req.body || {};

    // Validacion minima de entrada (no confiar solo en el frontend)
    if (
      typeof username !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !username.trim() ||
      !email.trim() ||
      password.length < 8
    ) {
      return res.status(400).json("Datos de registro invalidos");
    }

    const normalizedEmail = email.trim().toLowerCase();

    //? Verificar usuarios existentes (colision por email O por username)
    const existingUser = await Usuarios.findOne({
      where: {
        [Op.or]: [{ email: normalizedEmail }, { username: username.trim() }],
      },
    });

    if (existingUser) {
      return res.status(409).json("Usuario Existente");
    }

    //? Hash de contrasena y crear usuario
    const hash = await bcrypt.hash(password, 10);

    await Usuarios.create({
      email: normalizedEmail,
      username: username.trim(),
      password: hash,
    });
    return res.status(200).json("Usuario creado con éxito");
  } catch (error) {
    console.error("Error en el registro:", error.message);
    return res.status(500).json("Error en el servidor");
  }
};

// Segundo paso del login administrativo (ADM-S2).
//
// Devuelve true si ya respondio (reto o ticket de enrolamiento) y el llamado
// no debe emitir cookie. Se usa igual desde login local y login social, para
// que Google/Facebook no se salten el MFA.
const beginAdminLogin = async (req, res, user) => {
  const role = resolveRole(user);
  if (!isAdminRole(role) || !ADMIN_MFA_REQUIRED) return false;

  // Lista de IPs del panel (ADM-S4). Se aplica aqui, no solo en /api/admin,
  // para que un admin no pueda ni iniciar el segundo paso desde una red ajena.
  if (!isRequestIpAllowed(req)) {
    const meta = getClientMeta(req);
    await recordAuthEvent({
      userId: user.id,
      event: "login",
      result: "denied",
      req,
      metadata: { reason: "ip_not_allowed" },
    });
    await notifyFailedAttempts({
      userId: user.id,
      ip: meta.ip,
      event: "login",
    });
    res.status(403).json({
      message: "Esta dirección IP no tiene acceso al panel administrativo",
      code: "ADMIN_IP_NOT_ALLOWED",
    });
    return true;
  }

  if (!user.mfaEnabled || !user.mfaSecretEncrypted) {
    const enrollmentTicket = createEnrollmentTicket(user);
    await recordAuthEvent({
      userId: user.id,
      event: "login",
      result: "denied",
      req,
      metadata: { reason: "mfa_setup_required" },
    });
    res.status(403).json({
      message:
        "El panel administrativo exige segundo factor. Configúralo para continuar.",
      code: "ADMIN_MFA_SETUP_REQUIRED",
      enrollmentTicket,
      expiresIn: "10m",
    });
    return true;
  }

  const challenge = await createLoginChallenge({ userId: user.id });
  await recordAuthEvent({
    userId: user.id,
    event: "login",
    result: "denied",
    req,
    metadata: { reason: "mfa_required" },
  });

  res.status(202).json({
    mfaRequired: true,
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt,
  });
  return true;
};

const login = async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    const meta = getClientMeta(req);

    // Sin esto, Sequelize recibe un WHERE con undefined y termina en un 500.
    if (!username || !password) {
      return res.status(400).json("Escribe tu usuario y contraseña");
    }

    const existingUser = await Usuarios.findOne({
      where: {
        username,
      },
    });

    if (!existingUser) {
      await recordAuthEvent({
        event: "login",
        result: "failure",
        req,
        metadata: { reason: "unknown_user" },
      });
      await notifyFailedAttempts({ ip: meta.ip, event: "login" });
      return res.status(404).json("Usuario no existente");
    }

    if (existingUser.disabled) {
      await recordAuthEvent({
        userId: existingUser.id,
        event: "login",
        result: "denied",
        req,
        metadata: { reason: "account_disabled" },
      });
      return res.status(403).json("Esta cuenta está desactivada");
    }

    if (!existingUser.password) {
      return res
        .status(400)
        .json("Esta cuenta usa inicio de sesión social (Google/Facebook)");
    }

    const isPasswordCorrect = await bcrypt.compare(
      password,
      existingUser.password
    );

    if (!isPasswordCorrect) {
      await recordAuthEvent({
        userId: existingUser.id,
        event: "login",
        result: "failure",
        req,
        metadata: { reason: "invalid_password" },
      });
      await notifyFailedAttempts({
        userId: existingUser.id,
        ip: meta.ip,
        event: "login",
      });
      return res.status(400).json("Contraseña Errada");
    }

    // Un administrador con MFA configurado recibe un reto; sin MFA configurado
    // recibe el ticket de enrolamiento. En ambos casos la cookie se emite
    // despues del segundo paso.
    if (await beginAdminLogin(req, res, existingUser)) return;

    await existingUser.update({
      lastLoginAt: new Date(),
      lastLoginIp: meta.ip,
    });

    await recordAuthEvent({
      userId: existingUser.id,
      event: "login",
      result: "success",
      req,
    });

    return issueSession(res, existingUser, req);
  } catch (error) {
    console.error("Error en el login:", error.message);
    res.status(500).json("Error interno del servidor");
  }
};

// POST /api/auth/admin/mfa  { challengeId, code }
// Verifica TOTP o codigo de respaldo y emite la cookie administrativa.
const verifyAdminMfa = async (req, res) => {
  try {
    const challengeId = String(req.body?.challengeId || "").trim();
    const code = String(req.body?.code || "").trim();

    if (!challengeId || !code) {
      return res.status(400).json({
        message: "Indica el reto y el código de verificación",
        code: "MFA_CHALLENGE_REQUIRED",
      });
    }

    const result = await verifyLoginChallenge({ challengeId, code });

    if (!result.ok) {
      await recordAuthEvent({
        event: "mfa",
        result: "failure",
        req,
        metadata: { code: result.code },
      });
      await notifyFailedAttempts({
        ip: getClientMeta(req).ip,
        event: "mfa",
      });
      return res.status(result.status).json({
        message: "Código de verificación inválido o expirado",
        code: result.code,
        ...(result.attemptsRemaining !== undefined
          ? { attemptsRemaining: result.attemptsRemaining }
          : {}),
      });
    }

    const meta = getClientMeta(req);
    await result.user.update({
      lastLoginAt: new Date(),
      lastLoginIp: meta.ip,
    });

    await recordAuthEvent({
      userId: result.user.id,
      event: "mfa",
      result: "success",
      req,
      metadata: { method: result.method },
    });

    return issueSession(res, result.user, req, { mfaAt: new Date() });
  } catch (error) {
    console.error("Error en la verificación MFA:", error.message);
    return res.status(500).json("Error interno del servidor");
  }
};

// POST /api/auth/admin/step-up  { code }
// Refresca `admin_sessions.mfaAt` con un TOTP o codigo de respaldo. La accion
// destructiva se reintenta despues: este endpoint no la ejecuta.
const stepUpAdmin = async (req, res) => {
  try {
    if (!req.user?.id || !req.user?.sessionId) {
      return res.status(401).json({
        message: "Vuelve a iniciar sesión para usar el panel",
        code: "ADMIN_SESSION_REQUIRED",
      });
    }

    const code = String(req.body?.code || "").trim();
    if (!code) {
      return res.status(400).json({
        message: "Escribe el código de verificación",
        code: "MFA_CODE_REQUIRED",
      });
    }

    const user = await Usuarios.findByPk(req.user.id, {
      attributes: [
        "id",
        "role",
        "admin",
        "disabled",
        "tokenVersion",
        "mfaEnabled",
        "mfaSecretEncrypted",
      ],
    });

    if (!user || user.disabled || !isAdminRole(resolveRole(user))) {
      return res.status(403).json({
        message: "No tienes permisos de administrador",
        code: "ADMIN_REQUIRED",
      });
    }

    if (
      Number(req.user.tokenVersion || 0) !== Number(user.tokenVersion || 0)
    ) {
      await revokeSession({
        sessionId: req.user.sessionId,
        userId: user.id,
      });
      return res.status(401).json({
        message: "La sesión quedó obsoleta. Inicia sesión de nuevo.",
        code: "SESSION_STALE",
      });
    }

    const session = await findActiveSession({
      sessionId: req.user.sessionId,
      userId: user.id,
    });
    if (!session) {
      return res.status(403).json({
        message: "La sesión administrativa no está activa",
        code: "ADMIN_SESSION_REVOKED",
      });
    }

    const result = await verifyAdminCode({ user, code });
    if (!result.ok) {
      await recordAuthEvent({
        userId: user.id,
        event: "step_up",
        result: "failure",
        req,
        metadata: { code: result.code },
      });
      await notifyFailedAttempts({
        userId: user.id,
        ip: getClientMeta(req).ip,
        event: "step_up",
      });
      return res.status(result.status).json({
        message: "Código de verificación inválido",
        code: result.code,
      });
    }

    const mfaAt = new Date();
    // Rotacion al elevar privilegios: el `sid` viejo se revoca y el JWT se
    // reemite con la sesion nueva. La cookie se actualiza en la misma respuesta.
    const rotated = await rotateAdminSession({
      sessionId: session.id,
      userId: user.id,
      req,
      mfaAt,
    });
    if (!rotated) {
      return res.status(403).json({
        message: "La sesión administrativa no está activa",
        code: "ADMIN_SESSION_REVOKED",
      });
    }

    const token = signSessionToken(user, {
      sessionId: rotated.id,
      mfaAt,
    });
    setSessionCookie(res, token, { maxAge: cookieMaxAgeFor(user) });

    await recordAuthEvent({
      userId: user.id,
      event: "step_up",
      result: "success",
      req,
      metadata: { method: result.method, rotatedSession: true },
    });

    return res.status(200).json({
      ok: true,
      method: result.method,
      mfaAt: mfaAt.toISOString(),
      maxAgeMinutes: ADMIN_STEP_UP_MINUTES,
      sessionExpiresAt: rotated.expiresAt,
    });
  } catch (error) {
    console.error("Error en el step-up administrativo:", error.message);
    return res.status(500).json("Error interno del servidor");
  }
};

// POST /api/auth/admin/mfa/setup  { enrollmentTicket }
// Devuelve el secreto TOTP, la URI otpauth y los codigos de respaldo (una vez).
const setupAdminMfa = async (req, res) => {
  try {
    const ticket = String(req.body?.enrollmentTicket || "").trim();
    if (!ticket) {
      return res.status(400).json({
        message: "Falta el ticket de enrolamiento",
        code: "MFA_TICKET_REQUIRED",
      });
    }

    let payload;
    try {
      payload = verifyEnrollmentTicket(ticket);
    } catch {
      return res.status(401).json({
        message: "El ticket de enrolamiento expiró o no es válido",
        code: "MFA_TICKET_INVALID",
      });
    }

    const user = await Usuarios.findByPk(payload.id);
    if (!user || user.disabled || !isAdminRole(resolveRole(user))) {
      return res.status(403).json({
        message: "No tienes permisos de administrador",
        code: "ADMIN_REQUIRED",
      });
    }

    const enrollment = await beginEnrollment({ userId: user.id });

    await recordAuthEvent({
      userId: user.id,
      event: "mfa_setup",
      result: "success",
      req,
    });

    return res.status(200).json({
      secret: enrollment.secret,
      otpauthUrl: enrollment.otpauthUrl,
      backupCodes: enrollment.backupCodes,
      issuer: enrollment.issuer,
      account: enrollment.account,
    });
  } catch (error) {
    console.error("Error al configurar MFA:", error.message);
    return res.status(500).json("Error interno del servidor");
  }
};

// POST /api/auth/admin/mfa/enroll  { enrollmentTicket, code }
// Activa MFA tras validar el primer TOTP y emite la sesion.
const enrollAdminMfa = async (req, res) => {
  try {
    const ticket = String(req.body?.enrollmentTicket || "").trim();
    const code = String(req.body?.code || "").trim();

    if (!ticket || !code) {
      return res.status(400).json({
        message: "Indica el ticket y el código de verificación",
        code: "MFA_ENROLLMENT_REQUIRED",
      });
    }

    let payload;
    try {
      payload = verifyEnrollmentTicket(ticket);
    } catch {
      return res.status(401).json({
        message: "El ticket de enrolamiento expiró o no es válido",
        code: "MFA_TICKET_INVALID",
      });
    }

    const user = await Usuarios.findByPk(payload.id, {
      attributes: [
        "id",
        "username",
        "email",
        "role",
        "admin",
        "disabled",
        "tokenVersion",
        "mfaEnabled",
        "mfaSecretEncrypted",
        "mfaEnrolledAt",
        "lastLoginAt",
        "lastLoginIp",
      ],
    });

    if (!user || user.disabled || !isAdminRole(resolveRole(user))) {
      return res.status(403).json({
        message: "No tienes permisos de administrador",
        code: "ADMIN_REQUIRED",
      });
    }

    const result = await completeEnrollment({ user, code });
    if (!result.ok) {
      await recordAuthEvent({
        userId: user.id,
        event: "mfa_enroll",
        result: "failure",
        req,
        metadata: { code: result.code },
      });
      await notifyFailedAttempts({
        userId: user.id,
        ip: getClientMeta(req).ip,
        event: "mfa_enroll",
      });
      return res.status(result.status).json({
        message: "Código de verificación inválido",
        code: result.code,
      });
    }

    const meta = getClientMeta(req);
    await result.user.update({
      lastLoginAt: new Date(),
      lastLoginIp: meta.ip,
    });

    await recordAuthEvent({
      userId: user.id,
      event: "mfa_enroll",
      result: "success",
      req,
    });

    return issueSession(res, result.user, req, { mfaAt: new Date() });
  } catch (error) {
    console.error("Error al activar MFA:", error.message);
    return res.status(500).json("Error interno del servidor");
  }
};

// Devuelve el usuario autenticado a partir de la cookie (sin password).
// Usado por el frontend para refrescar los datos de sesion.
const me = async (req, res) => {
  try {
    const token = readSessionToken(req);
    if (!token) {
      return res.status(401).json("No autenticado");
    }
    const userInfo = jwt.verify(token, JWT_SECRET, verifyOptions);

    const user = await Usuarios.findByPk(userInfo.id, {
      attributes: {
        exclude: ["password", "gmailRefreshToken", "mfaSecretEncrypted"],
      },
    });
    if (!user) {
      return res.status(404).json("Usuario no encontrado");
    }
    return res.status(200).json(user);
  } catch (error) {
    return res.status(401).json("Sesión inválida o expirada");
  }
};

const logout = async (req, res) => {
  try {
    const token = readSessionToken(req);

    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET, verifyOptions);
        if (payload.sid) {
          await revokeSession({ sessionId: payload.sid, userId: payload.id });
        }
        await recordAuthEvent({
          userId: payload.id,
          event: "logout",
          result: "success",
          req,
        });
      } catch {
        // Token vencido o invalido: la cookie se limpia igual.
      }
    }

    clearSessionCookies(res);
    return res.status(204).end();
  } catch (error) {
    res.status(500).json("Error interno del servidor");
  }
};

module.exports = {
  register,
  login,
  logout,
  me,
  issueSession,
  beginAdminLogin,
  verifyAdminMfa,
  stepUpAdmin,
  setupAdminMfa,
  enrollAdminMfa,
};
