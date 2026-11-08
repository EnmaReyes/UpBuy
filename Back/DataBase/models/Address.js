const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Direccion de envio del usuario.
//
// Hay varias por usuario y una sola principal (isDefault). El indice unico
// parcial "addresses_one_default_per_user" (creado en la migracion) impide
// que haya dos direcciones principales para la misma persona.
//
// El pedido NO depende de esta tabla: al comprar se congela una copia en
// orders.addressSnapshot. Si el usuario borra o cambia su direccion, los
// pedidos ya hechos no se mueven.
const Address = sequelize.define(
  "Address",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "usuarios",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },

    department: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    city: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    // Linea de direccion. Obligatoria: una direccion sin linea no sirve ni
    // para el courier ni para el calculo de envio.
    address: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    // Referencia (torre, apto, "porton azul"): la usan los couriers para
    // ubicar el pedido.
    reference: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },

    isDefault: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    tableName: "addresses",
    timestamps: true,
    indexes: [{ fields: ["userId"], name: "addresses_user_id_idx" }],
  },
);

module.exports = { Address };
