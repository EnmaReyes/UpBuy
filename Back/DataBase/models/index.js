// Punto unico de carga de modelos.
//
// Importar este archivo garantiza que TODOS los modelos y asociaciones
// esten registrados antes de cualquier consulta o de sequelize.sync(),
// sin depender del orden de importacion de rutas y controladores.
//
// Uso: const { Order, OrderItem } = require("../DataBase/models/index.js");

const { sequelize } = require("../db.js");
const { Articulos } = require("./Articulos.js");
const { Banner } = require("./Banner.js");
const { Campaign } = require("./Campaign.js");
const { Category } = require("./Category.js");
const { Dtf } = require("./Dtf.js");
const { PriceVariant } = require("./PriceVariant.js");
const { ProductPrice } = require("./ProductPrice.js");
const { ShippingRate } = require("./ShippingRate.js");
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
const enums = require("./enums.js");

// Define las asociaciones nuevas (Requiere los modelos de arriba ya definidos)
require("./associations.js");

module.exports = {
  sequelize,
  Articulos,
  Banner,
  Campaign,
  Category,
  Dtf,
  Notificacion,
  PriceVariant,
  ProductPrice,
  ShippingRate,
  Usuarios,
  Order,
  OrderItem,
  Payment,
  OrderStatusHistory,
  Address,
  WebhookEvent,
  AuditLog,
  SyncLog,
  ...enums,
};
