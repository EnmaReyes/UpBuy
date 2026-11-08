const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Tarifa de envio.
//  - Antioquia: rangos por distancia (km) desde la bodega en Itagui.
//  - Nacional:  tarifa plana.
//  - Medellin:  esquema anterior (conservado por pedidos historicos).
// El costo SIEMPRE se resuelve en el backend; el cliente nunca envia el valor.
const ShippingRate = sequelize.define(
  "ShippingRate",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },

    zone: {
      type: DataTypes.STRING(30),
      allowNull: false,
      validate: { isIn: [["medellin", "antioquia", "nacional"]] },
    },

    label: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },

    minKm: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: true,
    },

    maxKm: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: true,
    },

    // Pesos COP
    price: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 0 },
    },

    // Se usa cuando el checkout no envia coordenadas
    isDefault: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "shipping_rates",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["zone", "label"], name: "shipping_rates_zone_label_idx" },
      { fields: ["zone", "active"], name: "shipping_rates_zone_active_idx" },
    ],
  },
);

module.exports = { ShippingRate };
