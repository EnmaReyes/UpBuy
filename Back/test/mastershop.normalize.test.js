// Pruebas de la normalizacion del catalogo de MasterShop (funciones puras).
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeProduct,
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

test("tallas: MasterShop no documenta variaciones", () => {
  assert.deepEqual(productSizes([{ attributes: { size: "M" } }]), []);
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
