// Administracion y gobierno de administradores (ADM-S3).
//
// Aqui viven dos cosas distintas:
//   - Las sesiones del propio administrador autenticado (ADM-S1).
//   - La gestion de roles y estado de otros administradores (ADM-S3), solo para
//     `superadmin` y siempre con step-up reciente.
//
// Reglas que no se negocian:
//   - nadie cambia su propio rol ni desactiva su propia cuenta;
//   - no se puede degradar ni desactivar al ultimo superadmin activo;
//   - todo cambio revoca las sesiones del usuario afectado y queda auditado en
//     `audit_logs` y `auth_events`.

const { Op } = require("sequelize");
const {
  listActiveSessions,
  revokeSession,
  revokeAllForUser,
  recordAuthEvent,
} = require("../Services/adminSessions.js");
const {
  isValidRole,
  isAdminRole,
  resolveRole,
  evaluateAdminChange,
} = require("../Services/permissions.js");
const {
  sequelize,
  Usuarios,
  AuditLog,
} = require("../DataBase/models/index.js");
const { assertUuid } = require("../Utils/ids.js");
const HttpError = require("../Utils/HttpError.js");
const { sendError } = require("../Utils/respond.js");
const { clearSessionCookies } = require("../Services/sessionCookie.js");

const clearSessionCookie = (res) => clearSessionCookies(res);

// ---------------------------------------------------------------------------
// Sesiones del propio administrador (ADM-S1)
// ---------------------------------------------------------------------------

// GET /api/admin/admins/sessions
const listSessions = async (req, res) => {
  try {
    const sessions = await listActiveSessions(req.user.id);
    return res.status(200).json({
      sessions: sessions.map((session) => ({
        ...session,
        current: session.id === req.user.sessionId,
      })),
    });
  } catch (error) {
    return sendError(res, error, "No se pudieron cargar las sesiones");
  }
};

// POST /api/admin/admins/sessions/revoke-all
// Cierra todas las sesiones, incluida la actual: el navegador debe volver a
// iniciar sesión. Se devuelve 204 y se limpia la cookie.
const revokeAll = async (req, res) => {
  try {
    const revoked = await revokeAllForUser(req.user.id);
    await recordAuthEvent({
      userId: req.user.id,
      event: "sessions_revoked_all",
      result: "success",
      req,
      metadata: { revoked },
    });
    clearSessionCookie(res);
    return res.status(204).end();
  } catch (error) {
    return sendError(res, error, "No se pudieron cerrar las sesiones");
  }
};

// DELETE /api/admin/admins/sessions/:id
const revokeOne = async (req, res) => {
  try {
    const sessionId = assertUuid(req.params.id, "sesión");
    const revoked = await revokeSession({
      sessionId,
      userId: req.user.id,
    });
    if (!revoked) {
      throw new HttpError(404, "La sesión no existe o ya está cerrada");
    }

    const isCurrent = sessionId === req.user.sessionId;
    await recordAuthEvent({
      userId: req.user.id,
      event: "session_revoked",
      result: "success",
      req,
      metadata: { sessionId, current: isCurrent },
    });
    if (isCurrent) clearSessionCookie(res);

    return res.status(200).json({ revoked: true, current: isCurrent });
  } catch (error) {
    return sendError(res, error, "No se pudo cerrar la sesión");
  }
};

// ---------------------------------------------------------------------------
// Gobierno de administradores (ADM-S3)
// ---------------------------------------------------------------------------

const MAX_LIMIT = 100;

const parseLimit = (value, fallback = 50) => {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, MAX_LIMIT);
};

const parseOffset = (value) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const adminShape = (user) => {
  const role = resolveRole(user);
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    lastName: user.lastName,
    role,
    admin: isAdminRole(role),
    disabled: Boolean(user.disabled),
    mfaEnabled: Boolean(user.mfaEnabled),
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
};

