// Auditoria de autenticacion para el panel (ADM-S4).
//
// Solo lectura para investigar incidentes (`audit.read`, superadmin) y una
// limpieza manual acotada. No expone contrasenas, tokens ni codigos: solo los
// campos de `auth_events` y el usuario asociado.

const {
  listAuthEvents,
  purgeAuthEvents,
  parseDate,
} = require("../Services/securityLogs.js");
const { recordAuthEvent } = require("../Services/adminSessions.js");
const HttpError = require("../Utils/HttpError.js");
const { sendError } = require("../Utils/respond.js");

// GET /api/admin/audit/events?event=&result=&userId=&from=&to=&limit=&offset=
const listEvents = async (req, res) => {
  try {
    const result = await listAuthEvents({
      event: req.query?.event,
      result: req.query?.result,
      userId: req.query?.userId,
      from: parseDate(req.query?.from),
      to: parseDate(req.query?.to),
      limit: req.query?.limit,
      offset: req.query?.offset,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudo cargar la auditoría");
  }
};

// POST /api/admin/audit/prune  { olderThanDays? }
// Borra solo auth_events antiguos. Minimo 7 dias para evitar borrados
// accidentales de evidencia reciente.
const pruneEvents = async (req, res) => {
  try {
    const requested = req.body?.olderThanDays;
    const days =
      requested === undefined ? undefined : Math.trunc(Number(requested));

    if (days !== undefined && (!Number.isFinite(days) || days < 7)) {
      throw new HttpError(400, "La retención mínima es de 7 días");
    }

    const result = await purgeAuthEvents(
      days === undefined ? {} : { olderThanDays: days },
    );

    await recordAuthEvent({
      userId: req.user.id,
      event: "security_logs_pruned",
      result: "success",
      req,
      metadata: {
        deleted: result.deleted,
        olderThanDays: result.olderThanDays,
      },
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudo limpiar la auditoría");
  }
};

module.exports = { listEvents, pruneEvents };
