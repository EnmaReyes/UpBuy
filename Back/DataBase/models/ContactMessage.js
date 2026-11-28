const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Mensajes del formulario de contacto publico.
//
// Se guardan para auditoria y para que el equipo de soporte de UPBUY pueda
// responderlos desde el panel. El correo de confirmacion se envia por separado
// con la API de Gmail (ver Services/contacto.service.js).
const ContactMessage = sequelize.define(
  "ContactMessage",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },

    // Datos del remitente (del formulario publico).
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    subject: {
      type: DataTypes.STRING(160),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    // Estado del mensaje para el equipo de soporte.
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "nuevo", // nuevo | respondido | archivado
    },

    // IP desde la que se envio el mensaje (para moderacion de spam).
    ip: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },

    // User-Agent del navegador del remitente.
    userAgent: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: "contact_messages",
    timestamps: true,
    indexes: [
      { fields: ["status"], name: "contact_messages_status_idx" },
      { fields: ["createdAt"], name: "contact_messages_created_at_idx" },
      { fields: ["email"], name: "contact_messages_email_idx" },
    ],
  },
);

module.exports = { ContactMessage };
