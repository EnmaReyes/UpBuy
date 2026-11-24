// Pruebas PURAS del mapeo de atributos y de la resolucion de variantes.
//
// No tocan red ni base de datos: son la base de la Fase 1 (decidir que
// id_variant le corresponde a un item) y del reporte de huecos de mapeo.
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeAttributeName,
  normalizeAttributeValue,
  attributesFromOptions,
  isDefaultVariant,
  unknownAttributeKeys,
  sizesOf,
  resolveVariation,
} = require("../integrations/suppliers/mastershop/mastershop.attributes.js");

test("el nombre del atributo se lleva a una clave canonica", () => {
  for (const raw of ["TALLA", "Tallas", "talla", "Size", "Tamaño"]) {
    assert.equal(normalizeAttributeName(raw), "size", raw);
  }
  for (const raw of ["COLOR", "Color", "colores", "Colour"]) {
    assert.equal(normalizeAttributeName(raw), "color", raw);
  }
  // Desconocido: clave estable, nunca se descarta en silencio.
  assert.equal(normalizeAttributeName("Material"), "material");
  assert.equal(normalizeAttributeName("  "), null);
});

test("el valor se compara sin tildes ni mayusculas", () => {
  assert.equal(normalizeAttributeValue(" azul  marino "), "AZUL MARINO");
  assert.equal(normalizeAttributeValue("Azul"), normalizeAttributeValue("AZUL"));
  assert.equal(normalizeAttributeValue(""), null);
  assert.equal(normalizeAttributeValue(null), null);
});

test("las opciones reales se convierten en atributos canonicos", () => {
  const attributes = attributesFromOptions([
    { propertyName: "COLOR", nameValue: "BRONCE" },
    { propertyName: "TALLAS", nameValue: "37" },
    { propertyName: "", nameValue: "sin nombre" },
  ]);

  assert.deepEqual(attributes, { color: "BRONCE", size: "37" });
  assert.deepEqual(attributesFromOptions(null), {});
});

test("la Default Variant se detecta y no cuenta como atributo", () => {
  assert.equal(isDefaultVariant({ options: null }), true);
  assert.equal(isDefaultVariant({ options: [] }), true);
  assert.equal(
    isDefaultVariant({ options: [{ propertyName: "TALLAS", nameValue: "37" }] }),
    false,
  );
});

test("se reportan las claves de atributo desconocidas", () => {
  assert.deepEqual(
    unknownAttributeKeys({ size: "37", color: "AZUL", material: "oro" }),
    ["material"],
  );
});

test("sizesOf ignora variantes deshabilitadas y sin talla", () => {
  const sizes = sizesOf([
    { attributes: { size: "37", color: "ORO" }, isEnabled: true },
    { attributes: { size: "38" }, isEnabled: false },
    { attributes: { color: "ORO" }, isEnabled: true },
    { attributes: { size: "37" }, isDefault: true },
  ]);

  assert.deepEqual(sizes, ["37"]);
});

const variation = (idVariant, attributes, extra = {}) => ({
  externalId: String(idVariant),
  sku: `SKU-${idVariant}`,
  attributes,
  isDefault: false,
  isEnabled: true,
  available: true,
  ...extra,
});

test("una sola coincidencia resuelve la variante", () => {
  const result = resolveVariation(
    [
      variation(1, { size: "37", color: "BRONCE" }),
      variation(2, { size: "38", color: "BRONCE" }),
    ],
    { size: "38" },
  );

  assert.equal(result.ok, true);
  assert.equal(result.variation.externalId, "2");
});

test("un producto multicolor es ambiguo si el pedido no trae color", () => {
  const result = resolveVariation(
    [
      variation(1, { size: "37", color: "BRONCE" }),
      variation(2, { size: "37", color: "ORO" }),
    ],
    { size: "37" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "ambiguo");
  assert.equal(result.candidates.length, 2);
});

test("con color en el pedido la variante multicolor se resuelve", () => {
  const result = resolveVariation(
    [
      variation(1, { size: "37", color: "BRONCE" }),
      variation(2, { size: "37", color: "ORO" }),
    ],
    { size: "37", color: "oro" },
  );

  assert.equal(result.ok, true);
  assert.equal(result.variation.externalId, "2");
});

test("entre varias coincidencias, una sola con stock desempata", () => {
  const result = resolveVariation(
    [
      variation(1, { size: "37", color: "BRONCE" }, { available: false }),
      variation(2, { size: "37", color: "ORO" }, { available: true }),
    ],
    { size: "37" },
  );

  assert.equal(result.ok, true);
  assert.equal(result.variation.externalId, "2");
});

test("una talla inexistente no resuelve", () => {
  const result = resolveVariation([variation(1, { size: "37" })], { size: "44" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "no_encontrado");
});

test("un producto sin variaciones vendibles no resuelve", () => {
  const result = resolveVariation([], { size: "37" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "sin_variaciones");
});

test("una variante agotada no resuelve cuando se exige stock", () => {
  const result = resolveVariation(
    [variation(1, { size: "37" }, { available: false })],
    { size: "37" },
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "sin_stock");
});
