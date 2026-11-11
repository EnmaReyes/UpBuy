const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");
const {
  PRODUCT_STATUS,
  PRODUCT_STATUS_VALUES,
  PRODUCT_PROVIDER_VALUES,
} = require("./enums.js");

// Catalogo de productos publicados en Upbuy.
//
// Reemplaza a la antigua tabla `articulos`. Upbuy es la fuente de verdad del
// producto en venta:
//
//   - `price` es el precio de venta al publico y lo controla el administrador.
//     NUNCA se sobrescribe al sincronizar con el proveedor.
//   - `cost` es lo que Upbuy paga al proveedor (dato interno, no se expone).
//   - `markup` solo se usa para calcular un `price` por defecto al publicar;
//     no se reaplica en cada sincronizacion (no pisa el margen del admin).
//   - `stock` son unidades reales disponibles.
//
// Un producto puede nacer de:
//   - un proveedor externo (`supplierProductId` + `provider`), o
//   - el alta manual del administrador (`provider = 'manual'`).
const Product = sequelize.define(
  "Product",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },
    // SKU propio de Upbuy (unique). Identificador canonico de la tienda.
    sku: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    // Slug publico para la URL de detalle (/producto/[slug]).
    slug: {
      type: DataTypes.STRING(180),
      allowNull: true,
      unique: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Imagenes ordenadas (la principal primero). Se mantiene como cache
    // denormalizada de product_images para los snapshots y el checkout.
    images: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    // Costo que paga Upbuy al proveedor (pesos COP, enteros).
    cost: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    // Markup porcentual usado SOLO para sugerir el precio de venta al publicar.
    markup: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
      validate: { min: 0, max: 1000 },
    },
    // Precio de venta al publico (pesos COP, enteros). Fuente de verdad.
    price: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    // Precio "antes" (tachado). Opcional.
    compareAtPrice: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 0 },
    },
    currency: {
      type: DataTypes.CHAR(3),
      allowNull: false,
      defaultValue: "COP",
    },
    // Unidades reales disponibles. 0 = sin stock.
    stock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    // Producto publicado y visible en el catalogo.
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    // Estado editorial: draft (no publicado) | active | archived.
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: PRODUCT_STATUS.DRAFT,
      validate: { isIn: [PRODUCT_STATUS_VALUES] },
    },
    // Proveedor de origen: el slug del proveedor ('manual' | 'venndelo' | ...).
    // No se valida contra una lista fija para no cerrar la puerta a proveedores
    // nuevos; la relacion real la da `supplierId`.
    provider: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "manual",
    },
    // SKU del producto en el sistema del proveedor (para diagnosticos).
    providerSku: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    // Tallas / variantes ofrecidas (derivadas de las variaciones del proveedor).
    sizes: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    destacadas: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    combo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    descuentoPorcentaje: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      validate: { min: 0, max: 100 },
    },
    // Marcas de personalizacion del administrador. La sincronizacion del
    // catalogo NO pisa los campos marcados aqui.
    //   { price: true, name: true, images: true, category: true, active: true }
    manualOverrides: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Autor del producto (usuario que lo publico).
    uid: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "usuarios",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
  },
  {
    tableName: "products",
    timestamps: true,
    indexes: [
      { fields: ["sku"], name: "products_sku_unique", unique: true },
      { fields: ["slug"], name: "products_slug_unique", unique: true },
      { fields: ["provider"], name: "products_provider_idx" },
      { fields: ["status"], name: "products_status_idx" },
      { fields: ["active"], name: "products_active_idx" },
      { fields: ["uid"], name: "products_uid_idx" },
    ],
  },
);

module.exports = { Product };
