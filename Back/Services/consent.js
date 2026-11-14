// Consentimiento y audiencia de campanas (ADM-7).
//
// REGLA CENTRAL: la difusion promocional solo va a usuarios con
//   marketingOptIn = true, sin baja y sin rebote, con correo, cuenta activa
//   y rol de comprador. Los administradores (support/admin/superadmin)
//   NUNCA reciben promociones.
//
// La baja manda sobre el opt-in: aunque marketingOptIn siga en true, un
// `unsubscribedAt` o un `emailBouncedAt` excluyen al usuario de toda
// audiencia, incluso si fue creado dentro de una campana (el envio revalida
// el consentimiento por destinatario antes de cada correo).

const { Op, literal } = require("sequelize");
const { Usuarios } = require("../DataBase/models/index.js");
const { normalizePhone } = require("./whatsapp/index.js");

const SEGMENTS = Object.freeze({
  todos: "todos",
  compradores: "compradores",
  sin_compras: "sin_compras",
});

const SEGMENT_LABELS = Object.freeze({
  todos: "Todos los usuarios con consentimiento",
  compradores: "Solo compradores (con al menos un pedido)",
  sin_compras: "Registrados sin pedidos",
});

const isValidSegment = (segment) => Boolean(SEGMENTS[segment]);

// Where base de consentimiento. Pure: no consulta la base.
const consentWhere = () => ({
  role: "customer", // excluye admins y staff
  disabled: false,
  marketingOptIn: true,
  unsubscribedAt: null,
  emailBouncedAt: null,
  email: { [Op.ne]: null },
});

// Where por segmento. `compradores` y `sin_compras` usan un EXISTS sobre
// orders; usuarios.id es la PK de la tabla usuarios (nombre de tabla real).
const audienceWhere = (segment) => {
  const where = consentWhere();

  if (segment === SEGMENTS.compradores) {
    where.id = {
      [Op.in]: literal(`(SELECT "userId" FROM orders WHERE "userId" IS NOT NULL)`),
    };
  } else if (segment === SEGMENTS.sin_compras) {
    where.id = {
      [Op.notIn]: literal(
        `(SELECT "userId" FROM orders WHERE "userId" IS NOT NULL)`,
      ),
    };
  }

  return where;
};

// Conteo + muestra (10) de la audiencia. Nunca devuelve correos completos en
// masa: la muestra es para el panel, acotada a 10 filas.
const previewAudience = async (segment) => {
  const where = audienceWhere(segment);

  const { count, rows } = await Usuarios.findAndCountAll({
    where,
    attributes: ["id", "email", "name", "lastName", "marketingOptInAt"],
    order: [["createdAt", "DESC"]],
    limit: 10,
  });

  return {
    segment,
    label: SEGMENT_LABELS[segment],
    count,
    sample: rows.map((user) => ({
      id: user.id,
      email: user.email,
      name: [user.name, user.lastName].filter(Boolean).join(" ").trim(),
      optedInAt: user.marketingOptInAt,
    })),
  };
};

// ---------------------------------------------------------------------------
// Audiencia por WhatsApp (ADM-8).
//
// Consentimiento INDEPENDIENTE del de correo: whatsappOptIn explicito, sin
// baja de WhatsApp y telefono normalizable. Quien tiene opt-in de email pero
// no de WhatsApp NO recibe difusion por WhatsApp y viceversa.
// ---------------------------------------------------------------------------

const whatsappOptInWhere = () => ({
  role: "customer",
  disabled: false,
  whatsappOptIn: true,
  whatsappUnsubscribedAt: null,
  phone: { [Op.ne]: null },
});

// Segrega elegibles (telefono E.164 valido) de excluidos por telefono
// invalido. `countOnly` evita traer toda la tabla cuando solo se necesita
// el conteo de elegibles.
const whatsappAudience = async (segment, { countOnly = false } = {}) => {
  const where = whatsappOptInWhere();

  if (segment === SEGMENTS.compradores) {
    where.id = {
      [Op.in]: literal(`(SELECT "userId" FROM orders WHERE "userId" IS NOT NULL)`),
    };
  } else if (segment === SEGMENTS.sin_compras) {
    where.id = {
      [Op.notIn]: literal(
        `(SELECT "userId" FROM orders WHERE "userId" IS NOT NULL)`,
      ),
    };
  }

  const attributes = countOnly
    ? ["id", "phone"]
    : ["id", "name", "lastName", "phone", "whatsappOptInAt"];

  const rows = await Usuarios.findAll({ where, attributes });

  const eligible = [];
  const invalidPhone = [];
  for (const user of rows) {
    const phone = normalizePhone(user.phone);
    if (phone) {
      eligible.push({ id: user.id, phone });
    } else {
      invalidPhone.push(user.id);
    }
  }

  return { eligible, invalidPhoneIds: invalidPhone, total: rows.length };
};

// Conteo + muestra (10) para el panel. Nunca devuelve telefonos en masa.
const previewWhatsappAudience = async (segment) => {
  const { eligible, invalidPhoneIds } = await whatsappAudience(segment);

  const sample = eligible.slice(0, 10).map((row) => ({
    id: row.id,
    phone: row.phone,
  }));

  return {
    channel: "whatsapp",
    segment,
    label: SEGMENT_LABELS[segment],
    count: eligible.length,
    invalidCount: invalidPhoneIds.length,
    invalidPhoneIds,
    sample,
  };
};

module.exports = {
  SEGMENTS,
  SEGMENT_LABELS,
  isValidSegment,
  consentWhere,
  audienceWhere,
  previewAudience,
  whatsappOptInWhere,
  whatsappAudience,
  previewWhatsappAudience,
};
