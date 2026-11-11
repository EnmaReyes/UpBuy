// Assets (imagenes) de Venndelo Pro.
//
// Endpoints confirmados:
//   POST   /products/{product_id}/assets
//   PUT    /products/{product_id}/assets/{asset_id}
//   DELETE /products/{product_id}/assets/{asset_id}
//
// RESTRICCION DE NEGOCIO (documentada por Venndelo):
//   "Solo aplica a productos propios de la tienda: los productos de proveedores
//    (dropship) se consultan con sus assets, pero no se pueden modificar."
//
// Como Upbuy solo importa productos DE PROVEEDOR, la escritura de assets esta
// bloqueada a proposito: este modulo se usa para LEER las imagenes que entrega
// Venndelo. Las funciones de escritura existen pero rechazan cualquier producto
// con origen de proveedor (que es el 100% de los que importamos), y jamas se
// llaman desde la importacion/sincronizacion.
const HttpError = require("../../../Utils/HttpError.js");
const { adminJson } = require("./venndelo.client.js");

const MAX_IMAGES = 4;

// Imagenes de un producto ya normalizado, ordenadas (posicion 1 = principal).
const listAssets = (product) => {
  const assets = Array.isArray(product?.assets) ? product.assets : [];
  return assets
    .filter((asset) => asset?.url)
    .map((asset) => ({ ...asset, isPrimary: asset.position === 1 }))
    .sort((a, b) => a.position - b.position);
};

// Un producto de proveedor NUNCA se puede editar desde Upbuy.
const assertAssetsMutable = (product) => {
  const fromSupplier = Boolean(product?.supplierProductId || product?.externalId);
  if (fromSupplier) {
    throw new HttpError(
      409,
      "Las imágenes de un producto de proveedor no se pueden modificar desde Upbuy",
    );
  }
};

// Escritura (bloqueada para productos de proveedor). Se dejan implementadas
// para cuando existan productos propios en la tienda Venndelo.
const createAsset = async (supplier, productId, { fileName, contentType, data }) => {
  assertAssetsMutable({ externalId: productId });
  if (!fileName || !data) {
    throw new HttpError(400, "fileName y data (base64) son obligatorios");
  }
  return adminJson(supplier, "POST", `/products/${encodeURIComponent(productId)}/assets`, {
    body: {
      file_name: fileName,
      content_type: contentType,
      data,
    },
  });
};

const replaceAsset = async (
  supplier,
  productId,
  assetId,
  { fileName, contentType, data },
) => {
  assertAssetsMutable({ externalId: productId });
  if (!fileName || !data) {
    throw new HttpError(400, "fileName y data (base64) son obligatorios");
  }
  return adminJson(
    supplier,
    "PUT",
    `/products/${encodeURIComponent(productId)}/assets/${encodeURIComponent(assetId)}`,
    {
      body: {
        file_name: fileName,
        content_type: contentType,
        data,
      },
    },
  );
};

const deleteAsset = async (supplier, productId, assetId) => {
  assertAssetsMutable({ externalId: productId });
  return adminJson(
    supplier,
    "DELETE",
    `/products/${encodeURIComponent(productId)}/assets/${encodeURIComponent(assetId)}`,
  );
};

module.exports = {
  MAX_IMAGES,
  listAssets,
  assertAssetsMutable,
  createAsset,
  replaceAsset,
  deleteAsset,
};