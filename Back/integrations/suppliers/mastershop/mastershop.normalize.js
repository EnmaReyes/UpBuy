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
const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

const cleanText = (value, max) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return max ? text.slice(0, max) : text;
};

// Moneda: `baseCurrencyPrice` es la unica fuente documentada. Si no es un
// codigo ISO de 3 letras se usa COP (moneda de la tienda).
const normalizeCurrency = (value) => {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(text) ? text : "COP";
};

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

// SKU canonico del producto publicado. MasterShop usa ids numericos, asi que
// el resultado cabe de sobra en VARCHAR(100).
const buildProductSku = (externalId, prefix = "MS") => {
  const clean = String(externalId || "").replace(/\s+/g, "").slice(0, 80);
  return `${prefix}-${clean}`;
};

const slugify = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

// Slug estable y unico: nombre + fragmento del id externo.
const buildProductSlug = (name, externalId) => {
  const base = slugify(name) || "producto";
  const short = String(externalId || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  return short ? `${base}-${short}` : base;
};

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
  buildProductSku,
  buildProductSlug,
  slugify,
};
