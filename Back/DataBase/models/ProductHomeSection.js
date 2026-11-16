const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");
const { HOME_SECTION_VALUES } = require("./enums.js");

// Curaduria de las secciones de la Home (Seleccion, Novedades y Favoritos).
//
// Un producto puede estar en varias secciones y en cada una ocupa una
// `position` (1..4). Lo que el administrador deja aqui SIEMPRE gana al relleno
// automatico; el relleno solo completa los huecos.
//
// `source` distingue lo que puso una persona (`manual`) de lo que puso la
// semilla inicial (`default`). Las filas `manual` se respetan por encima de las
// `default`. La tabla la crea `ensureCatalogSchema.js` (idempotente).
const ProductHomeSection = sequelize.define(
  "ProductHomeSection",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },
    productId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    section: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: { isIn: [HOME_SECTION_VALUES] },
    },
    position: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      validate: { min: 1, max: 4 },
    },
    // manual = lo fijo el administrador; default = lo sembro el script inicial.
    source: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: "manual",
      validate: { isIn: [["manual", "default"]] },
    },
  },
  {
    tableName: "product_home_sections",
    timestamps: true,
    indexes: [
      {
        fields: ["productId", "section"],
        name: "product_home_sections_product_section_uidx",
        unique: true,
      },
      {
        fields: ["section", "position"],
        name: "product_home_sections_section_position_idx",
      },
    ],
  },
);

module.exports = { ProductHomeSection };
