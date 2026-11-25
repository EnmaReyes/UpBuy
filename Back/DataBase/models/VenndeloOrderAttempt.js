const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Bitacora de intentos de creacion de pedido en Venndelo.
//
// Cada llamada a `POST /orders` deja una fila con request/response ya
// redactados. Es la evidencia para responder "¿por que este pedido no existe
// en Venndelo?" sin reproducir el fallo.
const VenndeloOrderAttempt = sequelize.define(
  "VenndeloOrderAttempt",
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
    attempt: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    // 'create' | 'recover' (recuperacion tras duplicado)
    action: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "create",
      validate: { isIn: [["create", "recover"]] },
    },
    ok: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    httpStatus: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    // true = tiene sentido reintentar (5xx, 429, timeout, red).
    retryable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Id del pedido que devolvio Venndelo (UUID string).
    vdIdOrder: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    requestPayload: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    responseBody: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    durationMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: "venndelo_order_attempts",
    timestamps: true,
    updatedAt: false,
    indexes: [
      {
        fields: ["orderId", "createdAt"],
        name: "venndelo_order_attempts_order_idx",
      },
    ],
  },
);

module.exports = { VenndeloOrderAttempt };