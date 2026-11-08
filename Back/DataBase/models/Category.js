const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");
const { Dtf } = require("./Dtf.js");

const Category = sequelize.define(
  "Category",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },

    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },

    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "categories",
    timestamps: false,
  },
);

Category.hasMany(Dtf, {
  foreignKey: "categoryId",
  as: "dtfs",
});

Dtf.belongsTo(Category, {
  foreignKey: "categoryId",
  as: "category",
});

module.exports = { Category };
