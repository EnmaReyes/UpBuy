const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");
const { Usuarios } = require("./Usuarios.js");

const Banner = sequelize.define(
  "banner",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },

    img: {
      type: DataTypes.TEXT,
      allowNull: false,

      get() {
        const rawValue = this.getDataValue("img");

        try {
          return JSON.parse(rawValue);
        } catch {
          return rawValue;
        }
      },
    },
  },
  {
    timestamps: true,
  }
);

Usuarios.hasMany(Banner, {
  foreignKey: "uid",
  as: "userBanner",
  sourceKey: "id",
});

Banner.belongsTo(Usuarios, {
  foreignKey: "uid",
  as: "userBanner",
  targetKey: "id",
});

module.exports = { Banner };