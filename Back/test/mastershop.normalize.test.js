// Pruebas de la normalizacion del catalogo de MasterShop (funciones puras).
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeProduct,
  normalizeVariation,
  normalizePage,
  normalizeAsset,
  normalizeCurrency,
  productSizes,
  buildProductSku,
  buildProductSlug,
} = require("../integrations/suppliers/mastershop/mastershop.normalize.js");

// Forma documentada de un producto de MasterShop.
const RAW = {
  idProduct: 987654,
  name: "  Audifonos inalambricos  ",
  description: "Bluetooth 5.3 con estuche",
  basePrice: 45000.4,
  baseCurrencyPrice: "COP",
  suggestedPrice: 89000,
  stockTotal: 7,
  nameState: "ACTIVO",
  nameType: "PRODUCTO",
  prodFormatName: "UNITARIO",
  urlImageProduct: "https://cdn.mastershop.test/audifonos.jpg",
  productProperties: [],
  tags: ["audio"],
  variation: [],
};

test("normaliza un producto completo a nivel de producto", () => {
  const product = normalizeProduct(RAW);

  assert.equal(product.externalId, "987654");
  assert.equal(product.name, "Audifonos inalambricos");
  assert.equal(product.description, "Bluetooth 5.3 con estuche");
  assert.equal(product.currency, "COP");
  assert.equal(product.originalPrice, 45000.4);
  assert.equal(product.totalQuantity, 7);
  assert.equal(product.availability, true);
  assert.deepEqual(product.variations, []);
  assert.deepEqual(product.options, []);
  assert.equal(product.processingTime, null);
});

test("guarda el payload original tal cual en rawData", () => {
  const product = normalizeProduct(RAW);
  assert.deepEqual(product.rawData, RAW);
});

test("sin stock el producto no esta disponible", () => {
  const product = normalizeProduct({ ...RAW, stockTotal: 0 });
  assert.equal(product.totalQuantity, 0);
  assert.equal(product.availability, false);
});

test("un stock negativo se recorta a cero", () => {
  const product = normalizeProduct({ ...RAW, stockTotal: -3 });
  assert.equal(product.totalQuantity, 0);
  assert.equal(product.availability, false);
});

test("una respuesta vacia no rompe la normalizacion", () => {
  const product = normalizeProduct({});
  assert.equal(product.externalId, "");
  assert.equal(product.name, "(sin nombre)");
  assert.equal(product.description, null);
  assert.equal(product.originalPrice, null);
  assert.equal(product.currency, "COP");
  assert.equal(product.totalQuantity, 0);
  assert.equal(product.availability, false);
  assert.deepEqual(product.assets, []);
  assert.deepEqual(product.variations, []);
});

test("la imagen del producto se representa como un asset principal", () => {
  const assets = normalizeAsset(RAW.urlImageProduct);
  assert.equal(assets.length, 1);
  assert.equal(assets[0].externalAssetId, "img-1");
  assert.equal(assets[0].url, RAW.urlImageProduct);
  assert.equal(assets[0].position, 1);
  assert.equal(assets[0].isPrimary, true);

  assert.deepEqual(normalizeAsset(""), []);
  assert.deepEqual(normalizeAsset(null), []);
});

test("sin imagen no se inventan assets", () => {
  const product = normalizeProduct({ ...RAW, urlImageProduct: null });
  assert.deepEqual(product.assets, []);
});

test("la moneda solo acepta codigos ISO de 3 letras", () => {
  assert.equal(normalizeCurrency("usd"), "USD");
  assert.equal(normalizeCurrency("COP"), "COP");
  assert.equal(normalizeCurrency("pesos"), "COP");
  assert.equal(normalizeCurrency(""), "COP");
  assert.equal(normalizeCurrency(null), "COP");
});

test("normaliza la paginacion por indice de pagina", () => {
  const page = normalizePage({
    results: [RAW, { ...RAW, idProduct: 2 }],
    resultsCount: { totalProducts: 120 },
  });
  assert.equal(page.items.length, 2);
  assert.equal(page.total, 120);

  const empty = normalizePage({});
  assert.deepEqual(empty.items, []);
  assert.equal(empty.total, null);

  const negative = normalizePage({ results: [], resultsCount: { totalProducts: -1 } });
  assert.equal(negative.total, 0);
});

