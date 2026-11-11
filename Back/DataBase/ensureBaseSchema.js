// Crea las tablas BASE del ecommerce cuando la base todavia no las tiene.
//
// POR QUE EXISTE
// --------------
// En produccion (Vercel) `sequelize.sync()` NO corre: el esquema se aplica
// con ensureCatalogSchema() y ensureDropshippingSchema(). Pero esos dos solo
// AGREGAN estructura (ALTER TABLE y CREATE de tablas nuevas); ninguno crea las
// tablas base del ecommerce:
//
//   usuarios, orders, order_items, order_status_history, payments,
//   notificaciones
//
// En local las creaba `sequelize.sync()` (que si corre en desarrollo). En una
// base Neon nueva no existian y el arranque fallaba (ALTER TABLE sobre una
// tabla inexistente). Este modulo cierra ese hueco: crea SOLO las tablas base
// que falten, con el mismisimo modelo de Sequelize (`Model.sync()`), que
// garantiza que la tabla coincide con el modelo (verificado con
// `npm run db:check`).
//
// ORDEN
// -----
// Se ejecuta ANTES de ensureCatalogSchema/ensureDropshippingSchema. Como no
// crea las tablas que ellos gestionan (addresses, webhook_events, audit_logs,
// sync_logs, catalogo...), esos siguen viendo trabajo pendiente y aplican sus
// CHECKs, indices parciales, secuencia y semillas.
//
// SEGURIDAD
// ---------
// `Model.sync()` sin `force`/`alter` solo hace CREATE TABLE IF NOT EXISTS:
// nunca borra ni modifica una tabla existente. Es idempotente y sin riesgo.
// El camino rapido (una consulta de solo lectura) evita incluso ese trabajo
// cuando el esquema ya esta completo.

const { sequelize } = require("./db.js");
const {
  Usuarios,
  Order,
  OrderItem,
  OrderStatusHistory,
  Payment,
  Notificacion,
} = require("./models/index.js");

// Orden de creacion: respeta las claves foraneas
// (usuarios antes que orders; orders antes que sus lineas/pagos/historial).
const BASE_MODELS = [
  ["usuarios", Usuarios],
  ["orders", Order],
  ["order_items", OrderItem],
  ["order_status_history", OrderStatusHistory],
  ["payments", Payment],
  ["notificaciones", Notificacion],
];

const STATE_KEYS = {
  usuarios: "hasUsers",
  orders: "hasOrders",
  order_items: "hasOrderItems",
  order_status_history: "hasHistory",
  payments: "hasPayments",
  notificaciones: "hasNotifications",
};

const getBaseState = async () => {
  const [rows] = await sequelize.query(
    `SELECT
       to_regclass('public.usuarios') IS NOT NULL              AS "hasUsers",
       to_regclass('public.orders') IS NOT NULL                AS "hasOrders",
       to_regclass('public.order_items') IS NOT NULL           AS "hasOrderItems",
       to_regclass('public.order_status_history') IS NOT NULL  AS "hasHistory",
       to_regclass('public.payments') IS NOT NULL              AS "hasPayments",
       to_regclass('public.notificaciones') IS NOT NULL        AS "hasNotifications"`,
  );

  return rows[0] || {};
};

const isComplete = (state) =>
  Object.values(STATE_KEYS).every((key) => Boolean(state[key]));

const ensureBaseSchema = async () => {
  const state = await getBaseState();
  if (isComplete(state)) {
    return { migrated: false };
  }

  console.log("🛠️ Creando el esquema base del ecommerce...");

  for (const [table, model] of BASE_MODELS) {
    if (state[STATE_KEYS[table]]) continue;
    await model.sync();
    console.log(`   - ${table} creada`);
  }

  console.log("✅ Esquema base verificado");
  return { migrated: true };
};

module.exports = {
  ensureBaseSchema,
  getBaseState,
  isComplete,
};
