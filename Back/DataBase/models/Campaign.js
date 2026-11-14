const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Campana de difusion por email (ADM-7).
//
// El envio nunca corre entero en una peticion: `sendBatch` mueve hasta 25
// destinatarios por pasada y el cron (`/api/cron/campaigns`) continua las
// campanas con pendientes.
const Campaign = sequelize.define(
  "Campaign",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },
    subject: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    // Cuerpo del admin SIN procesar: la plantilla se renderiza al enviar.
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    // Segmento de audiencia (Services/consent.js): todos | compradores |
    // sin_compras.
    segment: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "todos",
    },
    // Canal: por ahora solo email (ADM-8 agrega whatsapp).
    channel: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "email",
    },
    // draft (creada, sin enviar) | sending (con pendientes) | sent
    // (completa) | failed (sin Gmail configurado / bloqueada).
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "draft",
    },
    totalRecipients: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    sentCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    failedCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // Admin que creo la campana (auditoria).
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "usuarios",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    // Resumen del ultimo lote (errores recortados por destinatario).
    lastBatchResult: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "campaigns",
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ["status"], name: "campaigns_status_idx" },
      { fields: ["createdAt"], name: "campaigns_created_at_idx" },
    ],
  },
);

module.exports = { Campaign };
