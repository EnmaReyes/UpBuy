const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Reto de segundo factor (ADM-S2).
//
// Un login administrativo correcto no emite cookie: crea una fila aqui y
// devuelve `challengeId`. El codigo TOTP nunca se guarda; `codeHash` queda
// reservado para retos que si necesiten guardar un valor (por ejemplo un
// codigo enviado por correo en una fase posterior).
//
// `attempts` y `usedAt` implementan el bloqueo: al llegar a
// ADMIN_MFA_MAX_ATTEMPTS el reto se marca usado y no se puede reintentar.
const AdminMfaChallenge = sequelize.define(
  "AdminMfaChallenge",
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
    // login | enroll | step_up
    purpose: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "login",
    },
    // Reservado: hash del codigo cuando el reto no es TOTP.
    codeHash: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "admin_mfa_challenges",
    timestamps: true,
    updatedAt: false,
    indexes: [
      {
        fields: ["userId", "purpose"],
        name: "admin_mfa_challenges_user_purpose_idx",
      },
      { fields: ["expiresAt"], name: "admin_mfa_challenges_expires_at_idx" },
    ],
  },
);

module.exports = { AdminMfaChallenge };
