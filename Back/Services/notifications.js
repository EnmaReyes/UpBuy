const { Op } = require("sequelize");
const {
  Notificacion,
  Usuarios,
} = require("../DataBase/models/index.js");

const parseLimit = (limit) => Math.min(Math.max(Number(limit) || 30, 1), 100);
const parseOffset = (offset) => Math.max(Number(offset) || 0, 0);

// Crea una notificacion. Si se pasa `clave`, se deduplica (no se crea
// una segunda con la misma clave). Devuelve la notificacion existente
// o la nueva.
const createNotification = async ({
  userId,
  tipo = "cuenta",
  titulo,
  texto = null,
  to = null,
  clave = null,
}) => {
  if (!userId || !titulo) return null;

  if (clave) {
    const existente = await Notificacion.findOne({ where: { clave } });
    if (existente) return existente;
  }

  try {
    return await Notificacion.create({
      userId,
      tipo,
      titulo,
      texto,
      to,
      clave,
    });
  } catch (error) {
    // Clave duplicada por carrera: se ignora silenciosamente.
    if (error?.name === "SequelizeUniqueConstraintError") {
      return Notificacion.findOne({ where: { clave } });
    }
    throw error;
  }
};

const listForUser = async ({ userId, limit, offset }) => {
  const safeLimit = parseLimit(limit);
  const safeOffset = parseOffset(offset);

  const { rows, count } = await Notificacion.findAndCountAll({
    where: { userId },
    order: [["createdAt", "DESC"]],
    limit: safeLimit,
    offset: safeOffset,
  });

  const unread = await Notificacion.count({
    where: { userId, leida: false },
  });

  return { notifications: rows, total: count, unread, limit: safeLimit, offset: safeOffset };
};

const countUnread = async (userId) => {
  return Notificacion.count({ where: { userId, leida: false } });
};

const markRead = async ({ id, userId }) => {
  const item = await Notificacion.findOne({ where: { id, userId } });
  if (!item) return null;
  if (!item.leida) {
    item.leida = true;
    await item.save();
  }
  return item;
};

const markAllRead = async (userId) => {
  await Notificacion.update({ leida: true }, { where: { userId, leida: false } });
};

const deleteOne = async ({ id, userId }) => {
  const item = await Notificacion.findOne({ where: { id, userId } });
  if (!item) return null;
  await item.destroy();
  return item;
};

const deleteAll = async (userId) => {
  await Notificacion.destroy({ where: { userId } });
};

// Helper reutilizable: crea la misma notificación para cada administrador
// (`admin: true`). `claveForAdmin(adminId)` mantiene la idempotencia por
// administrador. Se ejecuta fuera de cualquier transacción y nunca debe
// tumbar la operación principal que la invoca.
const notifyAdmins = async ({
  tipo = "pedido",
  titulo,
  texto = null,
  to = null,
  claveForAdmin = null,
}) => {
  if (!titulo) return;

  const admins = await Usuarios.findAll({
    where: { admin: true },
    attributes: ["id"],
  });

  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.id,
        tipo,
        titulo,
        texto,
        to,
        clave: claveForAdmin ? claveForAdmin(admin.id) : null,
      }),
    ),
  );
};

// Aviso al administrador cuando un cliente crea una compra en la web.
// Solo datos generales (nombre, total y estado): sin email, teléfono ni
// dirección, que son datos sensibles del comprador.
const notifyAdminsOfNewOrder = async (order) => {
  if (!order?.id) return;

  const nombre = order.recipientName ? ` Cliente: ${order.recipientName}.` : "";
  const total = `$${(Number(order.total) || 0).toLocaleString("es-CO")} COP`;

  await notifyAdmins({
    tipo: "pedido",
    titulo: `Nueva compra: ${order.orderNumber}`,
    texto: `Pedido web por total ${total}.${nombre} Estado: pendiente de pago.`,
    to: `/admin/pedidos/${order.id}`,
    claveForAdmin: (adminId) => `pedido:${order.id}:creado:admin:${adminId}`,
  });
};

module.exports = {
  createNotification,
  notifyAdmins,
  notifyAdminsOfNewOrder,
  listForUser,
  countUnread,
  markRead,
  markAllRead,
  deleteOne,
  deleteAll,
};
