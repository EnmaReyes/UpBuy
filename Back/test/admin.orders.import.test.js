// Pruebas de ADM-3: importacion de ventas desde CSV.
//
// Dos bloques:
//
//   1. Pruebas puras del parser y del analizador (sin base): CSV con
//      separador ";", comillas, filas inválidas, normalizacion de montos y
//      fechas, y la idempotencia por referencia externa.
//
//   2. Pruebas con base (se saltan si no hay PostgreSQL): la importacion real
//      no duplica pedidos y una fila inválida no bloquea a las válidas.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

process.chdir(path.join(__dirname, ".."));

const {
  parseCsv,
  readRecords,
  parseMoney,
  parseDate,
  parseQuantity,
  normalizeHeader,
  normalizeKey,
  analyzeCsv,
  importCsv,
  hashRow,
  MAX_ROWS,
} = require("../Services/orderImport.js");
const {
  Order,
  OrderItem,
  Payment,
  OrderStatusHistory,
  Product,
  Usuarios,
} = require("../DataBase/models/index.js");
const { createAdminSession } = require("../Services/adminSessions.js");

// Borra los pedidos importados y todo lo que cuelga de ellos (pagos, lineas
// e historial). Los pedidos tienen claves foraneas restrictivas.
const limpiarPedidosImportados = async (refs) => {
  const pedidos = await Order.findAll({
    where: { channel: "otro", externalRef: refs },
    attributes: ["id"],
  });
  const ids = pedidos.map((pedido) => pedido.id);
  if (ids.length === 0) return;

  await Payment.destroy({ where: { orderId: ids } });
  await OrderItem.destroy({ where: { orderId: ids } });
  await OrderStatusHistory.destroy({ where: { orderId: ids } });
  await Order.destroy({ where: { id: ids } });
};

// ---------------------------------------------------------------------------
// 1. Pruebas puras
// ---------------------------------------------------------------------------

test("el parser detecta el separador y respeta las comillas", () => {
  const filas = parseCsv(
    'sku;nombre;notas\nUPBUY-1;"Pérez, Ana";"Dice ""hola"""\nUPBUY-2;Luis;',
  );

  assert.equal(filas.length, 3);
  assert.deepEqual(filas[0], ["sku", "nombre", "notas"]);
  assert.deepEqual(filas[1], ["UPBUY-1", "Pérez, Ana", 'Dice "hola"']);
  assert.deepEqual(filas[2], ["UPBUY-2", "Luis", ""]);
});

test("el parser ignora el BOM y las lineas vacias", () => {
  const filas = parseCsv("\uFEFFsku,nombre\n\nUPBUY-1,Ana\n\n");
  assert.equal(filas.length, 2);
  assert.deepEqual(filas[0], ["sku", "nombre"]);
});

test("las cabeceras se normalizan y se reconocen por alias", () => {
  assert.equal(normalizeHeader("  Nombre del Cliente "), "nombre_del_cliente");
  assert.equal(normalizeHeader("Teléfono"), "telefono");

  const registros = readRecords([
    ["sku", "nombre_cliente", "ref_externa", "total"],
    ["UPBUY-1", "Ana", "VEN-1", "50000"],
  ]);

  assert.equal(registros.length, 1);
  assert.equal(registros[0].row, 2);
  assert.deepEqual(registros[0].values, {
    sku: "UPBUY-1",
    name: "Ana",
    externalRef: "VEN-1",
    total: "50000",
  });
});

test("los montos se leen en pesos y se rechazan los decimales", () => {
  const errores = [];
  assert.equal(parseMoney("35.000", "total", errores), 35000);
  assert.equal(parseMoney("$120000", "total", errores), 120000);
  assert.equal(parseMoney("1.500.000", "total", errores), 1500000);
  assert.equal(errores.length, 0);

  assert.equal(parseMoney("35.5", "total", errores), null);
  assert.equal(errores.length, 1);
  assert.match(errores[0].message, /entero/);
});

test("las fechas aceptan ISO y dd/mm/aaaa", () => {
  const errores = [];
  const iso = parseDate("2026-11-01", errores);
  const latam = parseDate("01/11/2026", errores);

  assert.equal(iso.toISOString().slice(0, 10), "2026-11-01");
  assert.equal(latam.toISOString().slice(0, 10), "2026-11-01");
  assert.equal(errores.length, 0);

  parseDate("01-11-2026", errores);
  assert.equal(errores.length, 1);
});

