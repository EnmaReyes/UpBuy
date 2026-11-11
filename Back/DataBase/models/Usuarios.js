const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");

const { v4: uuidv4 } = require("uuid");

const Usuarios = sequelize.define(
  "usuarios",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING,
      // Nullable: las cuentas sociales no tienen username. El registro
      // tradicional lo sigue exigiendo a nivel de aplicacion.
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
      // Nullable: las cuentas sociales no tienen password local.
      allowNull: true,
    },
    googleId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    facebookId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    admin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    image: {
      type: DataTypes.TEXT,
    },
    name: {
      type: DataTypes.STRING,
    },
    lastName: {
      type: DataTypes.STRING,
    },
    // Datos de contacto del comprador. Se usan como valores por defecto en el
    // checkout y se editan desde "Mi perfil".
    phone: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    address: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    // ---------------------------------------------------------------------
    // Gating de perfil.
    //
    // El usuario debe completar nombre, apellido, telefono y direccion
    // principal antes de poder comprar. Este booleano es el cache de esa
    // regla: se recalcula en cada actualizacion del perfil (ver
    // Services/profile.js) y en la migracion.
    //
    // NO se usa como unica fuente: el middleware revalida los campos reales,
    // asi que un flag desactualizado nunca bloquea a un usuario completo ni
    // deja pasar a uno incompleto.
    // ---------------------------------------------------------------------
    profileComplete: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    // Cuando quedo completo. Permite saber cuando se desbloqueo la compra.
    profileCompleteAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // Token de refresh de Gmail (cifrado) para enviar campañas por correo.
    // Null hasta que el admin autorice la aplicación.
    gmailRefreshToken: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = { Usuarios };
