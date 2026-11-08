const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");
const {
  NOTIFICATION_CHANNEL,
  NOTIFICATION_CHANNEL_VALUES,
} = require("./enums.js");

// Notificacion por usuario. Se genera desde el backend ante eventos de
// pedidos y de la cuenta, para que el panel muestre novedades sin
// depender del navegador.
const Notificacion = sequelize.define(
  "Notificacion",
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
    tipo: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "cuenta",
    },
    titulo: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    texto: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    to: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    leida: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // Clave de deduplicacion: si se repite el mismo evento, la
    // notificacion existente se conserva (no se duplica).
    clave: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
    },

    // ---------------------------------------------------------------------
    // Contexto de dropshipping.
    // ---------------------------------------------------------------------

    // Pedido al que se refiere la notificacion. NULL para avisos de cuenta.
    orderId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "orders",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },

    // Canal por el que se mando: in_app | email | whatsapp.
    // La in-app es la que ya existe; email y whatsapp se registran aqui
    // para que el historial de envios sea uniforme.
    channel: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: NOTIFICATION_CHANNEL.IN_APP,
      validate: { isIn: [NOTIFICATION_CHANNEL_VALUES] },
    },

    // Cuando se mando de verdad. NULL = pendiente de envio (o solo in-app).
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // Datos que se mandaron (canal, destino, template). Sirve para
    // auditar sin volver a mirar el codigo.
    payload: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    tableName: "notificaciones",
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ["userId", "createdAt"], name: "notificaciones_user_created_idx" },
      { fields: ["userId", "leida"], name: "notificaciones_user_leida_idx" },
      { fields: ["orderId"], name: "notificaciones_order_id_idx" },
    ],
  },
);

module.exports = { Notificacion };
