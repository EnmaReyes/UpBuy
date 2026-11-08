// Asociaciones de los modelos del ecommerce.
//
// Se definen en un solo lugar para evitar el problema de los modelos
// actuales (asociaciones como efecto secundario del orden de importacion).
// Los modelos nuevos NO se importan entre si; solo este archivo los cruza.
//
// Las asociaciones historicas (Usuarios<->Articulos, Usuarios<->Banner,
// Category<->Dtf) siguen en sus propios archivos para no cambiar
// comportamiento existente.

const { Usuarios } = require("./Usuarios.js");
const { Order } = require("./Order.js");
const { OrderItem } = require("./OrderItem.js");
const { Payment } = require("./Payment.js");
const { OrderStatusHistory } = require("./OrderStatusHistory.js");
const { Notificacion } = require("./Notificacion.js");
const { Address } = require("./Address.js");
const { WebhookEvent } = require("./WebhookEvent.js");
const { AuditLog } = require("./AuditLog.js");
const { SyncLog } = require("./SyncLog.js");

// ------------------------------- Pedidos -------------------------------
Usuarios.hasMany(Order, {
  foreignKey: "userId",
  as: "orders",
  sourceKey: "id",
});

Order.belongsTo(Usuarios, {
  foreignKey: "userId",
  as: "user",
  targetKey: "id",
});

Order.hasMany(OrderItem, {
  foreignKey: "orderId",
  as: "items",
  onDelete: "CASCADE",
});

OrderItem.belongsTo(Order, {
  foreignKey: "orderId",
  as: "order",
});

Order.hasMany(Payment, {
  foreignKey: "orderId",
  as: "payments",
});

Payment.belongsTo(Order, {
  foreignKey: "orderId",
  as: "order",
});

Order.hasMany(OrderStatusHistory, {
  foreignKey: "orderId",
  as: "history",
});

OrderStatusHistory.belongsTo(Order, {
  foreignKey: "orderId",
  as: "order",
});

OrderStatusHistory.belongsTo(Usuarios, {
  foreignKey: "changedByUserId",
  as: "changedBy",
});

// Los precios ya no cuelgan de un DTF: se resuelven desde price_variants
// (tarifa global) y product_prices (excepciones/combos). Los pedidos guardan
// su propio priceSnapshot, por eso OrderItem no tiene asociacion de precio.

// Notificaciones por usuario
Usuarios.hasMany(Notificacion, {
  foreignKey: "userId",
  as: "notificaciones",
  sourceKey: "id",
});

Notificacion.belongsTo(Usuarios, {
  foreignKey: "userId",
  as: "user",
  targetKey: "id",
});

// Una notificacion puede colgar de un pedido (aviso de estado).
Order.hasMany(Notificacion, {
  foreignKey: "orderId",
  as: "notificacionesPedido",
});

Notificacion.belongsTo(Order, {
  foreignKey: "orderId",
  as: "order",
});

// ------------------------------- Direcciones -------------------------------
// Un usuario tiene varias direcciones; una sola es la principal.
Usuarios.hasMany(Address, {
  foreignKey: "userId",
  as: "direcciones",
  sourceKey: "id",
  onDelete: "CASCADE",
});

Address.belongsTo(Usuarios, {
  foreignKey: "userId",
  as: "user",
  targetKey: "id",
});

// ------------------------------- Auditoria ---------------------------------
// Quien hizo el cambio. NULL cuando fue el sistema (cron, webhook).
Usuarios.hasMany(AuditLog, {
  foreignKey: "userId",
  as: "auditorias",
  sourceKey: "id",
});

AuditLog.belongsTo(Usuarios, {
  foreignKey: "userId",
  as: "actor",
  targetKey: "id",
});

// ------------------------------- Sincronizacion ----------------------------
// Bitacora de la conversacion con los proveedores (entrada y salida).
Order.hasMany(SyncLog, {
  foreignKey: "orderId",
  as: "syncLogs",
  onDelete: "CASCADE",
});

SyncLog.belongsTo(Order, {
  foreignKey: "orderId",
  as: "order",
});

// Los eventos de webhook no tienen relacion con el pedido: se guardan
// sueltos porque el pedido se puede resolver DESPUES del evento (o nunca,
// si el evento no es de Upbuy). Se indexa igual por proveedor y fecha.

module.exports = {
  Usuarios,
  Order,
  OrderItem,
  Payment,
  OrderStatusHistory,
  Notificacion,
  Address,
  WebhookEvent,
  AuditLog,
  SyncLog,
};
