const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");
const {
  CATALOG_SYNC_STATUS,
  CATALOG_SYNC_STATUS_VALUES,
  CATALOG_SYNC_TRIGGER,
  CATALOG_SYNC_TRIGGER_VALUES,
} = require("./enums.js");

// Bitacora de una corrida de sincronizacion de catalogo.
//
// Permite responder: cuando empezo, cuando termino, cuantos productos llegaron,
// cuantos se crearon/actualizaron/quedaron igual, cuantos errores hubo y en que
// estado quedo la corrida. Es la contraparte de `sync_logs` (que cubre pedidos).
const CatalogSyncRun = sequelize.define(
  "CatalogSyncRun",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },
    supplierId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "suppliers",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    trigger: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: CATALOG_SYNC_TRIGGER.MANUAL,
      validate: { isIn: [CATALOG_SYNC_TRIGGER_VALUES] },
    },
    status: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: CATALOG_SYNC_STATUS.RUNNING,
      validate: { isIn: [CATALOG_SYNC_STATUS_VALUES] },
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    finishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Cursor por el que quedo la importacion (para reanudar si se corta).
    cursor: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    pages: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    received: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    created: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    updated: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    unchanged: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    errors: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // Lista corta de errores (producto + motivo), para diagnostico.
    errorSummary: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    // Quien la disparo (usuario admin), cuando aplica.
    triggeredBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    tableName: "catalog_sync_runs",
    timestamps: true,
    indexes: [
      { fields: ["supplierId"], name: "catalog_sync_runs_supplier_idx" },
      {
        fields: ["supplierId", "status"],
        name: "catalog_sync_runs_supplier_status_idx",
      },
      { fields: ["startedAt"], name: "catalog_sync_runs_started_idx" },
    ],
  },
);

module.exports = { CatalogSyncRun };
