const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Auditoria de cambios sensibles.
//
// A diferencia de order_status_history (que es el historial legible del
// pedido), aqui se registra QUE CAMBIO en cualquier entidad, con el valor
// anterior y el nuevo, quien lo hizo y desde donde.
//
// Se usa sobre todo en el panel de administracion: cambio de estado de un
// pedido, push al proveedor, ajuste de contabilidad, liquidacion de un COD.
const AuditLog = sequelize.define(
  "AuditLog",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },

    // Quien hizo el cambio. NULL si fue el sistema (cron, webhook).
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "usuarios",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },

    // Entidad afectada: 'order' | 'payment' | 'product' | 'address' ...
    entity: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },

    // Id de la fila afectada (texto, porque no todas las entidades usan UUID).
    entityId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    // Que paso: 'status_changed' | 'provider_pushed' | 'refund_issued' ...
    action: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },

    // Estado anterior (JSON). NULL si la entidad no existia.
    before: {
      type: DataTypes.JSONB,
      allowNull: true,
    },

    // Estado nuevo (JSON).
    after: {
      type: DataTypes.JSONB,
      allowNull: true,
    },

    // IP desde la que llego la peticion.
    ip: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },

    // Correlacion de la peticion: permite seguir un cambio a traves de
    // varias operaciones (cambio de estado + push + notificacion).
    requestId: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },

    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "audit_logs",
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ["entity", "entityId"], name: "audit_logs_entity_idx" },
      { fields: ["createdAt"], name: "audit_logs_created_at_idx" },
      { fields: ["userId"], name: "audit_logs_user_id_idx" },
    ],
  },
);

module.exports = { AuditLog };
