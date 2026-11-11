const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Variacion de un producto del proveedor (talla, color, ...).
//
// Venndelo modela el inventario y el precio por variacion: la cantidad real
// disponible y el `price` viven aqui, no en el producto. Por eso esta tabla
// no se puede colapsar en un campo del producto.
const SupplierProductVariation = sequelize.define(
  "SupplierProductVariation",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },
    supplierProductId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "supplier_products",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    externalId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    sku: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    // Atributos de la variacion { size: "XL", color: "negro" }.
    attributes: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    // Precio de venta final que propone el proveedor (tiendas estandar).
    originalPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    compareAtPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    // Precio al que el proveedor vende a sus distribuidores.
    supplierPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    // Unidades reales disponibles.
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    available: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    rawData: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    lastSyncedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "supplier_product_variations",
    timestamps: true,
    indexes: [
      {
        fields: ["supplierProductId", "externalId"],
        name: "supplier_variations_product_external_unique",
        unique: true,
      },
      {
        fields: ["supplierProductId"],
        name: "supplier_variations_product_idx",
      },
      { fields: ["sku"], name: "supplier_variations_sku_idx" },
    ],
  },
);

module.exports = { SupplierProductVariation };
