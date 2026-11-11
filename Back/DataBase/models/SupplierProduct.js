const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Producto ORIGINAL tal como lo entrega el proveedor.
//
// Es una copia fiel del catalogo externo (no se edita a mano): el precio de
// venta, el nombre comercial y las imagenes que se publican viven en
// `products`. Aqui se conserva lo que dijo el proveedor, incluido `rawData`,
// para poder auditar y volver a normalizar sin pedir de nuevo la API.
//
// Restricciones:
//   - (supplierId, externalId) es unico: la importacion es idempotente.
//   - `originalPrice` es el precio representativo del proveedor (minimo entre
//     variaciones). El detalle exacto esta en `supplier_product_variations`.
const SupplierProduct = sequelize.define(
  "SupplierProduct",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },
    supplierId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "suppliers",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    // ID del producto en el sistema del proveedor (UUID en Venndelo).
    externalId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    originalPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    currency: {
      type: DataTypes.CHAR(3),
      allowNull: false,
      defaultValue: "COP",
    },
    // Disponibilidad derivada: true si alguna variacion tiene cantidad > 0.
    availability: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // Suma de unidades de todas las variaciones (dato real del proveedor).
    totalQuantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    processingTime: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    // Respuesta cruda del proveedor (JSONB) para diagnostico.
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
    tableName: "supplier_products",
    timestamps: true,
    indexes: [
      {
        fields: ["supplierId", "externalId"],
        name: "supplier_products_supplier_external_unique",
        unique: true,
      },
      { fields: ["supplierId"], name: "supplier_products_supplier_idx" },
      { fields: ["lastSyncedAt"], name: "supplier_products_synced_idx" },
    ],
  },
);

module.exports = { SupplierProduct };
