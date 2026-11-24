const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Excepciones del mapeo de atributos de MasterShop.
//
// El mapeo normal (grafias de nombre como "TALLAS"/"Talla" y de valor como
// "azul"/"AZUL") lo resuelve el codigo puro de
// `integrations/suppliers/mastershop/mastershop.attributes.js`. Esta tabla
// guarda SOLO las excepciones que el codigo no puede adivinar, por ejemplo que
// en el catalogo del proveedor "AZUL MARINO" es el color que UpBuy llama
// "AZUL".
//
//   kind = 'value'      -> source "AZUL MARINO"  target "AZUL"
//   kind = 'attribute'  -> source "MATERIAL"     target "material"
//
// `source` se guarda normalizado (mayusculas para valores, minusculas para
// nombres) para que la comparacion sea estable.
const MastershopAttrAlias = sequelize.define(
  "MastershopAttrAlias",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },
    kind: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: { isIn: [["attribute", "value"]] },
    },
    source: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    target: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "mastershop_attr_alias",
    timestamps: true,
    indexes: [
      {
        fields: ["kind", "source"],
        name: "mastershop_attr_alias_kind_source_unique",
        unique: true,
      },
    ],
  },
);

module.exports = { MastershopAttrAlias };
