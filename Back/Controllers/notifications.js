const {
  createNotification,
  listForUser,
  countUnread,
  markRead,
  markAllRead,
  deleteOne,
  deleteAll,
} = require("../Services/notifications.js");
const { sendError } = require("../Utils/respond.js");

// GET /api/notifications?limit=&offset=
const list = async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const result = await listForUser({
      userId: req.user.id,
      limit,
      offset,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudieron cargar las notificaciones");
  }
};

// GET /api/notifications/unread-count
const unreadCount = async (req, res) => {
  try {
    const count = await countUnread(req.user.id);
    return res.status(200).json({ count });
  } catch (error) {
    return sendError(res, error, "No se pudo contar las notificaciones");
  }
};

// PATCH /api/notifications/:id/read
const readOne = async (req, res) => {
  try {
    const item = await markRead({ id: req.params.id, userId: req.user.id });
    if (!item) {
      return res.status(404).json("Notificación no encontrada");
    }
    return res.status(200).json(item);
  } catch (error) {
    return sendError(res, error, "No se pudo marcar la notificación");
  }
};

// PATCH /api/notifications/read-all
const readAll = async (req, res) => {
  try {
    await markAllRead(req.user.id);
    return res.status(200).json("Todas las notificaciones marcadas como leídas");
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar las notificaciones");
  }
};

// DELETE /api/notifications/:id
const removeOne = async (req, res) => {
  try {
    const item = await deleteOne({ id: req.params.id, userId: req.user.id });
    if (!item) {
      return res.status(404).json("Notificación no encontrada");
    }
    return res.status(204).end();
  } catch (error) {
    return sendError(res, error, "No se pudo eliminar la notificación");
  }
};

// DELETE /api/notifications
const removeAll = async (req, res) => {
  try {
    await deleteAll(req.user.id);
    return res.status(204).end();
  } catch (error) {
    return sendError(res, error, "No se pudieron eliminar las notificaciones");
  }
};

module.exports = {
  list,
  unreadCount,
  readOne,
  readAll,
  removeOne,
  removeAll,
};
