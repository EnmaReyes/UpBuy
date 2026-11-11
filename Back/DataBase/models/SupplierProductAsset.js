const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Asset (imagen) de un producto del proveedor.
//
// La `url` se guarda EXACTAMENTE como la entrega el proveedor: no se
// transforma ni se inventa. `position` 1 es la imagen principal y
// `externalAssetId` permite reconocerla entre sincronizaciones.
const SupplierProductAsset = sequelize.define(
  "SupplierProductAsset",
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
    // ID del asset en el proveedor (string numerico en Venndelo).
    externalAssetId: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    fileName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    contentType: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    // 1 = imagen principal.
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    tableName: "supplier_product_assets",
    timestamps: true,
    indexes: [
      {
        fields: ["supplierProductId", "externalAssetId"],
        name: "supplier_assets_product_external_unique",
        unique: true,
      },
      {
        fields: ["supplierProductId", "position"],
        name: "supplier_assets_product_position_unique",
        unique: true,
      },
    ],
  },
);

module.exports = { SupplierProductAsset };
