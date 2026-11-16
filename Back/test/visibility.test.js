// Pruebas puras de visibilidad y acciones en lote del catalogo.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

process.chdir(path.join(__dirname, ".."));

const {
  isVisible,
  resolvePublishPolicy,
  resolvePublishVisibility,
  buildBulkPlan,
} = require("../Services/catalog/visibility.service.js");
const {
  PRODUCT_STATUS,
  PRODUCT_BULK_ACTION,
} = require("../DataBase/models/enums.js");

test("isVisible exige status active y active true", () => {
  assert.equal(
    isVisible({ status: PRODUCT_STATUS.ACTIVE, active: true }),
    true,
  );
  assert.equal(
    isVisible({ status: PRODUCT_STATUS.ACTIVE, active: false }),
    false,
  );
  assert.equal(
    isVisible({ status: PRODUCT_STATUS.DRAFT, active: true }),
    false,
  );
  assert.equal(
    isVisible({ status: PRODUCT_STATUS.ARCHIVED, active: true }),
    false,
  );
});

test("resolvePublishPolicy cae a manual si falta o es invalida", () => {
  assert.equal(resolvePublishPolicy({}), "manual");
  assert.equal(resolvePublishPolicy({ publishPolicy: "otra" }), "manual");
  assert.equal(
    resolvePublishPolicy({ publishPolicy: "auto_visible" }),
    "auto_visible",
  );
});

test("resolvePublishVisibility: auto_visible es el unico que publica visible", () => {
  assert.equal(resolvePublishVisibility({ policy: "manual" }), "draft");
  assert.equal(resolvePublishVisibility({ policy: "auto_draft" }), "draft");
  assert.equal(resolvePublishVisibility({ policy: "auto_visible" }), "visible");
  assert.equal(
    resolvePublishVisibility({ policy: "manual", visibility: "visible" }),
    "visible",
  );
});

test("make_visible activa el producto y marca el override de visibilidad", () => {
  const plan = buildBulkPlan({
    products: [{ id: "p1", status: PRODUCT_STATUS.DRAFT, active: false }],
    action: PRODUCT_BULK_ACTION.MAKE_VISIBLE,
  });

  assert.equal(plan.skipped.length, 0);
  assert.deepEqual(plan.updates[0].values.status, PRODUCT_STATUS.ACTIVE);
  assert.equal(plan.updates[0].values.active, true);
  assert.equal(plan.updates[0].values.manualOverrides.active, true);
});

test("make_visible omite los archivados con un motivo", () => {
  const plan = buildBulkPlan({
    products: [{ id: "p1", status: PRODUCT_STATUS.ARCHIVED, active: false }],
    action: PRODUCT_BULK_ACTION.MAKE_VISIBLE,
  });

  assert.equal(plan.updates.length, 0);
  assert.equal(plan.skipped[0].id, "p1");
  assert.match(plan.skipped[0].motivo, /Archivado/);
});

test("hide oculta sin borrar ni cambiar el estado editorial", () => {
  const plan = buildBulkPlan({
    products: [{ id: "p1", status: PRODUCT_STATUS.ACTIVE, active: true }],
    action: PRODUCT_BULK_ACTION.HIDE,
  });

  assert.equal(plan.updates[0].values.active, false);
  assert.equal(plan.updates[0].values.status, undefined);
  assert.equal(plan.updates[0].values.manualOverrides.active, true);
});

test("apply_markup calcula el precio y lo marca como decision del admin", () => {
  const plan = buildBulkPlan({
    products: [
      { id: "p1", cost: 20000, price: 10000, manualOverrides: {} },
      { id: "p2", cost: 0 },
    ],
    action: PRODUCT_BULK_ACTION.APPLY_MARKUP,
    payload: { percent: 50 },
  });

  assert.deepEqual(plan.updates[0].values, {
    price: 30000,
    markup: 50,
    manualOverrides: { price: true },
  });
  assert.equal(plan.skipped[0].id, "p2");
});

test("set_categories valida el arreglo y conserva el modo", () => {
  const plan = buildBulkPlan({
    products: [{ id: "p1", manualOverrides: { category: false } }],
    action: PRODUCT_BULK_ACTION.SET_CATEGORIES,
    payload: { categoryIds: ["c1"], mode: "add" },
  });

  assert.deepEqual(plan.updates[0].categoryIds, ["c1"]);
  assert.equal(plan.updates[0].categoryMode, "add");
  assert.equal(plan.updates[0].values.manualOverrides.category, true);
});

test("una accion de lote desconocida falla con 400", () => {
  assert.throws(
    () => buildBulkPlan({ products: [], action: "borrar_todo" }),
    (error) => error.status === 400,
  );
});

test("un porcentaje de markup invalido falla con 400", () => {
  assert.throws(
    () =>
      buildBulkPlan({
        products: [{ id: "p1", cost: 1000 }],
        action: PRODUCT_BULK_ACTION.APPLY_MARKUP,
        payload: { percent: -1 },
      }),
    (error) => error.status === 400,
  );
});
