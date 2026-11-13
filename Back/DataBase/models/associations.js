// Asociaciones de los modelos del ecommerce.
//
// Se definen en un solo lugar para evitar el problema de los modelos
// actuales (asociaciones como efecto secundario del orden de importacion).
// Los modelos nuevos NO se importan entre si; solo este archivo los cruza.

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
const { AdminSession } = require("./AdminSession.js");
const { AuthEvent } = require("./AuthEvent.js");
const { AdminMfaChallenge } = require("./AdminMfaChallenge.js");
const { AdminBackupCode } = require("./AdminBackupCode.js");
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

// El precio de venta vive en el modelo Product (price). Los pedidos guardan
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

// ------------------- Seguridad administrativa (ADM-S1) ---------------------
// Sesiones revocables y eventos de autenticacion del usuario.
Usuarios.hasMany(AdminSession, {
  foreignKey: "userId",
  as: "adminSessions",
  sourceKey: "id",
  onDelete: "CASCADE",
});

AdminSession.belongsTo(Usuarios, {
  foreignKey: "userId",
  as: "user",
  targetKey: "id",
});

Usuarios.hasMany(AuthEvent, {
  foreignKey: "userId",
  as: "authEvents",
  sourceKey: "id",
});

AuthEvent.belongsTo(Usuarios, {
  foreignKey: "userId",
  as: "user",
  targetKey: "id",
});

// Retos de MFA y codigos de respaldo (ADM-S2).
Usuarios.hasMany(AdminMfaChallenge, {
  foreignKey: "userId",
  as: "mfaChallenges",
  sourceKey: "id",
  onDelete: "CASCADE",
});

AdminMfaChallenge.belongsTo(Usuarios, {
  foreignKey: "userId",
  as: "user",
  targetKey: "id",
});

Usuarios.hasMany(AdminBackupCode, {
  foreignKey: "userId",
  as: "backupCodes",
  sourceKey: "id",
  onDelete: "CASCADE",
});

AdminBackupCode.belongsTo(Usuarios, {
  foreignKey: "userId",
  as: "user",
  targetKey: "id",
});

// Los eventos de webhook no tienen relacion con el pedido: se guardan
// sueltos porque el pedido se puede resolver DESPUES del evento (o nunca,
// si el evento no es de Upbuy). Se indexa igual por proveedor y fecha.

// ------------------------------- Proveedores -------------------------------
// Un proveedor tiene una credencial, muchos productos originales y muchas
// corridas de sincronizacion.
Supplier.hasOne(SupplierCredential, {
  foreignKey: "supplierId",
  as: "credential",
});

SupplierCredential.belongsTo(Supplier, {
  foreignKey: "supplierId",
  as: "supplier",
});

Supplier.hasMany(SupplierProduct, {
  foreignKey: "supplierId",
  as: "products",
});

SupplierProduct.belongsTo(Supplier, {
  foreignKey: "supplierId",
  as: "supplier",
});

Supplier.hasMany(CatalogSyncRun, {
  foreignKey: "supplierId",
  as: "syncRuns",
});

CatalogSyncRun.belongsTo(Supplier, {
  foreignKey: "supplierId",
  as: "supplier",
});

// ------------------------- Catalogo original -------------------------------
// Cada producto del proveedor tiene variaciones (talla/precio/stock) e
// imagenes propias.
SupplierProduct.hasMany(SupplierProductVariation, {
  foreignKey: "supplierProductId",
  as: "variations",
  onDelete: "CASCADE",
});

SupplierProductVariation.belongsTo(SupplierProduct, {
  foreignKey: "supplierProductId",
  as: "supplierProduct",
});

SupplierProduct.hasMany(SupplierProductAsset, {
  foreignKey: "supplierProductId",
  as: "assets",
  onDelete: "CASCADE",
});

SupplierProductAsset.belongsTo(SupplierProduct, {
  foreignKey: "supplierProductId",
  as: "supplierProduct",
});

// ------------------------- Catalogo publicado ------------------------------
// El producto publicado apunta al proveedor y al producto original del que
// salio. Si el producto del proveedor desaparece, el publicado SOBREVIVE
// (SET NULL), porque puede tener pedidos.
Supplier.hasMany(Product, {
  foreignKey: "supplierId",
  as: "publishedProducts",
});

Product.belongsTo(Supplier, {
  foreignKey: "supplierId",
  as: "supplier",
});

SupplierProduct.hasMany(Product, {
  foreignKey: "supplierProductId",
  as: "publishedProducts",
});

Product.belongsTo(SupplierProduct, {
  foreignKey: "supplierProductId",
  as: "supplierProduct",
});

Product.hasMany(ProductImage, {
  foreignKey: "productId",
  as: "gallery",
  onDelete: "CASCADE",
});

ProductImage.belongsTo(Product, {
  foreignKey: "productId",
  as: "product",
});

// Categorias: N:M. La tabla intermedia la crea la migracion
// (ensureCatalogSchema.js) con las FKs en cascada.
Product.belongsToMany(Category, {
  through: "product_categories",
  as: "categories",
  foreignKey: "productId",
  otherKey: "categoryId",
  timestamps: false,
});

Category.belongsToMany(Product, {
  through: "product_categories",
  as: "products",
  foreignKey: "categoryId",
  otherKey: "productId",
  timestamps: false,
});

// El autor del producto (usuario que lo publico).
Usuarios.hasMany(Product, {
  foreignKey: "uid",
  as: "productosPublicados",
  sourceKey: "id",
});

Product.belongsTo(Usuarios, {
  foreignKey: "uid",
  as: "author",
  targetKey: "id",
});

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
  AdminSession,
  AuthEvent,
  AdminMfaChallenge,
  AdminBackupCode,
  Product,
  Category,
  ProductImage,
  Supplier,
  SupplierCredential,
  SupplierProduct,
  SupplierProductVariation,
  SupplierProductAsset,
  CatalogSyncRun,
};
