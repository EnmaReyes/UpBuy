const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Bitacora de intentos de creacion de pedido en MasterShop.
//
// Cada llamada a `POST /api/orders` (y cada recuperacion por duplicado con
// `GET /api/orders`) deja una fila. Guarda el request y el response YA
// REDACTADOS: nunca la `ms-api-key`, nunca datos de tarjeta (MasterShop no los
// recibe, pero el request se redacta igual por disciplina).
//
// Es la evidencia para responder "¿por que este pedido no existe en
// MasterShop?" sin tener que reproducir el fallo.
const MastershopOrderAttempt = sequelize.define(
  "MastershopOrderAttempt",
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
    // Numero de intento (1..N) dentro del ciclo del pedido.
    attempt: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    // 'create' | 'recover' (recuperacion tras el duplicado)
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
    // idOrder que devolvio MasterShop (si lo hubo).
    msIdOrder: {
      type: DataTypes.BIGINT,
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
    tableName: "mastershop_order_attempts",
    timestamps: true,
    updatedAt: false,
    indexes: [
      {
        fields: ["orderId", "createdAt"],
        name: "mastershop_order_attempts_order_idx",
      },
    ],
  },
);

module.exports = { MastershopOrderAttempt };
