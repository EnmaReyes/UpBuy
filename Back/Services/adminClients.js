// Clientes / usuarios para el panel (ADM-9).
//
// Reglas:
//   - El admin edita PERFIL y CONSENTIMIENTOS: nombre, apellido, telefono,
//     direccion, marketingOptIn, whatsappOptIn y (desactivar) disabled.
//     NUNCA rol, admin ni password: eso es gobierno de admins (ADM-S3) y
//     contrasena (propio flujo de seguridad).
//   - Editar no rompe la sesion del usuario ni su profileComplete: el flag se
//     recalcula con la misma regla de Services/profile.js.
//   - Los listados y exports JAMAS incluyen password, tokens ni hashes.
//   - Todo cambio queda en audit_logs (quien, que, antes, despues).

const { Op, fn, col, literal } = require("sequelize");
const { sequelize } = require("../DataBase/db.js");
const {
  Usuarios,
  Address,
  Order,
  AuditLog,
} = require("../DataBase/models/index.js");
const {
  updateProfile,
  findMissingProfileFields,
} = require("./profile.js");
const { createLogger } = require("../Utils/logger.js");

const log = createLogger("admin-clients");

class ClientError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const ATTRS_SAFOS = [
  "id",
  "username",
  "email",
  "name",
  "lastName",
  "phone",
  "address",
  "image",
  "role",
  "disabled",
  "tokenVersion",
  "profileComplete",
  "marketingOptIn",
  "marketingOptInAt",
  "unsubscribedAt",
  "emailBouncedAt",
  "whatsappOptIn",
  "whatsappOptInAt",
  "whatsappUnsubscribedAt",
  "createdAt",
  "lastLoginAt",
];

const FILTERS = Object.freeze({
  segment: ["todos", "con_compras", "sin_compras"],
  consent: ["todos", "email", "whatsapp", "ninguno"],
});

// ---------------------------------------------------------------------------
// Listado
// ---------------------------------------------------------------------------

const buildListWhere = ({ q, segment, consent, registeredFrom, registeredTo }) => {
  const where = { role: "customer" };

  const search = String(q || "").trim();
  if (search) {
    const term = `%${search}%`;
    where[Op.or] = [
      { email: { [Op.iLike]: term } },
      { username: { [Op.iLike]: term } },
      { name: { [Op.iLike]: term } },
      { lastName: { [Op.iLike]: term } },
      { phone: { [Op.iLike]: term } },
    ];
  }

  if (segment === "con_compras") {
    where.id = {
      [Op.in]: literal(`(SELECT "userId" FROM orders WHERE "userId" IS NOT NULL)`),
    };
  } else if (segment === "sin_compras") {
    where.id = {
      [Op.notIn]: literal(
        `(SELECT "userId" FROM orders WHERE "userId" IS NOT NULL)`,
      ),
    };
  }

  if (consent === "email") {
    where.marketingOptIn = true;
  } else if (consent === "whatsapp") {
    where.whatsappOptIn = true;
  } else if (consent === "ninguno") {
    where.marketingOptIn = false;
    where.whatsappOptIn = false;
  }

  const from = new Date(String(registeredFrom || ""));
  if (!Number.isNaN(from.getTime())) where.createdAt = { [Op.gte]: from };
  const to = new Date(String(registeredTo || ""));
  if (!Number.isNaN(to.getTime())) {
    where.createdAt = { ...(where.createdAt || {}), [Op.lte]: to };
  }

  return where;
};

const listClients = async ({
  q,
  segment = "todos",
  consent = "todos",
  registeredFrom,
  registeredTo,
  limit = 20,
  offset = 0,
} = {}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const where = buildListWhere({ q, segment, consent, registeredFrom, registeredTo });

  const { rows, count } = await Usuarios.findAndCountAll({
    where,
    attributes: [
      ...ATTRS_SAFOS,
      // Resumen por fila: un pedido y un total por usuario, sin N+1.
      [
        literal(`(
          SELECT COUNT(*) FROM orders o WHERE o."userId" = usuarios.id
        )`),
        "ordersCount",
      ],
      [
        literal(`(
          SELECT COALESCE(SUM(o.total), 0) FROM orders o
           WHERE o."userId" = usuarios.id
        )`),
        "totalSpent",
      ],
    ],
    order: [["createdAt", "DESC"]],
    limit: safeLimit,
    offset: safeOffset,
  });

  return {
    users: rows,
    total: count,
    limit: safeLimit,
    offset: safeOffset,
  };
};

// ---------------------------------------------------------------------------
// Detalle
// ---------------------------------------------------------------------------

const clientDetail = async (id) => {
  const user = await Usuarios.findByPk(id, {
    attributes: ATTRS_SAFOS,
  });
  if (!user) return null;

  const [addresses, summaryRows] = await Promise.all([
    Address.findAll({
      where: { userId: id },
      order: [["isDefault", "DESC"], ["createdAt", "DESC"]],
      limit: 20,
    }),
    Order.findAll({
      where: { userId: id },
      attributes: [
        [fn("COUNT", col("id")), "ordersCount"],
        [fn("COALESCE", fn("SUM", col("total")), 0), "totalSpent"],
        [fn("MAX", col("createdAt")), "lastOrderAt"],
      ],
      raw: true,
    }),
  ]);

  const summary = summaryRows[0] || {};

  return {
    user,
    addresses,
    summary: {
      ordersCount: Number(summary.ordersCount || 0),
      totalSpent: Number(summary.totalSpent || 0),
      lastOrderAt: summary.lastOrderAt || null,
    },
  };
};

