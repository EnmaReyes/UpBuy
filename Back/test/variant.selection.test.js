// Resolucion de la variante exacta (color + talla) de un producto publicado.
//
// Funciones puras de `Services/catalog/variant.service.js`: no tocan la base de
// datos, solo comparan las variaciones ya normalizadas.
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  canonicalAttributes,
  findExactVariation,
  colorsFromVariations,
  sizesFromVariations,
  publicVariants,
} = require("../Services/catalog/variant.service.js");

const variation = (id, attributes, { quantity = 5, available = true, sku = null } = {}) => ({
  id,
  attributes,
  quantity,
  available,
  sku,
});

test("canonicalAttributes lleva TALLA/COLOR a size/color", () => {
  assert.deepEqual(
    canonicalAttributes({ TALLA: "M", Color: "Negro" }),
    { size: "M", color: "Negro" },
  );
});

test("findExactVariation resuelve la combinacion color + talla", () => {
  const variations = [
    variation("v1", { size: "M", color: "NEGRO" }),
    variation("v2", { size: "M", color: "AZUL" }),
  ];
  const result = findExactVariation(variations, { size: "M", color: "negro" });
  assert.equal(result.status, "ok");
  assert.equal(result.variation.id, "v1");
});

test("sin color, una talla con varios colores es ambigua", () => {
  const variations = [
    variation("v1", { size: "M", color: "NEGRO" }),
    variation("v2", { size: "M", color: "AZUL" }),
  ];
  assert.equal(findExactVariation(variations, { size: "M" }).status, "ambiguo");
});

test("un color inexistente no resuelve", () => {
  const variations = [variation("v1", { size: "M", color: "NEGRO" })];
  assert.equal(
    findExactVariation(variations, { size: "M", color: "ROJO" }).status,
    "no_encontrado",
  );
});

test("un producto solo-color resuelve por color", () => {
  const variations = [
    variation("v1", { color: "ROJO" }),
    variation("v2", { color: "VERDE" }),
  ];
  const result = findExactVariation(variations, { color: "verde" });
  assert.equal(result.status, "ok");
  assert.equal(result.variation.id, "v2");
});

test("colorsFromVariations y sizesFromVariations no repiten valores", () => {
  const variations = [
    variation("v1", { size: "M", color: "Azul" }),
    variation("v2", { size: "M", color: "AZUL" }),
    variation("v3", { size: "L", color: "Azul" }),
  ];
  assert.deepEqual(colorsFromVariations(variations), ["Azul"]);
  assert.deepEqual(sizesFromVariations(variations), ["M", "L"]);
});

test("publicVariants calcula stock y disponibilidad reales", () => {
  const [published] = publicVariants([
    variation("v1", { size: "M", color: "NEGRO" }, { quantity: 0, available: true }),
  ]);
  assert.equal(published.stock, 0);
  assert.equal(published.available, false);
});
