// Revision y retencion de la bitacora de autenticacion (ADM-S4).
//
// `auth_events` es la fuente para investigar intentos fallidos, MFA y cambios
// de sesion. Este servicio solo expone lecturas paginadas y una limpieza
// manual/acotada; nunca toca `audit_logs` de negocio.

const { Op } = require("sequelize");
const {
  AUTH_EVENTS_RETENTION_DAYS,
} = require("../config.js");
const { AuthEvent, Usuarios } = require("../DataBase/models/index.js");

const MAX_LIMIT = 200;

const parseLimit = (value, fallback = 100) => {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, MAX_LIMIT);
};

const parseOffset = (value) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const listAuthEvents = async ({
  event,
  result,
  userId,
  from,
  to,
  limit,
  offset,
} = {}) => {
  const where = {};
  if (event) where.event = String(event).trim().slice(0, 40);
  if (result) where.result = String(result).trim().slice(0, 20);
  if (userId) where.userId = String(userId);
  if (from) where.createdAt = { [Op.gte]: from };
  if (to) {
    where.createdAt = { ...(where.createdAt || {}), [Op.lte]: to };
  }

  const safeLimit = parseLimit(limit);
  const safeOffset = parseOffset(offset);

  const { rows, count } = await AuthEvent.findAndCountAll({
    where,
    include: [
      {
        model: Usuarios,
        as: "user",
        attributes: ["id", "username", "email", "role"],
        required: false,
      },
    ],
    order: [["createdAt", "DESC"]],
    limit: safeLimit,
    offset: safeOffset,
  });

  return {
    events: rows,
    total: count,
    limit: safeLimit,
    offset: safeOffset,
    retentionDays: AUTH_EVENTS_RETENTION_DAYS,
  };
};

// Borra eventos mas antiguos que `olderThanDays`. `0` desactiva la retencion.
const purgeAuthEvents = async ({
  olderThanDays = AUTH_EVENTS_RETENTION_DAYS,
  now = Date.now(),
} = {}) => {
  const days = Math.trunc(Number(olderThanDays));
  if (!Number.isFinite(days) || days <= 0) {
    return { deleted: 0, disabled: true, olderThanDays: 0 };
  }

  const cutoff = new Date(now - days * 24 * 60 * 60 * 1000);
  const deleted = await AuthEvent.destroy({
    where: { createdAt: { [Op.lt]: cutoff } },
  });

  return { deleted, disabled: false, olderThanDays: days, cutoff };
};

module.exports = {
  parseDate,
  listAuthEvents,
  purgeAuthEvents,
};
