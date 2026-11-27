// Suscripciones de webhook registradas en MasterShop.
//
// MasterShop no ofrece listado de suscripciones y el `idProductWebhook` que
// devuelve el alta NO se puede recuperar despues. Por eso hay que persistirlo:
// sin ese id no se puede habilitar, deshabilitar ni volver a apuntar el webhook.
//
// Eventos relevantes:
//   16 -> cambio de estado del pedido (incluye logistica/tracking)
//   17 -> cambio de estado de la transportadora
//   18 -> pedido entregado
const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

const MastershopWebhook = sequelize.define(
  "MastershopWebhook",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },
    // idWebhook del contrato (16, 17, 18, ...).
    idWebhook: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    // Identificador opaco que devuelve el alta. Unico.
    idProductWebhook: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    isEnable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    lastRegisteredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "mastershop_webhooks",
    timestamps: true,
    indexes: [
      {
        fields: ["idProductWebhook"],
        name: "mastershop_webhooks_product_unique",
        unique: true,
      },
      {
        fields: ["idWebhook"],
        name: "mastershop_webhooks_event_idx",
      },
    ],
  },
);

module.exports = { MastershopWebhook };