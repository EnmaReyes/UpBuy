const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");
const { PRODUCT_TYPE_VALUES } = require("./enums.js");

// Linea de pedido. Guarda una copia del producto para que el pedido no
// cambie si despues se edita o se borra el producto del catalogo.
const OrderItem = sequelize.define(
  "OrderItem",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },

    orderId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "orders",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },

    // Tipo de producto de la linea. Hoy solo 'product'.
    productType: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: { isIn: [PRODUCT_TYPE_VALUES] },
    },

    // Sin FK a proposito: el pedido sobrevive al borrado del producto.
    productId: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    // Identificador de la fila de precio usada (price_variants o
    // product_prices). Sin FK a proposito: el precio puede cambiar o
    // eliminarse y el pedido debe conservar su snapshot.
    variantId: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    imageUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // Variantes / snapshot de seleccion
    size: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    shirtColor: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    shirtName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    dtfSize: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },

    unitPrice: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 0 },
    },
    // Costo unitario que pago al proveedor por este item (pesos COP).
    unitCost: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    // SKU del producto en el sistema del proveedor (para hacer match al sync).
    providerSku: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    // Producto original del proveedor del que salio la linea (sin FK: la
    // trazabilidad no debe impedir borrar el catalogo externo).
    supplierProductId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    // Nombre congelado del producto en el momento de la compra.
    nameSnapshot: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 },
    },
    lineTotal: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 0 },
    },

    // Copia completa del producto en el momento de la compra
    productSnapshot: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },

    // Copia exacta del precio aplicado (tarifa global o excepcion).
    priceSnapshot: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    tableName: "order_items",
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ["orderId"], name: "order_items_order_id_idx" },
      {
        fields: ["productType", "productId"],
        name: "order_items_product_idx",
      },
    ],
  },
);

module.exports = { OrderItem };