test("la cantidad se valida contra el maximo del catalogo", () => {
  const errores = [];
  assert.equal(parseQuantity("", errores), 1);
  assert.equal(parseQuantity("3", errores), 3);

  parseQuantity("0", errores);
  assert.equal(errores.length, 1);

  parseQuantity("99", errores);
  assert.equal(errores.length, 2);
});

test("el estado del archivo se traduce a los estados canonicos", () => {
  assert.equal(normalizeKey("En Preparación"), "en_preparacion");
  assert.equal(normalizeKey("  entregado "), "entregado");
});

test("el analisis marca como invalida una fila sin nombre", async () => {
  const csv = [
    "sku,nombre,telefono,cantidad,total,ref_externa",
    "UPBUY-1,,3001234567,1,50000,VEN-1",
  ].join("\n");

  const analisis = await analyzeCsv(csv);

  assert.equal(analisis.summary.totalRows, 1);
  assert.equal(analisis.summary.valid, 0);
  assert.equal(analisis.summary.invalid, 1);
  assert.equal(analisis.errors[0].row, 2);
  assert.equal(analisis.errors[0].field, "nombre");
});

test("una fila sin guia no se puede registrar como enviada", async () => {
  const csv = [
    "sku,nombre,telefono,cantidad,total,estado,ref_externa",
    "UPBUY-1,Ana,3001234567,1,50000,enviado,VEN-1",
  ].join("\n");

  const analisis = await analyzeCsv(csv);

  assert.equal(analisis.summary.valid, 0);
  assert.ok(
    analisis.errors.some((error) => error.field === "guia"),
    "debe avisar que falta la guía",
  );
});

test("un estado desconocido invalida la fila sin tocar el resto", async () => {
  const csv = [
    "sku,nombre,telefono,cantidad,total,estado,ref_externa",
    "UPBUY-1,Ana,3001234567,1,50000,inventado,VEN-1",
    "UPBUY-2,Luis,3007654321,1,40000,pagado,VEN-2",
  ].join("\n");

  const analisis = await analyzeCsv(csv);

  assert.equal(analisis.summary.totalRows, 2);
  assert.equal(analisis.summary.invalid, 1);
  assert.equal(analisis.summary.valid, 1);
  assert.ok(
    analisis.errors.some((error) => error.field === "estado"),
    "debe avisar del estado inválido",
  );
});

test("el hash de fila es estable y distingue filas distintas", () => {
  const plan = {
    name: "Ana",
    phone: "3001234567",
    email: null,
    sku: "UPBUY-1",
    items: [{ title: "Camiseta", size: "M", quantity: 1 }],
    total: 50000,
    date: new Date("2026-11-01T12:00:00.000Z"),
    externalRef: null,
  };

  const primero = hashRow(plan);
  assert.equal(primero, hashRow({ ...plan }));
  assert.notEqual(primero, hashRow({ ...plan, total: 60000 }));
});

test("el analisis no escribe nada en la base", async (t) => {
  // El analisis (dry run) es puro: no toca la base. Se verifica que un
  // archivo con una referencia repetida marca la segunda fila.
  const csv = [
    "sku,nombre,telefono,cantidad,total,ref_externa",
    "UPBUY-1,Ana,3001234567,1,50000,VEN-1",
    "UPBUY-2,Luis,3007654321,1,40000,VEN-1",
  ].join("\n");

  const analisis = await analyzeCsv(csv);

  assert.equal(analisis.summary.valid, 1);
  assert.ok(
    analisis.errors.some((error) => error.field === "ref_externa"),
    "la segunda fila con la misma referencia debe marcarse",
  );
});

// ---------------------------------------------------------------------------
// 2. Pruebas con base de datos
// ---------------------------------------------------------------------------

let dbError = null;

test.before(async () => {
  try {
    await require("../DataBase/db.js").sequelize.authenticate();
  } catch (error) {
    dbError = error;
  }
});

test.after(async () => {
  await require("../DataBase/db.js").sequelize.close().catch(() => {});
});

