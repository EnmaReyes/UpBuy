/**
 * Pruebas puntuales del sistema de descuentos individuales por articulo.
 *
 * No toca la base de datos: solo ejerce las funciones puras de calculo
 * (`aplicarDescuento` / `normalizarDescuentoPorcentaje` en
 * `Services/prices.js`) y el helper de lectura del frontend
 * (`getItemDiscount` en `Cliente/src/Componentes/orderUtils.js`).
 *
 * Uso (desde Api/):  node scripts/testDescuentos.js
 * Sale con codigo 1 si alguna asercion falla.
 */

const assert = require("assert");
const path = require("path");

const {
  aplicarDescuento,
  normalizarDescuentoPorcentaje,
} = require("../Services/prices.js");

let passed = 0;
const ok = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

const finalDe = (base, pct) => aplicarDescuento(base, pct).precioFinal;

console.log("normalizarDescuentoPorcentaje");
ok("null/undefined/vacio -> 0", () => {
  assert.strictEqual(normalizarDescuentoPorcentaje(null), 0);
  assert.strictEqual(normalizarDescuentoPorcentaje(undefined), 0);
  assert.strictEqual(normalizarDescuentoPorcentaje(""), 0);
});
ok("0 -> 0 (sin descuento)", () => {
  assert.strictEqual(normalizarDescuentoPorcentaje(0), 0);
  assert.strictEqual(normalizarDescuentoPorcentaje("0"), 0);
});
ok("1 y 100 validos", () => {
  assert.strictEqual(normalizarDescuentoPorcentaje(1), 1);
  assert.strictEqual(normalizarDescuentoPorcentaje(100), 100);
  assert.strictEqual(normalizarDescuentoPorcentaje("50"), 50);
});
ok("invalidos -> 0", () => {
  assert.strictEqual(normalizarDescuentoPorcentaje(-1), 0);
  assert.strictEqual(normalizarDescuentoPorcentaje(101), 0);
  assert.strictEqual(normalizarDescuentoPorcentaje(10.5), 0);
  assert.strictEqual(normalizarDescuentoPorcentaje("abc"), 0);
  assert.strictEqual(normalizarDescuentoPorcentaje(NaN), 0);
});

console.log("\naplicarDescuento");
ok("sin descuento devuelve el precio intacto", () => {
  assert.deepStrictEqual(aplicarDescuento(35000, 0), {
    precioOriginal: 35000,
    precioFinal: 35000,
    descuentoPorcentaje: 0,
    descuentoUnitario: 0,
  });
});
ok("10% de 35000 -> 31500", () => {
  assert.strictEqual(finalDe(35000, 10), 31500);
});
ok("20% de 35000 -> 28000", () => {
  assert.strictEqual(finalDe(35000, 20), 28000);
});
ok("50% de 35000 -> 17500", () => {
  assert.strictEqual(finalDe(35000, 50), 17500);
});
ok("100% de 35000 -> 0 (gratuito)", () => {
  const r = aplicarDescuento(35000, 100);
  assert.strictEqual(r.precioFinal, 0);
  assert.strictEqual(r.descuentoUnitario, 35000);
});
ok("oversize 60000 con 33% -> 40200", () => {
  assert.strictEqual(finalDe(60000, 33), 40200);
});
ok("desglose coherente: original - final = unitario", () => {
  const r = aplicarDescuento(19999, 33);
  assert.strictEqual(r.precioOriginal - r.precioFinal, r.descuentoUnitario);
});
ok("base invalida no rompe (Devuelve 0 sin descuento util)", () => {
  assert.strictEqual(aplicarDescuento(0, 10).precioFinal, 0);
  assert.strictEqual(aplicarDescuento(-100, 10).precioFinal, 0);
});
ok("porcentaje invalido no descuenta", () => {
  assert.strictEqual(finalDe(35000, 150), 35000);
  assert.strictEqual(finalDe(35000, -5), 35000);
  assert.strictEqual(finalDe(35000, "abc"), 35000);
});

console.log("\ngetItemDiscount (snapshot historico)");
(async () => {
  const frontend = path.resolve(
    __dirname,
    "../../Cliente/src/Componentes/orderUtils.js",
  );
  const { getItemDiscount } = await import(`file:///${frontend.replace(/\\/g, "/")}`);

  ok("lee el descuento del snapshot", () => {
    const dto = getItemDiscount({
      unitPrice: 28000,
      priceSnapshot: {
        descuentoPorcentaje: 20,
        precioOriginal: 35000,
        precioFinal: 28000,
      },
    });
    assert.deepStrictEqual(dto, { pct: 20, original: 35000, final: 28000 });
  });
  ok("snapshot sin descuento -> null", () => {
    assert.strictEqual(
      getItemDiscount({
        unitPrice: 35000,
        priceSnapshot: { descuentoPorcentaje: 0 },
      }),
      null,
    );
  });
  ok("pedido viejo (snapshot legado) -> null", () => {
    assert.strictEqual(
      getItemDiscount({
        unitPrice: 35000,
        priceSnapshot: { source: "legacy", precio: 35000 },
      }),
      null,
    );
    assert.strictEqual(getItemDiscount({ unitPrice: 35000 }), null);
    assert.strictEqual(getItemDiscount({ unitPrice: 35000, priceSnapshot: {} }), null);
  });
  ok("descuento 100% queda registrado en el snapshot", () => {
    const dto = getItemDiscount({
      unitPrice: 0,
      priceSnapshot: {
        descuentoPorcentaje: 100,
        precioOriginal: 35000,
        precioFinal: 0,
      },
    });
    assert.deepStrictEqual(dto, { pct: 100, original: 35000, final: 0 });
  });

  console.log(`\nAPI OK — ${passed} aserciones pasaron`);
})().catch((error) => {
  console.error(`\nFALLO: ${error.message}`);
  process.exit(1);
});
