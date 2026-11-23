// Normalizacion de la respuesta de MasterShop a la forma interna de Upbuy.
//
// Todas las funciones son PURAS (sin red ni base de datos) para poder
// probarlas aisladas. Nada aqui inventa campos: si MasterShop no lo manda, el
// valor queda null / 0 / [].
//
// Forma de entrada (confirmada en la documentacion oficial):
//   {
//     idProduct, name, description, basePrice, baseCurrencyPrice,
//     suggestedPrice, stockTotal, nameState, nameType, prodFormatName,
//     urlImageProduct, productProperties, tags, productOwner, variation,
//     warranty*
//   }
//
// IMPORTANTE: el esquema de `variation[]` NO esta documentado (los ejemplos
// solo muestran []). Por eso NO se leen variaciones ni se derivan tallas: se
// importa el producto a nivel de producto con `stockTotal` y `basePrice`.
const {
  toNumberOrNull,
  toInteger,
  cleanText,
  normalizeCurrency,
  buildProductSku,
  buildProductSlug,
  slugify,
} = require("../../../Services/catalog/productIdentity.service.js");

// MasterShop entrega una sola imagen por producto (`urlImageProduct`). Se
// representa como un asset de posicion 1 con id sintetico y estable.
const normalizeAsset = (url) => {
  const clean = String(url || "").trim();
  if (!clean) return [];
  return [
    {
      externalAssetId: "img-1",
      url: clean,
      fileName: null,
      contentType: null,
      size: null,
      position: 1,
      isPrimary: true,
    },
  ];
};

const normalizeProduct = (product) => {
  const totalQuantity = Math.max(toInteger(product?.stockTotal, 0), 0);

  return {
    externalId: String(product?.idProduct ?? "").trim(),
    name: cleanText(product?.name, 255) || "(sin nombre)",
    description: cleanText(product?.description),
    // MasterShop no documenta un tiempo de procesamiento por producto.
    processingTime: null,
    options: [],
    // Sin contrato documentado para `variation`: no se inventan variaciones.
    variations: [],
    assets: normalizeAsset(product?.urlImageProduct),
    originalPrice: toNumberOrNull(product?.basePrice),
    currency: normalizeCurrency(product?.baseCurrencyPrice),
    availability: totalQuantity > 0,
    totalQuantity,
    rawData: product || {},
  };
};

// Tallas: MasterShop no documenta variaciones, asi que un producto publicado
// desde este proveedor no declara tallas.
const productSizes = () => [];

// Prefijo propio de MasterShop; la construccion del SKU y del slug se comparte
// con Venndelo y con el alta manual.
const mastershopSku = (externalId) => buildProductSku(externalId, "MS");

// Paginacion por indice de pagina (page >= 1). El total documentado vive en
// `resultsCount.totalProducts`; si no viene, queda null.
const normalizePage = (data) => {
  const items = Array.isArray(data?.results) ? data.results : [];
  const total = toNumberOrNull(data?.resultsCount?.totalProducts);
  return {
    items,
    total: total === null ? null : Math.max(Math.trunc(total), 0),
  };
};

module.exports = {
  normalizeProduct,
  normalizePage,
  normalizeAsset,
  normalizeCurrency,
  productSizes,
  buildProductSku: mastershopSku,
  buildProductSlug,
  slugify,
};
