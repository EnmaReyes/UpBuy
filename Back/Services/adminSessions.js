// Sesiones administrativas y auditoria de autenticacion (ADM-S1).
//
// Reglas de vigencia (docs/SEGURIDAD_ADMIN.md):
//   - 2 h de inactividad (`ADMIN_SESSION_IDLE_MINUTES`).
//   - 8 h absolutas desde el login (`ADMIN_SESSION_MAX_HOURS`).
//   - Revocacion inmediata en logout, cambio de rol o cierre manual.
//
// Este servicio no decide permisos: solo dice si la sesion esta viva. El rol
// y los permisos se resuelven en Services/permissions.js a partir de la base.

const {
  ADMIN_SESSION_IDLE_MINUTES,
  ADMIN_SESSION_MAX_HOURS,
} = require("../config.js");
const {
  AdminSession,
  AuthEvent,
} = require("../DataBase/models/index.js");
const { Op } = require("sequelize");
const { logger } = require("../Utils/logger.js");

const IDLE_MINUTES = Math.max(1, Number(ADMIN_SESSION_IDLE_MINUTES) || 120);
const MAX_HOURS = Math.max(1, Number(ADMIN_SESSION_MAX_HOURS) || 8);

const IDLE_MS = IDLE_MINUTES * 60 * 1000;
const MAX_MS = MAX_HOURS * 60 * 60 * 1000;

// Si la ultima peticion fue hace menos de esto, no vale la pena escribir en la
// base solo para mover lastSeenAt.
const TOUCH_THRESHOLD_MS = 60 * 1000;

const MAX_USER_AGENT = 500;

// Datos de red del request. No se guardan cabeceras completas.
const getClientMeta = (req) => ({
  ip: String(req?.ip || "").trim().slice(0, 64) || null,
  userAgent:
    String(req?.get?.("user-agent") || req?.headers?.["user-agent"] || "")
      .trim()
      .slice(0, MAX_USER_AGENT) || null,
});

// Crea la sesion y devuelve el registro. El `sid` viaja en el JWT.
const createAdminSession = async ({ userId, req, mfaAt = null } = {}) => {
  const meta = getClientMeta(req);
  const now = new Date();

  return AdminSession.create({
    userId,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + MAX_MS),
    mfaAt,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
};

// Devuelve la sesion solo si pertenece al usuario, no esta revocada, no paso
// el limite absoluto y no supero la inactividad permitida.
const findActiveSession = async ({ sessionId, userId } = {}) => {
  if (!sessionId || !userId) return null;

  const session = await AdminSession.findOne({
    where: { id: sessionId, userId },
  });
  if (!session || session.revokedAt) return null;

  const now = Date.now();
  const expiresAt = session.expiresAt
    ? new Date(session.expiresAt).getTime()
    : 0;
  if (!expiresAt || expiresAt <= now) return null;

  const lastSeenAt = session.lastSeenAt
    ? new Date(session.lastSeenAt).getTime()
    : 0;
  if (!lastSeenAt || now - lastSeenAt > IDLE_MS) return null;

  return session;
};

// Mueve lastSeenAt como maximo una vez por minuto.
const touchSession = async (session) => {
  if (!session) return;
  const lastSeenAt = session.lastSeenAt
    ? new Date(session.lastSeenAt).getTime()
    : 0;
  if (Date.now() - lastSeenAt < TOUCH_THRESHOLD_MS) return;

  session.lastSeenAt = new Date();
  await session.save();
};

// Marca una sesion concreta como revocada. Devuelve true si la encontro viva.
const revokeSession = async ({ sessionId, userId } = {}) => {
  if (!sessionId) return false;
  const where = { id: sessionId, revokedAt: null };
  if (userId) where.userId = userId;

  const [updated] = await AdminSession.update(
    { revokedAt: new Date() },
    { where },
  );
  return updated > 0;
};

// Revoca todas las sesiones de un usuario. `exceptSessionId` permite mantener
// viva la sesion actual (por ejemplo, al cerrar las demas).
const revokeAllForUser = async (userId, { exceptSessionId = null } = {}) => {
  if (!userId) return 0;
  const where = { userId, revokedAt: null };
  if (exceptSessionId) where.id = { [Op.ne]: exceptSessionId };

  const [updated] = await AdminSession.update(
    { revokedAt: new Date() },
    { where },
  );
  return updated;
};

// Marca la sesion como verificada con un segundo factor reciente (step-up).
// Devuelve true si habia una sesion viva del usuario.
const markSessionMfa = async ({ sessionId, userId, at = new Date() } = {}) => {
  if (!sessionId || !userId) return false;
  const [updated] = await AdminSession.update(
    { mfaAt: at },
    { where: { id: sessionId, userId, revokedAt: null } },
  );
  return updated > 0;
};

// Rotacion de sesion al elevar privilegios (ADM-S4). Crea una sesion nueva y
// revoca la anterior; si la creacion falla, la sesion vieja sigue viva.
const rotateAdminSession = async ({
  sessionId,
  userId,
  req,
  mfaAt = null,
} = {}) => {
  if (!sessionId || !userId) return null;

  const previous = await AdminSession.findOne({
    where: { id: sessionId, userId, revokedAt: null },
  });
  if (!previous) return null;

  const next = await createAdminSession({ userId, req, mfaAt });
  await revokeSession({ sessionId, userId });
  return next;
};

const listActiveSessions = async (userId) => {
  if (!userId) return [];

  const now = new Date();
  const sessions = await AdminSession.findAll({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { [Op.gt]: now },
    },
    order: [["lastSeenAt", "DESC"]],
  });

  return sessions
    .filter((session) => {
      const lastSeen = session.lastSeenAt
        ? new Date(session.lastSeenAt).getTime()
        : 0;
      return lastSeen && Date.now() - lastSeen <= IDLE_MS;
    })
    .map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      mfaAt: session.mfaAt,
      ip: session.ip,
      userAgent: session.userAgent,
    }));
};

// Registro de auditoria. Nunca debe tumbar la operacion principal: si la
// tabla falla, se avisa en el log y se sigue.
const recordAuthEvent = async ({
  userId = null,
  event,
  result = "success",
  req = null,
  metadata = {},
} = {}) => {
  if (!event) return null;

  try {
    const meta = getClientMeta(req);
    return await AuthEvent.create({
      userId,
      event,
      result,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata,
    });
  } catch (error) {
    logger.warn("No se pudo registrar el evento de autenticacion", {
      event,
      result,
      error: error.message,
    });
    return null;
  }
};

module.exports = {
  IDLE_MINUTES,
  MAX_HOURS,
  IDLE_MS,
  MAX_MS,
  getClientMeta,
  createAdminSession,
  findActiveSession,
  touchSession,
  revokeSession,
  revokeAllForUser,
  markSessionMfa,
  rotateAdminSession,
  listActiveSessions,
  recordAuthEvent,
};
