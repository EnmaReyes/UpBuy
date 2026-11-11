// Punto unico de carga de modelos.
//
// Importar este archivo garantiza que TODOS los modelos y asociaciones
// esten registrados antes de cualquier consulta o de sequelize.sync(),
// sin depender del orden de importacion de rutas y controladores.
//
// Uso: const { Order, OrderItem } = require("../DataBase/models/index.js");

const { sequelize } = require("../db.js");
const { Product } = require("./Product.js");
const { Category } = require("./Category.js");
const { ProductImage } = require("./ProductImage.js");
const { Supplier } = require("./Supplier.js");
const { SupplierCredential } = require("./SupplierCredential.js");
const { SupplierProduct } = require("./SupplierProduct.js");
const {
  SupplierProductVariation,
} = require("./SupplierProductVariation.js");
const { SupplierProductAsset } = require("./SupplierProductAsset.js");
const { CatalogSyncRun } = require("./CatalogSyncRun.js");
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

// Define las asociaciones (requiere los modelos de arriba ya definidos).
require("./associations.js");

module.exports = {
  sequelize,
  // Catalogo
  Product,
  Category,
  ProductImage,
  Supplier,
  SupplierCredential,
  SupplierProduct,
  SupplierProductVariation,
  SupplierProductAsset,
  CatalogSyncRun,
  // Comercio
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
  ...enums,
};
