// Verificacion end-to-end de la migracion de dropshipping.
//
// Simula una base LEGACY: crea el esquema, inserta pedidos con los estados
// antiguos en espanol, borra las columnas canonicas (para forzar el camino
// de migracion) y despues corre ensureDropshippingSchema().
//
// Al final comprueba que:
//   - las columnas canonicas existen y tienen los valores esperados,
//   - las tablas nuevas se crearon,
//   - el perfil completo se recalculo,
//   - la direccion del perfil se migro a addresses,
//   - correr la migracion dos veces no rompe nada (idempotencia).
//
// Uso:  node scripts/verifyDropshippingMigration.js
// OJO: es DESTRUCTIVO. Solo sobre una base de desarrollo.

const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local"),
  override: true,
});

const { sequelize } = require("../DataBase/db.js");
// Importar el indice REGISTRA todos los modelos: sin esto sequelize.sync()
// no encuentra nada que crear.
require("../DataBase/models/index.js");
const { ensureDropshippingSchema } = require("../DataBase/ensureDropshippingSchema.js");

const resultados = [];
const check = (nombre, ok, detalle = "") => {
  resultados.push({ nombre, ok, detalle });
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
};

const LEGACY_ORDERS = [
  {
    status: "pendiente_pago",
    paymentStatus: "pendiente",
    esperadoF: "pending_payment",
    esperadoP: "unpaid",
  },
  {
    status: "pagado",
    paymentStatus: "aprobado",
    esperadoF: "paid",
    esperadoP: "settled",
  },
  {
    status: "en_preparacion",
    paymentStatus: "aprobado",
    esperadoF: "packing",
    esperadoP: "settled",
  },
  {
    status: "enviado",
    paymentStatus: "pendiente",
    esperadoF: "shipped",
    esperadoP: "unpaid",
  },
  {
    status: "entregado",
    paymentStatus: "aprobado",
    esperadoF: "delivered",
    esperadoP: "settled",
  },
  {
    status: "cancelado",
    paymentStatus: "reembolsado",
    esperadoF: "cancelled",
    esperadoP: "refunded",
  },
];

