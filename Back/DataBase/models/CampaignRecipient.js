const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Destinatario de una campana (ADM-7).
//
// Idempotencia: el par (campaignId, userId) es UNICO (indice en
// ensureCampaignSchema). Reintentar un lote nunca duplica correos porque el
// envio solo toma filas `pending` y las reclama atomicamente con
// FOR UPDATE SKIP LOCKED.
const CampaignRecipient = sequelize.define(
  "CampaignRecipient",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },
    campaignId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "campaigns",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
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
    // Correo congelado al crear la campana (auditoria; el consentimiento
    // real se revalida contra usuarios al enviar). En campanas por WhatsApp
    // queda vacio ("") y el telefono vive en `phone`.
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    // Telefono en E.164 congelado al crear la campana de WhatsApp (ADM-8).
    phone: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    // pending | claimed | sent | failed | excluded
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "pending",
    },
    // Motivo del fallo, recortado (nunca payload completo).
    error: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "campaign_recipients",
    timestamps: true,
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ["campaignId", "userId"],
        name: "campaign_recipients_campaign_user_key",
      },
      {
        fields: ["campaignId", "status"],
        name: "campaign_recipients_campaign_status_idx",
      },
    ],
  },
);

module.exports = { CampaignRecipient };
