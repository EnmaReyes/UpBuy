const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Cola persistente de pedidos por enviar a Venndelo (patron outbox).
//
// Igual que `mastershop_order_outbox`: el webhook de Wompi solo encola una
// fila. El pedido se crea despues (cron o reintento manual), de modo que una
// funcion de Vercel que muera tras el 200 no pierda la venta.
//
// La fila es el candado: `orderId` es unico por pedido. Asi dos entregas del
// mismo evento no crean dos pedidos en Venndelo.
//
// Estados:
//   pending       -> lista para procesar
//   processing    -> tomada por un worker (lockedAt)
//   done          -> pedido creado; orders.vdIdOrder quedo guardado
//   needs_review  -> falta variante/mapeo o Venndelo rechazo el esquema
//   failed        -> error de configuracion o reintentos agotados
const VenndeloOrderOutbox = sequelize.define(
  "VenndeloOrderOutbox",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "orders",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "pending",
      validate: {
        isIn: [["pending", "processing", "done", "needs_review", "failed"]],
      },
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    nextAttemptAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lockedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "venndelo_order_outbox",
    timestamps: true,
    indexes: [
      {
        fields: ["orderId"],
        name: "venndelo_order_outbox_order_unique",
        unique: true,
      },
      {
        fields: ["status", "nextAttemptAt"],
        name: "venndelo_order_outbox_pending_idx",
      },
    ],
  },
);

module.exports = { VenndeloOrderOutbox };