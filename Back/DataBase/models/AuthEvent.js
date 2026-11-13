const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Bitacora de eventos de autenticacion (ADM-S1, hallazgo F-08).
//
// Registra login, logout, revocaciones y, en fases posteriores, MFA. Nunca
// guarda contrasenas, tokens ni codigos: `metadata` solo lleva datos minimos
// de diagnostico (por ejemplo el motivo de un rechazo).
const AuthEvent = sequelize.define(
  "AuthEvent",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "usuarios",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    // login | logout | session_revoked | sessions_revoked_all | ...
    event: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    // success | failure | denied
    result: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    ip: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    tableName: "auth_events",
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ["userId", "createdAt"], name: "auth_events_user_idx" },
      { fields: ["event", "createdAt"], name: "auth_events_event_idx" },
      { fields: ["createdAt"], name: "auth_events_created_at_idx" },
    ],
  },
);

module.exports = { AuthEvent };