// GET /api/admin/admins?q=&limit=&offset=
// Lista solo cuentas con rol administrativo (incluye la columna legacy `admin`
// para bases que aun no hicieron el backfill).
const listAdmins = async (req, res) => {
  try {
    const q = String(req.query?.q || "").trim();
    const limit = parseLimit(req.query?.limit);
    const offset = parseOffset(req.query?.offset);

    const where = {
      [Op.or]: [
        { role: { [Op.in]: ["support", "admin", "superadmin"] } },
        { admin: true },
      ],
    };

    if (q) {
      const pattern = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
      where[Op.and] = [
        {
          [Op.or]: [
            { username: { [Op.iLike]: pattern } },
            { email: { [Op.iLike]: pattern } },
          ],
        },
      ];
    }

    const { rows, count } = await Usuarios.findAndCountAll({
      where,
      order: [
        ["role", "ASC"],
        ["createdAt", "ASC"],
      ],
      limit,
      offset,
    });

    return res.status(200).json({
      admins: rows.map(adminShape),
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    return sendError(res, error, "No se pudieron cargar los administradores");
  }
};

// PATCH /api/admin/admins/:id  { role?, disabled? }
// Solo superadmin (lo exige la ruta) y con step-up reciente.
const updateAdmin = async (req, res) => {
  try {
    const adminId = assertUuid(req.params.id, "administrador");
    const body = req.body || {};
    const hasRole = body.role !== undefined;
    const hasDisabled = body.disabled !== undefined;

    if (!hasRole && !hasDisabled) {
      throw new HttpError(400, "Indica el rol o el estado de la cuenta");
    }

    const target = await Usuarios.findByPk(adminId);
    if (!target) throw new HttpError(404, "Administrador no encontrado");

    const currentRole = resolveRole(target);
    const nextRole = hasRole
      ? String(body.role || "")
          .trim()
          .toLowerCase()
      : currentRole;

    if (!isValidRole(nextRole)) {
      throw new HttpError(400, "Rol inválido");
    }

    const nextDisabled = hasDisabled
      ? Boolean(body.disabled)
      : Boolean(target.disabled);

    const noChange =
      nextRole === currentRole &&
      nextDisabled === Boolean(target.disabled);
    if (noChange) {
      return res.status(200).json({ admin: adminShape(target) });
    }

    // Solo se cuentan los superadmins que seguirian activos si el cambio se
    // aplica. Es el dato que protege contra quedarse sin nadie que gobierno.
    let otherActiveSuperAdmins = 0;
    const targetIsActiveSuperadmin =
      currentRole === "superadmin" && !target.disabled;
    const leavesSuperadmin =
      nextRole !== "superadmin" || nextDisabled === true;

    if (targetIsActiveSuperadmin && leavesSuperadmin) {
      otherActiveSuperAdmins = await Usuarios.count({
        where: {
          role: "superadmin",
          disabled: false,
          id: { [Op.ne]: target.id },
        },
      });
    }

    const verdict = evaluateAdminChange({
      actorId: req.user.id,
      targetId: target.id,
      targetRole: currentRole,
      targetDisabled: Boolean(target.disabled),
      nextRole,
      nextDisabled,
      otherActiveSuperAdmins,
    });

    if (!verdict.ok) {
      return res.status(verdict.status).json({
        message: verdict.message,
        code: verdict.code,
      });
    }

    const before = {
      role: currentRole,
      admin: Boolean(target.admin),
      disabled: Boolean(target.disabled),
    };
    const after = {
      role: nextRole,
      admin: isAdminRole(nextRole),
      disabled: nextDisabled,
    };

    const action =
      nextRole !== currentRole && nextDisabled !== Boolean(target.disabled)
        ? "admin_updated"
        : nextRole !== currentRole
          ? "admin_role_changed"
          : "admin_disabled_changed";

    const transaction = await sequelize.transaction();
    try {
      await target.update(
        {
          role: nextRole,
          admin: isAdminRole(nextRole),
          disabled: nextDisabled,
          tokenVersion: Number(target.tokenVersion || 0) + 1,
        },
        { transaction },
      );

      await AuditLog.create(
        {
          userId: req.user.id,
          entity: "user",
          entityId: target.id,
          action,
          before,
          after,
          ip: req.ip || null,
          note: "Gestión de administradores (ADM-S3)",
        },
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // La conexion pudo caerse: el rollback ya no aplica.
      }
      throw error;
    }

    // Cualquier cambio de rol o estado invalida lo que el usuario tenia
    // abierto, incluida una sesion de superadmin en otra pestaña.
    const revokedSessions = await revokeAllForUser(target.id);
    await recordAuthEvent({
      userId: target.id,
      event: "admin_updated",
      result: "success",
      req,
      metadata: {
        actorId: req.user.id,
        before,
        after,
        revokedSessions,
      },
    });

    return res.status(200).json({
      admin: adminShape(target),
      revokedSessions,
    });
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar el administrador");
  }
};

module.exports = {
  listSessions,
  revokeAll,
  revokeOne,
  listAdmins,
  updateAdmin,
};
