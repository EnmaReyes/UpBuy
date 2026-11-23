// Normalizacion de la respuesta de Venndelo a la forma interna de Upbuy.
//
// Todas las funciones son PURAS (sin red ni base de datos) para poder
// probarlas aisladas. Nada aqui inventa campos: si Venndelo no lo manda, el
// valor queda null / 0 / [].
//
// Forma de entrada (confirmada en el OpenAPI):
//   ApiProduct {
//     id, name, description, processing_time,
//     options: [{ code, label }],
//     variations: [{ id, option:[{code,value}], quantity, price, compare_at_price,
//                    suggested_retail_price, supplier_price, sku, ... }],
//     assets: [{ id, type:'IMAGE', position, url, file_name, content_type, size }]
//   }
const {
  toNumberOrNull,
  toInteger,
  cleanText,
  buildProductSku,
  buildProductSlug,
  slugify,
  productSizes,
} = require("../../../Services/catalog/productIdentity.service.js");

// Convierte [{code,value}] en { size: "XL", color: "negro" }.
const attributesFromOptions = (options) => {
  if (!Array.isArray(options)) return {};
  const result = {};
  for (const option of options) {
    const code = cleanText(option?.code, 60);
    if (!code) continue;
    result[code] = cleanText(option?.value, 120) ?? "";
  }
  return result;
};

const normalizeVariation = (variation, index = 0) => {
  const quantity = Math.max(toInteger(variation?.quantity, 0), 0);
  const attributes = attributesFromOptions(variation?.option);

  return {
    externalId: String(variation?.id ?? `variation-${index}`),
    sku: cleanText(variation?.sku, 255),
    attributes,
    originalPrice: toNumberOrNull(variation?.price),
    compareAtPrice: toNumberOrNull(variation?.compare_at_price),
    supplierPrice: toNumberOrNull(variation?.supplier_price),
    quantity,
    available: quantity > 0,
    rawData: variation || {},
  };
};

const normalizeAsset = (asset, index = 0) => {
  const position = toInteger(asset?.position, index + 1) || index + 1;
  return {
    externalAssetId: String(asset?.id ?? `asset-${index}`),
    url: String(asset?.url || "").trim(),
    fileName: cleanText(asset?.file_name, 255),
    contentType: cleanText(asset?.content_type, 30),
    size: toNumberOrNull(asset?.size),
    position,
    // La posicion 1 es la imagen principal segun la documentacion.
    isPrimary: position === 1,
  };
};

// Precio representativo del producto: el menor precio de variacion valido.
const representativePrice = (variations) => {
  const prices = variations
    .map((v) => (v.originalPrice === null ? null : Number(v.originalPrice)))
    .filter((price) => Number.isFinite(price) && price >= 0);
  if (!prices.length) return null;
  return Math.min(...prices);
};

const normalizeProduct = (product) => {
  const variations = Array.isArray(product?.variations)
    ? product.variations.map(normalizeVariation)
    : [];

  const assets = (Array.isArray(product?.assets) ? product.assets : [])
    .map(normalizeAsset)
    // Solo imagenes, ordenadas por posicion (la 1 primero).
    .filter((asset) => asset.url && asset.externalAssetId)
    .sort((a, b) => a.position - b.position);

  const totalQuantity = variations.reduce((sum, v) => sum + v.quantity, 0);

  return {
    externalId: String(product?.id ?? "").trim(),
    name: cleanText(product?.name, 255) || "(sin nombre)",
    description: cleanText(product?.description),
    processingTime: cleanText(product?.processing_time, 20),
    options: Array.isArray(product?.options) ? product.options : [],
    variations,
    assets,
    originalPrice: representativePrice(variations),
    currency: "COP",
    availability: totalQuantity > 0,
    totalQuantity,
    rawData: product || {},
  };
};

// Prefijos propios del proveedor; la construccion del SKU y del slug es
// compartida con MasterShop y con el alta manual.
const venndeloSku = (externalId) => buildProductSku(externalId, "VEN");
const venndeloSlug = (name, externalId) => buildProductSlug(name, externalId);

const normalizePage = (data) => {
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    items,
    currPageToken: data?.curr_page_token ?? "",
    nextPageToken: data?.next_page_token ?? "",
    pageItemCount: toInteger(data?.page_item_count, items.length),
  };
};

module.exports = {
  normalizeProduct,
  normalizeVariation,
  normalizeAsset,
  normalizePage,
  attributesFromOptions,
  representativePrice,
  productSizes,
  buildProductSku: venndeloSku,
  buildProductSlug: venndeloSlug,
  slugify,
};