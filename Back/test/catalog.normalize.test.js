// Pruebas de la normalizacion del catalogo de Venndelo (funciones puras).
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeProduct,
  normalizePage,
  normalizeVariation,
  normalizeAsset,
  representativePrice,
  productSizes,
  buildProductSku,
  buildProductSlug,
  attributesFromOptions,
} = require("../integrations/suppliers/venndelo/venndelo.normalize.js");

const RAW = {
  id: "1059085",
  name: "Mini parlante portátil",
  description: "Parlante con base antideslizante",
  processing_time: "1",
  options: [{ code: "size", label: "Talla" }],
  variations: [
    {
      id: "v-m",
      option: [{ code: "size", value: "M" }],
      quantity: 5,
      price: 28000,
      compare_at_price: 30000,
      supplier_price: 18000,
      sku: "SKU-M",
    },
    {
      id: "v-l",
      option: [{ code: "size", value: "L" }],
      quantity: 0,
      price: 30000,
      sku: "SKU-L",
    },
  ],
  assets: [
    {
      id: "786",
      type: "IMAGE",
      position: 2,
      url: "https://store-cdn.venndelo.com/shared/imagen-786.jpg",
      file_name: "dos.jpg",
      content_type: "image/jpeg",
      size: 57532,
    },
    {
      id: "785",
      type: "IMAGE",
      position: 1,
      url: "https://store-cdn.venndelo.com/shared/imagen-785.jpg",
      file_name: "uno.jpg",
      content_type: "image/jpeg",
      size: 1000,
    },
  ],
};

test("normaliza un producto completo", () => {
  const product = normalizeProduct(RAW);

  assert.equal(product.externalId, "1059085");
  assert.equal(product.name, "Mini parlante portátil");
  assert.equal(product.currency, "COP");
  assert.equal(product.variations.length, 2);
  assert.equal(product.assets.length, 2);
  assert.equal(product.totalQuantity, 5);
  assert.equal(product.availability, true);
  assert.equal(product.originalPrice, 28000, "usa el menor precio de variación");
});

test("ordena los assets por posición y marca la principal", () => {
  const product = normalizeProduct(RAW);

  assert.equal(product.assets[0].externalAssetId, "785");
  assert.equal(product.assets[0].isPrimary, true);
  assert.equal(product.assets[1].isPrimary, false);
  assert.equal(
    product.assets[0].url,
    "https://store-cdn.venndelo.com/shared/imagen-785.jpg",
    "la URL se conserva exactamente como la entrega el proveedor",
  );
});

test("una variación sin unidades no está disponible", () => {
  const variation = normalizeVariation(RAW.variations[1]);
  assert.equal(variation.quantity, 0);
  assert.equal(variation.available, false);
  assert.deepEqual(variation.attributes, { size: "L" });
});

test("una respuesta vacía no rompe la normalización", () => {
  const product = normalizeProduct({});
  assert.equal(product.externalId, "");
  assert.equal(product.name, "(sin nombre)");
  assert.deepEqual(product.variations, []);
  assert.deepEqual(product.assets, []);
  assert.equal(product.totalQuantity, 0);
  assert.equal(product.availability, false);
  assert.equal(product.originalPrice, null);
});

test("normaliza la paginación por cursor", () => {
  const page = normalizePage({
    curr_page_token: "a",
    next_page_token: "b",
    page_item_count: 2,
    items: [RAW],
  });

  assert.equal(page.items.length, 1);
  assert.equal(page.nextPageToken, "b");
  assert.equal(page.pageItemCount, 2);

  const empty = normalizePage({});
  assert.deepEqual(empty.items, []);
  assert.equal(empty.nextPageToken, "");
});

test("ignora assets sin url", () => {
  const asset = normalizeAsset({ id: "9", position: 3, url: "" }, 0);
  assert.equal(asset.url, "");
  const product = normalizeProduct({ assets: [{ id: "9" }] });
  assert.deepEqual(product.assets, []);
});

test("precio representativo y tallas", () => {
  const variations = [
    { attributes: { size: "S" }, originalPrice: 12000 },
    { attributes: { size: "M" }, originalPrice: 9000 },
    { attributes: { size: "M" }, originalPrice: 15000 },
  ];
  assert.equal(representativePrice(variations), 9000);
  assert.deepEqual(productSizes(variations), ["S", "M"]);
});

test("atributos desde las opciones", () => {
  assert.deepEqual(
    attributesFromOptions([
      { code: "size", value: "XL" },
      { code: "color", value: "negro" },
    ]),
    { size: "XL", color: "negro" },
  );
  assert.deepEqual(attributesFromOptions(null), {});
});

test("SKU y slug son estables y deterministas", () => {
  assert.equal(buildProductSku("1059085"), "VEN-1059085");
  const slug = buildProductSlug("Mini parlante portátil", "1059085");
  assert.equal(slug, "mini-parlante-portatil-1059085");
  assert.equal(slug, buildProductSlug("Mini parlante portátil", "1059085"));
});