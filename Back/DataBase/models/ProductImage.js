const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");

// Imagen de un producto publicado.
//
// Normaliza las imagenes (que antes solo vivian en products.images JSONB) para
// poder consultarlas, ordenarlas y deduplicarlas. `products.images` se mantiene
// sincronizado como cache denormalizada (la principal primero) para no romper
// el checkout ni los snapshots de pedidos.
//
// `externalAssetId` es null para imagenes propias (subidas a mano) y trae el id
// del proveedor cuando la imagen vino de su catalogo.
const ProductImage = sequelize.define(
  "ProductImage",
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
      references: {
        model: "products",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    externalAssetId: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    tableName: "product_images",
    timestamps: true,
    indexes: [
      {
        fields: ["productId", "position"],
        name: "product_images_product_position_unique",
        unique: true,
      },
      {
        fields: ["productId", "externalAssetId"],
        name: "product_images_product_asset_unique",
        unique: true,
      },
      { fields: ["productId"], name: "product_images_product_idx" },
    ],
  },
);

module.exports = { ProductImage };
