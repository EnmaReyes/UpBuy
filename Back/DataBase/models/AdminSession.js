const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Sesion administrativa revocable (ADM-S1).
//
// El JWT de un administrador lleva `sid` (esta tabla) y `ver` (tokenVersion).
// `requireAdminSession` verifica en cada peticion que la sesion siga viva y
// que el rol actual del usuario siga siendo administrativo. Asi, degradar a
// un admin o cerrar sesion surte efecto de inmediato, sin esperar a que el
// token expire.
const AdminSession = sequelize.define(
  "AdminSession",
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
    // Ultima vez que la sesion hizo una peticion valida. La expiracion por
    // inactividad se calcula sobre este campo.
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    // Limite absoluto, independiente de la actividad.
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    // Momento del ultimo segundo factor validado. Se usara en ADM-S2/S3
    // para exigir step-up en acciones destructivas.
    mfaAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    ip: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "admin_sessions",
    timestamps: true,
    updatedAt: false,
    indexes: [
      {
        fields: ["userId", "revokedAt"],
        name: "admin_sessions_user_active_idx",
      },
      { fields: ["expiresAt"], name: "admin_sessions_expires_at_idx" },
    ],
  },
);

module.exports = { AdminSession };