const run = async () => {
  // --- 1. Esquema base -------------------------------------------------
  await sequelize.sync();
  console.log("--- esquema creado ---");

  // Limpieza previa: una corrida fallada puede dejar datos de prueba.
  await sequelize.query(
    `DELETE FROM usuarios WHERE email IN ('test@upbuy.local','test2@upbuy.local')`,
  );
  await sequelize.query(`DELETE FROM orders WHERE "orderNumber" LIKE 'LEG-%'`);

  // --- 2. Datos legacy -------------------------------------------------
  const [user] = await sequelize.query(
    `INSERT INTO usuarios (id, username, email, password, admin, name, "lastName", phone, address, "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), 'test', 'test@upbuy.local', 'x', false, 'Ana', 'Perez', '3001234567', 'Calle 1 #2-3', now(), now())
     RETURNING id`,
  );
  const userId = user[0].id;

  const [dirUser] = await sequelize.query(
    `INSERT INTO usuarios (id, username, email, password, admin, name, "lastName", phone, address, "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), 'test2', 'test2@upbuy.local', 'x', false, 'Luis', NULL, NULL, NULL, now(), now())
     RETURNING id`,
  );

  const ordenes = [];
  for (const item of LEGACY_ORDERS) {
    const [row] = await sequelize.query(
      `INSERT INTO orders (id, "orderNumber", status, "paymentStatus", subtotal, "shippingCost", total, currency, "recipientName", phone, address, city, department, "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, 50000, 10000, 60000, 'COP', 'Cliente', '3001234567', 'Calle 9 #8-7', 'Medellin', 'Antioquia', now(), now())
       RETURNING id`,
      {
        bind: [
          `LEG-${ordenes.length}-${Date.now().toString().slice(-6)}`,
          item.status,
          item.paymentStatus,
        ],
      },
    );
    ordenes.push({ id: row[0].id, ...item });
  }

  // --- 3. Simular base legacy: quitar las columnas canonicas ----------
  await sequelize.query(
    `ALTER TABLE orders
       DROP COLUMN IF EXISTS "fulfillmentStatus",
       DROP COLUMN IF EXISTS "paymentState",
       DROP COLUMN IF EXISTS "paymentMethodCode",
       DROP COLUMN IF EXISTS "provider",
       DROP COLUMN IF EXISTS "providerOrderId",
       DROP COLUMN IF EXISTS "providerStatus",
       DROP COLUMN IF EXISTS "statusSource",
       DROP COLUMN IF EXISTS "manualOverride",
       DROP COLUMN IF EXISTS "providerOutOfSync",
       DROP COLUMN IF EXISTS "trackingUrl",
       DROP COLUMN IF EXISTS "providerCost",
       DROP COLUMN IF EXISTS "gatewayFee",
       DROP COLUMN IF EXISTS "providerFee",
       DROP COLUMN IF EXISTS "netProfit",
       DROP COLUMN IF EXISTS "addressSnapshot",
       DROP COLUMN IF EXISTS "profileCompleteAt"`,
  );
  await sequelize.query(`DROP TABLE IF EXISTS addresses CASCADE`);
  await sequelize.query(`DROP TABLE IF EXISTS webhook_events CASCADE`);
  await sequelize.query(`DROP TABLE IF EXISTS audit_logs CASCADE`);
  await sequelize.query(`DROP TABLE IF EXISTS sync_logs CASCADE`);
  await sequelize.query(
    `ALTER TABLE usuarios
       DROP COLUMN IF EXISTS "profileComplete",
       DROP COLUMN IF EXISTS "profileCompleteAt",
       DROP COLUMN IF EXISTS "createdAt",
       DROP COLUMN IF EXISTS "updatedAt"`,
  );
  await sequelize.query(
    `ALTER TABLE payments
       DROP COLUMN IF EXISTS "payoutAmount",
       DROP COLUMN IF EXISTS "payoutDate",
       DROP COLUMN IF EXISTS "collectedAt",
       DROP COLUMN IF EXISTS "settledAt"`,
  );
  await sequelize.query(
    `ALTER TABLE notificaciones
       DROP COLUMN IF EXISTS "orderId",
       DROP COLUMN IF EXISTS channel,
       DROP COLUMN IF EXISTS "sentAt",
       DROP COLUMN IF EXISTS payload`,
  );
  console.log("--- base simulada como legacy ---");

  // --- 4. Correr la migracion ------------------------------------------
  const primera = await ensureDropshippingSchema();
  check("la migracion corrio", primera.migrated === true);

  // --- 5. Verificar el backfill ----------------------------------------
  const [rows] = await sequelize.query(
    `SELECT id, status, "paymentStatus", "fulfillmentStatus", "paymentState", "addressSnapshot"
       FROM orders ORDER BY "createdAt" ASC`,
  );

  let ok = true;
  for (const item of ordenes) {
    const fila = rows.find((r) => r.id === item.id);
    const cumple =
      fila &&
      fila.fulfillmentStatus === item.esperadoF &&
      fila.paymentState === item.esperadoP;
    if (!cumple) ok = false;
    console.log(
      `   ${cumple ? "✅" : "❌"} ${item.status}/${item.paymentStatus} -> ${fila?.fulfillmentStatus}/${fila?.paymentState} (esperado ${item.esperadoF}/${item.esperadoP})`,
    );
  }
  check("backfill de estados canonicos", ok);

  const [conSnapshot] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM orders WHERE "addressSnapshot"->>'address' IS NOT NULL`,
  );
  check("addressSnapshot congelado", conSnapshot[0].n === ordenes.length, `${conSnapshot[0].n}/${ordenes.length}`);

  // --- 6. Tablas nuevas -------------------------------------------------
  const [tablas] = await sequelize.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public'`,
  );
  const nombres = tablas.map((t) => t.tablename);
  for (const tabla of ["addresses", "webhook_events", "audit_logs", "sync_logs"]) {
    check(`tabla ${tabla} creada`, nombres.includes(tabla));
  }

  // --- 7. Direcciones migradas del perfil ------------------------------
  const [dirs] = await sequelize.query(
    `SELECT "userId", address, "isDefault" FROM addresses`,
  );
  check(
    "direccion del perfil migrada a addresses",
    dirs.length === 1 && dirs[0].address === "Calle 1 #2-3" && dirs[0].isDefault === true,
    JSON.stringify(dirs),
  );

  // --- 8. Perfil completo ----------------------------------------------
  const [perfiles] = await sequelize.query(
    `SELECT email, "profileComplete", "profileCompleteAt" FROM usuarios ORDER BY email`,
  );
  const completo = perfiles.find((p) => p.email === "test@upbuy.local");
  const incompleto = perfiles.find((p) => p.email === "test2@upbuy.local");
  check(
    "perfil completo calculado (true)",
    completo?.profileComplete === true && completo?.profileCompleteAt !== null,
  );
  check(
    "perfil incompleto calculado (false)",
    incompleto?.profileComplete === false,
  );

  // --- 9. CHECK constraints de enum ------------------------------------
  const [bad] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM orders WHERE "fulfillmentStatus" NOT IN ('pending_payment','paid','packing','shipped','delivered','cancelled')`,
  );
  check("CHECK de fulfillmentStatus", bad[0].n === 0);

  let falloCheck = null;
  try {
    await sequelize.query(
      `UPDATE orders SET "paymentState" = 'inventado' WHERE id = $1`,
      { bind: [ordenes[0].id] },
    );
  } catch (error) {
    falloCheck = error;
  }
  check("CHECK de paymentState rechaza valores inventados", Boolean(falloCheck));

  // --- 10. Idempotencia -------------------------------------------------
  const segunda = await ensureDropshippingSchema();
  check("segunda corrida = no-op (idempotente)", segunda.migrated === false);

  const [rows2] = await sequelize.query(
    `SELECT "fulfillmentStatus", "paymentState" FROM orders ORDER BY "createdAt" ASC`,
  );
  check(
    "los datos no cambiaron en la segunda corrida",
    rows2.length === rows.length &&
      rows2.every((r, i) => r.fulfillmentStatus === rows[i].fulfillmentStatus),
  );

  // --- 11. Limpieza -----------------------------------------------------
  await sequelize.query(`DELETE FROM orders WHERE "orderNumber" LIKE 'LEG-%'`);
  await sequelize.query(`DELETE FROM usuarios WHERE email IN ('test@upbuy.local','test2@upbuy.local')`);

  const fallos = resultados.filter((r) => !r.ok).length;
  console.log(
    fallos === 0
      ? `\n✅ ${resultados.length} verificaciones OK`
      : `\n❌ ${fallos} de ${resultados.length} verificaciones fallaron`,
  );
  return fallos;
};

run()
  .then((fallos) => {
    process.exitCode = fallos === 0 ? 0 : 1;
  })
  .catch((error) => {
    console.error("❌", error.name, error.message);
    console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
