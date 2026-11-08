const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");
const { HISTORY_KIND, HISTORY_KIND_VALUES } = require("./enums.js");

// Historial unificado: una sola tabla para cambios de estado logistico
// (kind = 'logistica') y de pago (kind = 'pago'). Cada fila es inmutable.
const OrderStatusHistory = sequelize.define(
  "OrderStatusHistory",
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

    kind: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: HISTORY_KIND.LOGISTICA,
      validate: { isIn: [HISTORY_KIND_VALUES] },
    },

    fromStatus: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },

    toStatus: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },

    // NULL = cambio automatico (webhook / sistema)
    changedByUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "usuarios",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },

    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "order_status_history",
    timestamps: true,
    updatedAt: false,
    indexes: [
      {
        fields: ["orderId", "createdAt"],
        name: "order_status_history_order_id_idx",
      },
    ],
  },
);

module.exports = { OrderStatusHistory };
