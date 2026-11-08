const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");
const { Usuarios } = require("./Usuarios.js");

// Campaña de correo enviada por un administrador.
const Campaign = sequelize.define(
  "Campaign",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "usuarios",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    subject: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    recipientCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "campaigns",
    timestamps: false,
    indexes: [{ fields: ["adminId", "sentAt"], name: "campaigns_admin_sent_idx" }],
  },
);

Campaign.belongsTo(Usuarios, { foreignKey: "adminId", as: "admin", targetKey: "id" });
Usuarios.hasMany(Campaign, { foreignKey: "adminId", as: "campaigns", sourceKey: "id" });

module.exports = { Campaign };
