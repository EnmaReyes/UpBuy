const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");
const { SYNC_DIRECTION_VALUES } = require("./enums.js");

// Bitacora de sincronizacion con los proveedores.
//
// Reemplaza a las antiguas tablas por proveedor (DropiSyncLog /
// VendeloSyncLog): una sola tabla con la columna 'provider' hace las
// consultas del cron y del panel mucho mas simples.
//
//   direction = 'out' -> nosotros le mandamos algo al proveedor (crear
//                         pedido, empujar un cambio de estado).
//   direction = 'in'  -> leiamos el estado del proveedor (auto-sync).
//
// Los intentos fallidos quedan registrados: el cron los reintenta con
// backoff en la siguiente corrida. No hay workers permanentes ni colas:
// todo pasa por aqui.
const SyncLog = sequelize.define(
  "SyncLog",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },

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

    provider: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },

    direction: {
      type: DataTypes.STRING(10),
      allowNull: false,
      validate: { isIn: [SYNC_DIRECTION_VALUES] },
    },

    // Numero de intento. El primer envio es 1; los reintentos del cron
    // incrementan el numero.
    attempt: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: { min: 1 },
    },

    ok: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    // Lo que se mando / lo que se recibio. Se guardan como JSONB para poder
    // auditar sin volver a preguntar al proveedor.
    request: {
      type: DataTypes.JSONB,
      allowNull: true,
    },

    response: {
      type: DataTypes.JSONB,
      allowNull: true,
    },

    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "sync_logs",
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ["orderId"], name: "sync_logs_order_id_idx" },
      { fields: ["provider", "direction", "ok"], name: "sync_logs_failed_idx" },
      { fields: ["createdAt"], name: "sync_logs_created_at_idx" },
    ],
  },
);

module.exports = { SyncLog };
