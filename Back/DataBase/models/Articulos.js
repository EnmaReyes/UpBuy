const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

const Articulos = sequelize.define(
  "articulos",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    desc: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    img: {
      type: DataTypes.JSON,
      defaultValue: {},
      allowNull: false,
    },
    // Tallas disponibles. Es excluyente con `oversize`: una prenda oversize no
    // lleva tallas, por eso se permite un array vacio como valor valido (y es
    // el default), en vez de forzar null o al menos un elemento.
    sizes: {
      type: DataTypes.JSON,
      defaultValue: [],
      allowNull: true,
    },
    oversize: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    stock: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    destacadas: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // Articulo que se vende con precio de combo. El monto vive en
    // product_prices (kind = "combo"); este flag solo lo distingue en la UI.
    combo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // Descuento individual del articulo, en porcentaje entero (0-100).
    // NULL/0 = sin descuento. Es independiente de la tarifa global
    // (price_variants) y de las excepciones (product_prices): el porcentaje
    // se aplica sobre el precio efectivo ya resuelto. NO se llama "descuento"
    // porque esa columna era del esquema viejo y ensurePricing.js la elimina
    // al arrancar en produccion. Los combos no usan descuento individual.
    descuentoPorcentaje: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      validate: { min: 0, max: 100 },
    },
    // Autor del articulo. Se declara explicitamente: antes solo existia como
    // efecto secundario de la asociacion belongsTo en Usuarios.js, lo que
    // hacia que el filtro por uid dependiera del orden de importacion.
    uid: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "usuarios",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    },
  },

  {
    timestamps: false,
  },
);
module.exports = { Articulos };
