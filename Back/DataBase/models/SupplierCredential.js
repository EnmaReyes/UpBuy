const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Credenciales de un proveedor.
//
// REGLAS:
//   - Los secretos y tokens NUNCA se guardan en texto plano: se cifran con
//     AES-256-GCM (ver integrations/suppliers/credentials.js) antes de llegar
//     aqui. Las columnas terminan en "Encrypted" a proposito.
//   - `source = 'env'` significa que las credenciales viven en variables de
//     entorno y esta fila solo guarda el token rotado (persistencia).
//   - No se guarda el access_token: es de vida corta y se cachea en memoria.
//
// La tabla existe para que una ROTACION del refresh token no se pierda al
// reiniciar el servidor (Venndelo rota el refresh token periodicamente).
const SupplierCredential = sequelize.define(
  "SupplierCredential",
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
      unique: true,
      references: {
        model: "suppliers",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    clientId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    encryptedClientSecret: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    encryptedRefreshToken: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    refreshTokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    accessTokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastRotatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // 'env' -> las credenciales base vienen del entorno.
    // 'db'  -> ya hay credenciales (rotadas) persistidas en esta fila.
    source: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: "env",
    },
  },
  {
    tableName: "supplier_credentials",
    timestamps: true,
    indexes: [
      {
        fields: ["supplierId"],
        name: "supplier_credentials_supplier_unique",
        unique: true,
      },
    ],
  },
);

module.exports = { SupplierCredential };
