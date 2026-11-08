const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Evento de webhook recibido.
//
// Es la barrera de idempotencia: el indice unico (provider, eventId) hace
// que un evento repetido no se procese dos veces. Los proveedores de pago
// reintentan sus eventos durante horas (Wompi especialmente), asi que esto
// no es teorico.
//
// El flujo es:
//   1. Se inserta el evento (processed = false). Si el INSERT choca con el
//      indice unico, el evento ya se recibio antes -> se responde 200 sin
//      reprocesar.
//   2. Se procesa el evento.
//   3. Se marca processed = true (o se guarda el error si fallo).
const WebhookEvent = sequelize.define(
  "WebhookEvent",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },

    // 'wompi' | 'vendelo' | ...
    provider: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },

    // Identificador del evento segun el proveedor. Junto con provider
    // forma el indice unico.
    eventId: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },

    // Tipo de evento ("transaction.updated"), para diagnostico.
    event: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },

    // Payload original. Se guarda completo para poder reconstruir que paso
    // si algo sale mal.
    payload: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },

    processed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // Error si el procesamiento fallo. El evento queda registrado como no
    // procesado para poder revisarlo a mano.
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "webhook_events",
    timestamps: true,
    updatedAt: false,
    indexes: [
      // El indice unico real lo crea la migracion (webhook_events_provider
      // _event_id_unique) porque Sequelize no sabe expresar indices
      // parciales ni compuestos con este patron.
      { fields: ["provider", "eventId"], name: "webhook_events_lookup_idx" },
      { fields: ["processed", "createdAt"], name: "webhook_events_pending_idx" },
    ],
  },
);

module.exports = { WebhookEvent };
