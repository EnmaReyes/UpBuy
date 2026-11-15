// Assets (imagenes) de MasterShop.
//
// La API de MasterShop solo expone una URL de imagen por producto
// (`urlImageProduct`). No hay endpoints documentados para listar, crear,
// editar ni borrar assets, asi que la escritura no existe: este modulo solo
// normaliza/lee lo que entrega el producto.
const HttpError = require("../../../Utils/HttpError.js");

// Imagenes de un producto ya normalizado, ordenadas (posicion 1 = principal).
const listAssets = (product) => {
  const assets = Array.isArray(product?.assets) ? product.assets : [];
  return assets
    .filter((asset) => asset?.url)
    .map((asset) => ({ ...asset, isPrimary: asset.position === 1 }))
    .sort((a, b) => a.position - b.position);
};

// Todo producto importado desde un proveedor es de solo lectura en Upbuy.
const assertAssetsMutable = (product) => {
  const fromSupplier = Boolean(product?.supplierProductId || product?.externalId);
  if (fromSupplier) {
    throw new HttpError(
      409,
      "Las imágenes de un producto de proveedor no se pueden modificar desde Upbuy",
    );
  }
};

const createAsset = async () => {
  throw new HttpError(
    409,
    "MasterShop no documenta escritura de imágenes: la operación no está soportada",
  );
};

module.exports = {
  listAssets,
  assertAssetsMutable,
  createAsset,
};
