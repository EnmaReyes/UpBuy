const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Cola persistente de pedidos por enviar a MasterShop (patron outbox).
//
// El webhook de Wompi responde 200 en cuanto la firma y el pago quedan
// registrados: NO crea el pedido en MasterShop dentro de la peticion. Lo que
// deja es una fila aqui. Un proceso posterior (cron o el boton "reintentar
// ahora" del panel) la toma y llama a la API.
//
// Por que una tabla y no un setTimeout:
//   - Si la funcion de Vercel muere despues del 200, el pedido no se pierde.
//   - La fila sirve de candado: una sola fila por pedido (`orderId` unique)
//     evita crear dos pedidos en MasterShop por entregas repetidas del evento.
//
// Estados:
//   pending       -> lista para procesar
//   processing    -> tomada por un worker (lockedAt)
//   done          -> pedido creado; orders.msIdOrder quedo guardado
//   needs_review  -> falta mapeo de variante o MasterShop rechazo el esquema
//   failed        -> se agotaron los reintentos automaticos
const MastershopOrderOutbox = sequelize.define(
  "MastershopOrderOutbox",
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
    // Cuando volver a intentarlo. El backoff lo calcula el servicio.
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
    tableName: "mastershop_order_outbox",
    timestamps: true,
    indexes: [
      {
        fields: ["orderId"],
        name: "mastershop_order_outbox_order_unique",
        unique: true,
      },
      {
        fields: ["status", "nextAttemptAt"],
        name: "mastershop_order_outbox_pending_idx",
      },
    ],
  },
);

module.exports = { MastershopOrderOutbox };
