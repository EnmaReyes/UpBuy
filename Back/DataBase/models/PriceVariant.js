const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Tarifa global de precios.
//
// Una fila representa el precio base de una familia de producto y un tipo:
//   { productType: "articulo", tipo: "basico",   precio: 35000 }
//   { productType: "articulo", tipo: "oversize", precio: 60000 }
//   { productType: "dtf",      tipo: "basico",   precio: 22000 }
//   { productType: "dtf",      tipo: "oversize", precio: 32000 }
//
// Cambiar una fila cambia el precio de TODOS los productos de ese tipo que no
// tengan una excepcion en product_prices.
const PriceVariant = sequelize.define(
  "PriceVariant",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },

    // 'articulo' | 'dtf'
    productType: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: { isIn: [["articulo", "dtf"]] },
    },

    // 'basico' | 'oversize'
    tipo: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: { isIn: [["basico", "oversize"]] },
    },

    // Pesos colombianos (entero)
    precio: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 0 },
    },

    // Precio anterior real (se muestra tachado). Es opcional.
    precioAnterior: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 0 },
    },

    activo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "price_variants",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["productType", "tipo"],
        name: "price_variants_product_type_tipo_unique",
      },
    ],
  },
);

module.exports = { PriceVariant };