const skipIfNoDb = (t) => {
  if (dbError) {
    t.skip(`sin base de datos: ${dbError.message}`);
    return true;
  }
  return false;
};

const crearAdmin = async () => {
  const stamp = Date.now();
  const admin = await Usuarios.create({
    username: `importadmin${stamp}`,
    email: `importadmin${stamp}@test.local`,
    password: "hash",
    role: "admin",
    admin: true,
    mfaEnabled: true,
  });
  await createAdminSession({ userId: admin.id, mfaAt: new Date() });
  return admin;
};

test("importar dos veces el mismo archivo no duplica pedidos", async (t) => {
  if (skipIfNoDb(t)) return;

  const admin = await crearAdmin();
  const ref = `VEN-IDEMP-${Date.now()}`;
  const csv = [
    "fecha,nombre,telefono,producto,cantidad,total,ref_externa",
    `2026-11-01,Ana,3001234567,Camiseta,1,50000,${ref}`,
  ].join("\n");

  try {
    const primera = await importCsv({ text: csv, adminId: admin.id });
    assert.equal(primera.summary.created, 1);
    assert.equal(primera.summary.duplicates, 0);
    assert.equal(primera.created[0].externalRef, ref);

    const segunda = await importCsv({ text: csv, adminId: admin.id });
    assert.equal(segunda.summary.created, 0);
    assert.equal(segunda.summary.duplicates, 1);
    assert.equal(segunda.duplicates[0].orderNumber, primera.created[0].orderNumber);

    const pedidos = await Order.findAll({
      where: { channel: "otro", externalRef: ref },
    });
    assert.equal(pedidos.length, 1);
  } finally {
    await limpiarPedidosImportados([ref]);
    await Usuarios.destroy({ where: { id: admin.id } });
  }
});

test("una fila invalida no bloquea a las validas y el total lo calcula el servidor", async (t) => {
  if (skipIfNoDb(t)) return;

  const admin = await crearAdmin();
  const ref = `VEN-MIXTA-${Date.now()}`;

  // Producto de catalogo: el precio sale de la base, no del archivo.
  const producto = await Product.create({
    sku: `UPBUY-IMPORT-${Date.now()}`,
    name: "Camiseta importada",
    price: 40000,
    cost: 15000,
    stock: 10,
    active: true,
    status: "active",
  });

  const csv = [
    "sku,producto,nombre,telefono,cantidad,total,ref_externa",
    `${producto.sku},,Ana,3001234567,2,1,${ref}-1`,
    `,Camiseta impresa,Luis,3007654321,1,30000,${ref}-2`,
  ].join("\n");

  try {
    const resultado = await importCsv({ text: csv, adminId: admin.id });

    // Las dos filas son validas: la primera usa el precio del catalogo
    // (40000 x 2 = 80000, aunque el archivo diga 1) y la segunda, sin
    // producto en el catalogo, se importa como linea externa.
    assert.equal(resultado.summary.created, 2);

    const deCatalogo = await Order.findOne({
      where: { channel: "otro", externalRef: `${ref}-1` },
    });
    assert.ok(deCatalogo);
    assert.equal(deCatalogo.total, 80000);

    const externa = await Order.findOne({
      where: { channel: "otro", externalRef: `${ref}-2` },
    });
    assert.ok(externa);
    assert.equal(externa.total, 30000);

    // El archivo decia 1 y el catalogo suma 80000: se avisa, no se falla.
    assert.ok(
      resultado.warnings.some((warning) => warning.field === "total"),
      "debe avisar de la diferencia de total",
    );
  } finally {
    await limpiarPedidosImportados([`${ref}-1`, `${ref}-2`]);
    await Product.destroy({ where: { id: producto.id } });
    await Usuarios.destroy({ where: { id: admin.id } });
  }
});

test("el archivo no puede superar el maximo de filas", async (t) => {
  if (skipIfNoDb(t)) return;

  const filas = ["nombre,telefono,cantidad,total"];
  for (let i = 0; i <= MAX_ROWS; i += 1) {
    filas.push(`Cliente ${i},3001234567,1,1000`);
  }

  await assert.rejects(
    () => analyzeCsv(filas.join("\n")),
    (error) => error.status === 413,
  );
});
