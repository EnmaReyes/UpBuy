// Normalizacion de la respuesta de MasterShop a la forma interna de UpBuy.
//
// Todas las funciones son PURAS (sin red ni base de datos) para poder
// probarlas aisladas. Nada aqui inventa campos: si MasterShop no lo manda, el
// valor queda null / 0 / [].
//
// Forma de entrada (confirmada contra la API real el 2026-11-24):
//   {
//     idProduct, name, description, basePrice, baseCurrencyPrice,
//     suggestedPrice, stockTotal, nameState, nameType, prodFormatName,
//     urlImageProduct, productProperties, tags, productOwner, variation,
//     warranty*
//   }
//
// `variation[]` SI viene documentado por la API real (aunque no por la
// documentacion escrita) y llega poblado incluso en el listado:
//
//   { sku, name, price, stock, weight, options: [{ propertyName, nameValue }],
//     package, isEnable, idProduct, idVariant, weightUnit }
//
// Dos particularidades verificadas:
//   - Cada producto trae una "Default Variant" (sku: null, options: null,
//     stock: 0) que NO es una variante vendible: se descarta.
//   - `sku` puede ser null: la identidad real es `idVariant`.
const {
  toNumberOrNull,
  toInteger,
  cleanText,
  normalizeCurrency,
  buildProductSku,
  buildProductSlug,
  slugify,
} = require("../../../Services/catalog/productIdentity.service.js");
const {
  attributesFromOptions,
  isDefaultVariant,
  sizesOf,
} = require("./mastershop.attributes.js");

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

// Una variacion vendible. `externalId` es el `idVariant` de MasterShop: es lo
// que se manda como `id_variant` al crear el pedido.
const normalizeVariation = (variation, index = 0) => {
  if (!variation || typeof variation !== "object") return null;

  const quantity = Math.max(toInteger(variation.stock, 0), 0);
  // isEnable=0 significa "deshabilitada en el panel": no se ofrece.
  const isEnabled = toInteger(variation.isEnable, 1) !== 0;
  const isDefault = isDefaultVariant(variation);

  return {
    externalId: String(variation.idVariant ?? `variation-${index}`).trim(),
    sku: cleanText(variation.sku, 255),
    name: cleanText(variation.name, 120),
    attributes: attributesFromOptions(variation.options),
    // En MasterShop `price` es el precio de venta de la variacion.
    originalPrice: toNumberOrNull(variation.price),
    compareAtPrice: null,
    supplierPrice: toNumberOrNull(variation.price),
    weight: toNumberOrNull(variation.weight),
    weightUnit: cleanText(variation.weightUnit, 10),
    quantity,
    available: isEnabled && quantity > 0,
    isEnabled,
    isDefault,
    rawData: variation,
  };
};

// Variaciones vendibles de un producto (sin la "Default Variant").
const variationsFromProduct = (product) => {
  const raw = Array.isArray(product?.variation) ? product.variation : [];
  return raw
    .map(normalizeVariation)
    .filter((variation) => variation && !variation.isDefault);
};

// Precio representativo: `basePrice` del producto; si no viene, el menor
// precio de las variaciones (mismo criterio que Venndelo).
const representativePrice = (product, variations) => {
  const base = toNumberOrNull(product?.basePrice);
  if (base !== null) return base;
  const prices = variations
    .map((variation) => variation.originalPrice)
    .filter((price) => Number.isFinite(Number(price)) && Number(price) >= 0)
    .map(Number);
  return prices.length ? Math.min(...prices) : null;
};

const normalizeProduct = (product) => {
  const variations = variationsFromProduct(product);

  // Stock: el total que reporta el producto (verificado: es la suma de las
  // variaciones). Si no viene, se suman las variaciones.
  const reported = toInteger(product?.stockTotal, -1);
  const totalQuantity = Math.max(
    reported >= 0
      ? reported
      : variations.reduce((sum, variation) => sum + variation.quantity, 0),
    0,
  );

  return {
    externalId: String(product?.idProduct ?? "").trim(),
    name: cleanText(product?.name, 255) || "(sin nombre)",
    description: cleanText(product?.description),
    // MasterShop no documenta un tiempo de procesamiento por producto.
    processingTime: null,
    options: [],
    variations,
    assets: normalizeAsset(product?.urlImageProduct),
    originalPrice: representativePrice(product, variations),
    currency: normalizeCurrency(product?.baseCurrencyPrice),
    availability: totalQuantity > 0,
    totalQuantity,
    rawData: product || {},
  };
};

// Tallas publicables: solo las variaciones habilitadas que declaran `size`.
// Un producto solo-color no publica tallas (antes se publicaba la primera
// clave del objeto, que podia ser el color).
const productSizes = (variations) => sizesOf(variations);

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
  normalizeVariation,
  variationsFromProduct,
  representativePrice,
  normalizePage,
  normalizeAsset,
  normalizeCurrency,
  productSizes,
  buildProductSku: mastershopSku,
  buildProductSlug,
  slugify,
};
