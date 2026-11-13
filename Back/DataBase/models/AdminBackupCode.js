const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Codigos de respaldo del MFA administrativo (ADM-S2).
//
// Se guarda solo el hash bcrypt. Cada codigo sirve una sola vez: al validarlo
// se marca `usedAt`. Un codigo usado no se puede reutilizar ni aunque el
// atacante conozca el valor.
const AdminBackupCode = sequelize.define(
  "AdminBackupCode",
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
    codeHash: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "admin_backup_codes",
    timestamps: true,
    updatedAt: false,
    indexes: [
      {
        fields: ["userId", "usedAt"],
        name: "admin_backup_codes_user_used_idx",
      },
    ],
  },
);

module.exports = { AdminBackupCode };
