const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Categoria interna de Upbuy: agrupa productos en la tienda.
//
// Se relaciona con los productos mediante `product_categories` (N:M): un
// producto puede estar en varias categorias y una categoria agrupa muchos.
//
// OJO: la API de Venndelo NO expone categorias (verificado en su OpenAPI), por
// eso `supplierId` y `externalId` quedan reservados para el proveedor que si
// las exponga; hoy siempre son NULL y la asignacion la hace el administrador.
const Category = sequelize.define(
  "Category",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(140),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    // Orden de aparicion en la tienda.
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    // Reservados para categorias externas de un proveedor que las exponga.
    supplierId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "suppliers",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    externalId: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
  },
  {
    tableName: "categories",
    timestamps: true,
    indexes: [
      { fields: ["slug"], name: "categories_slug_unique", unique: true },
      { fields: ["isActive"], name: "categories_active_idx" },
      {
        fields: ["supplierId", "externalId"],
        name: "categories_supplier_external_idx",
      },
    ],
  },
);

module.exports = { Category };