// Variacion real de la API (verificada el 2026-11-24, producto 269130).
const RAW_VARIATION = {
  sku: "M101",
  name: "BRONCE/37",
  price: 65000,
  stock: 20,
  weight: 0.5,
  options: [
    { nameValue: "BRONCE", propertyName: "COLOR" },
    { nameValue: "37", propertyName: "TALLAS" },
  ],
  package: { width: null, height: null, length: null, weight: 0.5 },
  isEnable: 1,
  idProduct: 269130,
  idVariant: 753806,
  weightUnit: "kg",
};

// La "Default Variant" que MasterShop agrega siempre: no es vendible.
const RAW_DEFAULT_VARIATION = {
  sku: null,
  name: "Default Variant",
  price: 65000,
  stock: 0,
  weight: 0,
  options: null,
  package: { width: null, height: null, length: null, weight: 0 },
  isEnable: 1,
  idProduct: 269130,
  idVariant: 753796,
  weightUnit: "kg",
};

test("normaliza las variaciones reales y descarta la Default Variant", () => {
  const product = normalizeProduct({
    ...RAW,
    variation: [RAW_DEFAULT_VARIATION, RAW_VARIATION],
  });

  assert.equal(product.variations.length, 1);
  const [variation] = product.variations;
  assert.equal(variation.externalId, "753806");
  assert.equal(variation.sku, "M101");
  assert.deepEqual(variation.attributes, { color: "BRONCE", size: "37" });
  assert.equal(variation.originalPrice, 65000);
  assert.equal(variation.supplierPrice, 65000);
  assert.equal(variation.quantity, 20);
  assert.equal(variation.available, true);
  assert.equal(variation.isDefault, false);
  assert.deepEqual(variation.rawData, RAW_VARIATION);
});

test("una variacion deshabilitada (isEnable 0) no queda disponible", () => {
  const variation = normalizeVariation({
    ...RAW_VARIATION,
    isEnable: 0,
  });

  assert.equal(variation.available, false);
  assert.equal(variation.isEnabled, false);
  assert.equal(variation.quantity, 20);
});

test("sin stock la variacion no queda disponible", () => {
  const variation = normalizeVariation({ ...RAW_VARIATION, stock: 0 });
  assert.equal(variation.quantity, 0);
  assert.equal(variation.available, false);
});

test("un producto que solo trae la Default Variant queda sin variaciones", () => {
  const product = normalizeProduct({ ...RAW, variation: [RAW_DEFAULT_VARIATION] });
  assert.deepEqual(product.variations, []);
});

test("un sku nulo no impide normalizar la variante", () => {
  const variation = normalizeVariation({ ...RAW_VARIATION, sku: null });
  assert.equal(variation.sku, null);
  assert.equal(variation.externalId, "753806");
});

test("el stock del producto cae a la suma de variaciones si no viene stockTotal", () => {
  const product = normalizeProduct({
    ...RAW,
    stockTotal: undefined,
    variation: [RAW_VARIATION, { ...RAW_VARIATION, idVariant: 2, stock: 5 }],
  });
  assert.equal(product.totalQuantity, 25);
});

test("tallas: solo las variaciones habilitadas con atributo size", () => {
  const variations = [
    normalizeVariation({ ...RAW_VARIATION, idVariant: 1 }),
    normalizeVariation({
      ...RAW_VARIATION,
      idVariant: 2,
      options: [{ nameValue: "38", propertyName: "TALLA" }],
    }),
    normalizeVariation({
      ...RAW_VARIATION,
      idVariant: 3,
      isEnable: 0,
      options: [{ nameValue: "39", propertyName: "Tallas" }],
    }),
    // Solo color: no aporta talla (antes se publicaba "AZUL" como talla).
    normalizeVariation({
      ...RAW_VARIATION,
      idVariant: 4,
      options: [{ nameValue: "AZUL", propertyName: "Color" }],
    }),
  ];

  assert.deepEqual(productSizes(variations), ["37", "38"]);
  assert.deepEqual(productSizes(), []);
});

test("SKU y slug son estables y deterministas", () => {
  assert.equal(buildProductSku("987654"), "MS-987654");
  assert.equal(buildProductSku(" 987 654 "), "MS-987654");
  assert.equal(buildProductSlug("Audifonos inalambricos", "987654"), "audifonos-inalambricos-987654");
  assert.equal(
    buildProductSlug("Audifonos inalambricos", "987654"),
    buildProductSlug("Audifonos inalambricos", "987654"),
  );
  // Sin id externo el slug sigue siendo util.
  assert.equal(buildProductSlug("Producto", ""), "producto");
});
