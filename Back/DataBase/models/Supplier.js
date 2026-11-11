const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Proveedor de dropshipping (Venndelo, Dropi, ...).
//
// El catalogo del proveedor se guarda en `supplier_products`; las credenciales
// en `supplier_credentials`; y cada corrida de sincronizacion en
// `catalog_sync_runs`. El slug identifica al proveedor en `integrations/`.
const Supplier = sequelize.define(
  "Supplier",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(40),
      allowNull: false,
      unique: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    // Base de la API del proveedor (sin credenciales).
    baseUrl: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: "suppliers",
    timestamps: true,
    indexes: [{ fields: ["slug"], name: "suppliers_slug_unique", unique: true }],
  },
);

module.exports = { Supplier };