const clientOrders = async (id, { limit = 20, offset = 0 } = {}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const { rows, count } = await Order.findAndCountAll({
    where: { userId: id },
    attributes: [
      "id",
      "orderNumber",
      "total",
      "fulfillmentStatus",
      "paymentState",
      "city",
      "createdAt",
    ],
    order: [["createdAt", "DESC"]],
    limit: safeLimit,
    offset: safeOffset,
  });

  return { orders: rows, total: count, limit: safeLimit, offset: safeOffset };
};

// ---------------------------------------------------------------------------
// Actualizacion
// ---------------------------------------------------------------------------

// Campos editables desde el panel. Cualquier otra clave se ignora: el admin
// no escala roles ni toca contrasenas desde aqui.
const EDITABLE = ["name", "lastName", "phone", "address"];

const updateClient = async ({ id, payload = {}, actorId, ip }) => {
  const user = await Usuarios.findByPk(id);
  if (!user) {
    throw new ClientError(404, "USER_NOT_FOUND", "No se encontró el usuario");
  }

  const before = {
    name: user.name,
    lastName: user.lastName,
    phone: user.phone,
    address: user.address,
    marketingOptIn: user.marketingOptIn,
    whatsappOptIn: user.whatsappOptIn,
    disabled: user.disabled,
  };

  // 1. Perfil: pasa por Services/profile.js (normaliza telefono y recalcula
  //    profileComplete). Nombres cortados a 150, telefono validado.
  const profilePayload = {};
  for (const field of EDITABLE) {
    if (payload[field] !== undefined) profilePayload[field] = payload[field];
  }
  if (Object.keys(profilePayload).length > 0) {
    await updateProfile(id, profilePayload);
  }

  // 2. Consentimientos: toggles de difusion. Al activar se marca el instante;
  //    al desactivar solo se apaga (la baja formal es del usuario).
  const consentUpdate = {};
  if (payload.marketingOptIn !== undefined) {
    consentUpdate.marketingOptIn = Boolean(payload.marketingOptIn);
    consentUpdate.marketingOptInAt = payload.marketingOptIn ? new Date() : null;
  }
  if (payload.whatsappOptIn !== undefined) {
    consentUpdate.whatsappOptIn = Boolean(payload.whatsappOptIn);
    consentUpdate.whatsappOptInAt = payload.whatsappOptIn ? new Date() : null;
  }

  // 3. Desactivar cuenta: requireAuth rechaza a los desactivados. Cambiarlo
  //    es destructivo: el controlador exige step-up. Revoca sesiones: se
  //    sube tokenVersion para invalidar JWT viejos.
  if (payload.disabled !== undefined && Boolean(payload.disabled) !== user.disabled) {
    consentUpdate.disabled = Boolean(payload.disabled);
    consentUpdate.tokenVersion = user.tokenVersion + 1;
  }

  if (Object.keys(consentUpdate).length > 0) {
    await user.update(consentUpdate);
  }

  const after = {
    name: user.name,
    lastName: user.lastName,
    phone: user.phone,
    address: user.address,
    marketingOptIn: user.marketingOptIn,
    whatsappOptIn: user.whatsappOptIn,
    disabled: user.disabled,
  };

  // Auditoria: antes/despues sin datos sensibles (solo flags y contacto).
  try {
    await AuditLog.create({
      userId: actorId || null,
      entity: "usuario",
      entityId: id,
      action: "update",
      before,
      after,
      ip: ip || null,
    });
  } catch (error) {
    log.error("No se pudo auditar el cambio de cliente", {
      entityId: id,
      error: error.message,
    });
  }

  const fresh = await Usuarios.findByPk(id, { attributes: ATTRS_SAFOS });
  // El default de la direccion vive en `addresses` (isDefault): la regla de
  // "perfil completo" lo necesita junto con usuarios.address.
  const defaultAddress = await Address.findOne({
    where: { userId: id, isDefault: true },
  });
  const missing = findMissingProfileFields({ user: fresh, defaultAddress });
  return { user: fresh, missing };
};

// ---------------------------------------------------------------------------
// Export CSV (sin password ni tokens)
// ---------------------------------------------------------------------------

const csvEscape = (value) => {
  const text = String(value ?? "");
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const exportClientsCsv = async () => {
  const users = await Usuarios.findAll({
    where: { role: "customer" },
    attributes: ATTRS_SAFOS,
    order: [["createdAt", "ASC"]],
  });

  const header =
    "id,username,correo,nombre,apellido,telefono,direccion,registrado," +
    "pedidos,gastoTotal,ultimoPedido,marketingOptIn,whatsappOptIn,desactivado";

  // Un agregado por usuario (una sola pasada, sin N+1).
  const summaries = await sequelize.query(
    `SELECT o."userId" AS "userId",
            COUNT(*)::int AS count,
            COALESCE(SUM(o.total), 0) AS spent,
            MAX(o."createdAt") AS last
       FROM orders o
      WHERE o."userId" IS NOT NULL
      GROUP BY o."userId"`,
    { type: sequelize.QueryTypes.SELECT },
  );
  const byUser = new Map(summaries.map((row) => [row.userId, row]));

  const rows = users.map((user) => {
    const summary = byUser.get(user.id);
    return [
      user.id,
      user.username,
      user.email,
      user.name,
      user.lastName,
      user.phone,
      user.address,
      user.createdAt?.toISOString?.() || user.createdAt,
      summary?.count || 0,
      summary?.spent || 0,
      summary?.last || "",
      user.marketingOptIn ? "si" : "no",
      user.whatsappOptIn ? "si" : "no",
      user.disabled ? "si" : "no",
    ]
      .map(csvEscape)
      .join(",");
  });

  return [header, ...rows].join("\n");
};

module.exports = {
  ATTRS_SAFOS,
  FILTERS,
  ClientError,
  clientDetail,
  clientOrders,
  exportClientsCsv,
  listClients,
  updateClient,
};
