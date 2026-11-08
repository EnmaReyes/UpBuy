const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Excepciones de precio por producto y precios de combo.
//
// La tarifa normal vive en price_variants. Esta tabla solo se usa cuando un
// producto necesita un precio propio:
//   - un articulo/DTF con un precio distinto al global,
//   - un articulo combo (kind = "combo"),
//   - una promocion puntual.
//
// Si existe una fila activa aqui, gana sobre la tarifa global.
const ProductPrice = sequelize.define(
  "ProductPrice",
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

    // Sin FK a proposito: el producto puede eliminarse y el precio es
    // informacion de catalogo, no historica. Los pedidos guardan su snapshot.
    productId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    // 'basico' | 'oversize' | 'unico'
    // "unico" se usa para combos que no dependen de la talla.
    tipo: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "unico",
      validate: { isIn: [["basico", "oversize", "unico"]] },
    },

    // 'unit' = precio unitario; 'combo' = precio de combo.
    kind: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "unit",
      validate: { isIn: [["unit", "combo"]] },
    },

    // Pesos colombianos (entero)
    precio: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 0 },
    },

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
    tableName: "product_prices",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["productType", "productId", "tipo", "kind"],
        name: "product_prices_product_tipo_kind_unique",
      },
      {
        fields: ["productType", "productId"],
        name: "product_prices_product_idx",
      },
    ],
  },
);

module.exports = { ProductPrice };
