// Migracion idempotente del sistema de precios.
//
// Se ejecuta al arrancar la API (local y produccion) para no depender de un
// runner manual en Neon, pero con dos reglas:
//
//   1. Camino rapido: si el esquema ya esta al dia se resuelve con 2 consultas
//      de solo lectura (sin transaccion, sin lock, sin DDL). Ese es el caso de
//      todos los arranques normales en Vercel.
//   2. Camino de migracion: solo si falta algo. Usa una transaccion con
//      advisory lock y lock_timeout corto para no colgar una funcion de Vercel
//      esperando un lock.
//
// Esquema vigente (modelos en Api/DataBase/models/):
//   price_variants  -> tarifa global por productType + tipo
//   product_prices  -> excepciones por producto y precios de combo
//   order_items.priceSnapshot -> copia del precio aplicado en el pedido
//
// Esquema viejo que esta funcion retira si todavia existe:
//   articulos.cost / articulos.descuento / dtf_price_variants
//
// Ya NO se consulta el esquema viejo para nada mas que para migrarlo: si no
// existe, esas consultas ni se ejecutan.

const { sequelize } = require("./db.js");

const SCHEMA_LOCK_KEY = 2147483001;

const DEFAULT_PRICES = [
  { productType: "articulo", tipo: "basico", precio: 35000 },
  { productType: "articulo", tipo: "oversize", precio: 60000 },
  { productType: "dtf", tipo: "basico", precio: 22000 },
  { productType: "dtf", tipo: "oversize", precio: 32000 },
];

// ---------------------------------------------------------------------------
// Deteccion
// ---------------------------------------------------------------------------

// Una sola consulta: que existe y que falta.
const getSchemaState = async (transaction) => {
  const [rows] = await sequelize.query(
    `SELECT
       to_regclass('public.price_variants') IS NOT NULL       AS "hasPriceVariants",
       to_regclass('public.product_prices') IS NOT NULL       AS "hasProductPrices",
       to_regclass('public.dtf_price_variants') IS NOT NULL   AS "hasLegacyDtfPrices",
       to_regclass('public.articulos') IS NOT NULL            AS "hasArticles",
       to_regclass('public.dtfs') IS NOT NULL                 AS "hasDtfs",
       to_regclass('public.order_items') IS NOT NULL          AS "hasOrderItems",
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'order_items'
            AND column_name = 'priceSnapshot'
       ) AS "hasPriceSnapshot",
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'articulos'
            AND column_name = 'combo'
       ) AS "hasCombo",
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'articulos'
            AND column_name = 'uid'
       ) AS "hasArticleUid",
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'articulos'
            AND column_name = 'descuentoPorcentaje'
       ) AS "hasArticleDiscount",
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'dtfs'
            AND column_name = 'uid'
       ) AS "hasDtfUid",
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'articulos'
            AND column_name = 'cost'
       ) AS "hasLegacyCost",
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'articulos'
            AND column_name = 'descuento'
       ) AS "hasLegacyDiscount"`,
    { transaction },
  );

  return rows[0];
};

// Falta estructura (tablas/columnas) o sobra esquema viejo.
const needsMigration = (state) =>
  !state.hasPriceVariants ||
  !state.hasProductPrices ||
  (state.hasOrderItems && !state.hasPriceSnapshot) ||
  (state.hasArticles && !state.hasCombo) ||
  (state.hasArticles && !state.hasArticleUid) ||
  (state.hasArticles && !state.hasArticleDiscount) ||
  (state.hasDtfs && !state.hasDtfUid) ||
  state.hasLegacyCost ||
  state.hasLegacyDiscount ||
  state.hasLegacyDtfPrices;

const hasPriceRows = async (transaction) => {
  const [rows] = await sequelize.query(
    "SELECT EXISTS (SELECT 1 FROM price_variants) AS ok",
    { transaction },
  );
  return Boolean(rows[0]?.ok);
};

// "Al dia" = estructura completa + al menos una tarifa global sembrada.
const isUpToDate = async (state, transaction) => {
  if (needsMigration(state)) return false;
  return hasPriceRows(transaction);
};

// ---------------------------------------------------------------------------
// Migracion del esquema viejo
// ---------------------------------------------------------------------------

const seedGlobalPrices = async (transaction, { hasCost, hasOldDtfTable }) => {
  const articleRows = hasCost
    ? (
        await sequelize.query(
          `SELECT oversize, cost, count(*)::int AS n
             FROM articulos
            WHERE COALESCE(combo, false) = false
              AND cost > 0
            GROUP BY oversize, cost
            ORDER BY oversize, n DESC, cost DESC`,
          { transaction },
        )
      )[0]
    : [];

  const dtfRows = hasOldDtfTable
    ? (
        await sequelize.query(
          `SELECT tipo, precio, count(*)::int AS n
             FROM dtf_price_variants
            WHERE precio > 0
            GROUP BY tipo, precio
            ORDER BY tipo, n DESC, precio DESC`,
          { transaction },
        )
      )[0]
    : [];

  const pick = (rows, predicate, fallback) =>
    Number(rows.find(predicate)?.precio ?? rows.find(predicate)?.cost ?? fallback);

  const values = [
    {
      productType: "articulo",
      tipo: "basico",
      precio: pick(articleRows, (row) => !row.oversize, 35000),
    },
    {
      productType: "articulo",
      tipo: "oversize",
      precio: pick(articleRows, (row) => row.oversize, 60000),
    },
    {
      productType: "dtf",
      tipo: "basico",
      precio: pick(dtfRows, (row) => row.tipo === "basico", 22000),
    },
    {
      productType: "dtf",
      tipo: "oversize",
      precio: pick(dtfRows, (row) => row.tipo === "oversize", 32000),
    },
  ];

  for (const item of values) {
    await sequelize.query(
      `INSERT INTO price_variants
        (id, "productType", tipo, precio, "precioAnterior", activo, "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, NULL, true, now(), now())
       ON CONFLICT ("productType", tipo) DO NOTHING`,
      {
        bind: [item.productType, item.tipo, item.precio],
        transaction,
      },
    );
  }
};

const migrateLegacyArticles = async (transaction) => {
  // Precio unitario: solo se crea excepcion si el precio actual difiere de
  // la tarifa global o si hay un precio anterior real.
  await sequelize.query(
    `INSERT INTO product_prices
       (id, "productType", "productId", tipo, kind, precio, "precioAnterior", activo, "createdAt", "updatedAt")
     SELECT
       gen_random_uuid(),
       'articulo',
       a.id,
       CASE WHEN a.oversize THEN 'oversize' ELSE 'basico' END,
       'unit',
       a.cost,
       CASE WHEN a.descuento > a.cost THEN a.descuento ELSE NULL END,
       true,
       now(),
       now()
     FROM articulos a
     JOIN price_variants pv
       ON pv."productType" = 'articulo'
      AND pv.tipo = CASE WHEN a.oversize THEN 'oversize' ELSE 'basico' END
     WHERE COALESCE(a.combo, false) = false
       AND a.cost IS NOT NULL
       AND a.cost > 0
       AND (
         a.cost <> pv.precio
         OR COALESCE(a.descuento, 0) > 0
       )
     ON CONFLICT ("productType", "productId", tipo, kind) DO NOTHING`,
    { transaction },
  );

  // Combo: es un articulo con un precio propio, independiente de la talla.
  await sequelize.query(
    `INSERT INTO product_prices
       (id, "productType", "productId", tipo, kind, precio, "precioAnterior", activo, "createdAt", "updatedAt")
     SELECT
       gen_random_uuid(),
       'articulo',
       a.id,
       'unico',
       'combo',
       a.cost,
       CASE WHEN a.descuento > a.cost THEN a.descuento ELSE NULL END,
       true,
       now(),
       now()
     FROM articulos a
     WHERE COALESCE(a.combo, false) = true
       AND a.cost IS NOT NULL
       AND a.cost > 0
     ON CONFLICT ("productType", "productId", tipo, kind) DO NOTHING`,
    { transaction },
  );
};

const migrateLegacyDtf = async (transaction) => {
  await sequelize.query(
    `INSERT INTO product_prices
       (id, "productType", "productId", tipo, kind, precio, "precioAnterior", activo, "createdAt", "updatedAt")
     SELECT DISTINCT ON (v."dtfId", v.tipo)
       gen_random_uuid(),
       'dtf',
       v."dtfId",
       v.tipo,
       'unit',
       v.precio,
       NULL,
       true,
       now(),
       now()
     FROM dtf_price_variants v
     JOIN price_variants pv
       ON pv."productType" = 'dtf'
      AND pv.tipo = v.tipo
     WHERE v.activo = true
       AND v.precio > 0
       AND v.precio <> pv.precio
     ORDER BY v."dtfId", v.tipo, v."updatedAt" DESC
     ON CONFLICT ("productType", "productId", tipo, kind) DO NOTHING`,
    { transaction },
  );
};

const backfillOrderPriceSnapshots = async (transaction) => {
  // DTF: el id de la variante vieja permite reconstruir el precio.
  await sequelize.query(
    `UPDATE order_items oi
        SET "priceSnapshot" = jsonb_build_object(
          'source', 'legacy',
          'priceVariantId', oi."variantId",
          'productType', 'dtf',
          'tipo', v.tipo,
          'precio', v.precio,
          'capturedAt', oi."createdAt"
        )
       FROM dtf_price_variants v
      WHERE oi."variantId" = v.id
        AND (
          oi."priceSnapshot" IS NULL
          OR oi."priceSnapshot" = '{}'::jsonb
        )`,
    { transaction },
  );

  // Articulos: el precio cobrado ya esta en unitPrice.
  await sequelize.query(
    `UPDATE order_items
        SET "priceSnapshot" = jsonb_build_object(
          'source', 'legacy',
          'productType', 'articulo',
          'precio', "unitPrice",
          'capturedAt', "createdAt"
        )
      WHERE "productType" = 'articulo'
        AND (
          "priceSnapshot" IS NULL
          OR "priceSnapshot" = '{}'::jsonb
        )`,
    { transaction },
  );
};

// ---------------------------------------------------------------------------
// Aplicar el esquema (solo en el camino de migracion)
// ---------------------------------------------------------------------------

const applySchema = async (transaction, state) => {
  const { hasArticles, hasDtfs, hasOrderItems } = state;

  // 1. Tablas nuevas.
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS price_variants (
      id UUID PRIMARY KEY,
      "productType" VARCHAR(20) NOT NULL CHECK ("productType" IN ('articulo', 'dtf')),
      tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('basico', 'oversize')),
      precio INTEGER NOT NULL CHECK (precio > 0),
      "precioAnterior" INTEGER CHECK ("precioAnterior" IS NULL OR "precioAnterior" > precio),
      activo BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE ("productType", tipo)
    )`,
    { transaction },
  );

  // Indices unicos: ON CONFLICT ("productType", tipo) los necesita.
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS price_variants_product_type_tipo_unique
       ON price_variants ("productType", tipo)`,
    { transaction },
  );

  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS product_prices (
      id UUID PRIMARY KEY,
      "productType" VARCHAR(20) NOT NULL CHECK ("productType" IN ('articulo', 'dtf')),
      "productId" UUID NOT NULL,
      tipo VARCHAR(50) NOT NULL DEFAULT 'unico' CHECK (tipo IN ('basico', 'oversize', 'unico')),
      kind VARCHAR(20) NOT NULL DEFAULT 'unit' CHECK (kind IN ('unit', 'combo')),
      precio INTEGER NOT NULL CHECK (precio > 0),
      "precioAnterior" INTEGER CHECK ("precioAnterior" IS NULL OR "precioAnterior" > precio),
      activo BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE ("productType", "productId", tipo, kind)
    )`,
    { transaction },
  );

  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS product_prices_product_tipo_kind_unique
       ON product_prices ("productType", "productId", tipo, kind)`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS product_prices_product_idx
       ON product_prices ("productType", "productId")`,
    { transaction },
  );

  // 2. Columnas del ecommerce.
  if (hasOrderItems && !state.hasPriceSnapshot) {
    await sequelize.query(
      `ALTER TABLE order_items
         ADD COLUMN "priceSnapshot" JSONB NOT NULL DEFAULT '{}'::jsonb`,
      { transaction },
    );
  }

  if (hasArticles) {
    if (!state.hasCombo) {
      await sequelize.query(
        "ALTER TABLE articulos ADD COLUMN combo BOOLEAN NOT NULL DEFAULT false",
        { transaction },
      );
    }

    if (!state.hasArticleUid) {
      await sequelize.query("ALTER TABLE articulos ADD COLUMN uid UUID", {
        transaction,
      });
    }

    // Descuento individual por articulo (porcentaje entero 0-100, NULL = sin
    // descuento). La columna NO se llama "descuento": ese nombre era del
    // esquema viejo y esta misma funcion lo elimina (hasLegacyDiscount).
    if (!state.hasArticleDiscount) {
      await sequelize.query(
        "ALTER TABLE articulos ADD COLUMN \"descuentoPorcentaje\" INTEGER",
        { transaction },
      );
      await sequelize.query(
        `DO $discount$
         BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM pg_constraint
              WHERE conrelid = 'articulos'::regclass
                AND conname = 'articulos_descuento_porcentaje_check'
           ) THEN
             ALTER TABLE articulos
               ADD CONSTRAINT articulos_descuento_porcentaje_check
               CHECK ("descuentoPorcentaje" IS NULL OR "descuentoPorcentaje" BETWEEN 0 AND 100);
           END IF;
         END
         $discount$`,
        { transaction },
      );
    }
  }

  if (hasDtfs && !state.hasDtfUid) {
    await sequelize.query("ALTER TABLE dtfs ADD COLUMN uid UUID", {
      transaction,
    });
  }

  // 3. FKs de uid (solo si las columnas existen).
  if (hasArticles && hasDtfs) {
    await sequelize.query(
      `DO $migration$
       DECLARE
         article_uid_attnum smallint;
         dtf_uid_attnum smallint;
       BEGIN
         SELECT attnum INTO article_uid_attnum
           FROM pg_attribute
          WHERE attrelid = 'articulos'::regclass
            AND attname = 'uid'
            AND NOT attisdropped;

         IF article_uid_attnum IS NOT NULL AND NOT EXISTS (
           SELECT 1
             FROM pg_constraint
            WHERE conrelid = 'articulos'::regclass
              AND contype = 'f'
              AND conkey = ARRAY[article_uid_attnum]
         ) THEN
           ALTER TABLE articulos
             ADD CONSTRAINT articulos_uid_fkey
             FOREIGN KEY (uid) REFERENCES usuarios (id)
             ON UPDATE CASCADE ON DELETE SET NULL;
         END IF;

         SELECT attnum INTO dtf_uid_attnum
           FROM pg_attribute
          WHERE attrelid = 'dtfs'::regclass
            AND attname = 'uid'
            AND NOT attisdropped;

         IF dtf_uid_attnum IS NOT NULL AND NOT EXISTS (
           SELECT 1
             FROM pg_constraint
            WHERE conrelid = 'dtfs'::regclass
              AND contype = 'f'
              AND conkey = ARRAY[dtf_uid_attnum]
         ) THEN
           ALTER TABLE dtfs
             ADD CONSTRAINT dtfs_uid_fkey
             FOREIGN KEY (uid) REFERENCES usuarios (id)
             ON UPDATE CASCADE ON DELETE SET NULL;
         END IF;
       END
       $migration$;`,
      { transaction },
    );

    await sequelize.query(
      "CREATE INDEX IF NOT EXISTS articulos_uid_idx ON articulos (uid)",
      { transaction },
    );
    await sequelize.query(
      "CREATE INDEX IF NOT EXISTS dtfs_uid_idx ON dtfs (uid)",
      { transaction },
    );
  }

  // 4. Esquema viejo -> nuevo. Solo se toca si todavia existe.
  const hasCost = hasArticles && state.hasLegacyCost;
  const hasOldDtfTable = state.hasLegacyDtfPrices;

  if (hasCost && !state.hasLegacyDiscount) {
    await sequelize.query(
      "ALTER TABLE articulos ADD COLUMN descuento INTEGER NOT NULL DEFAULT 0",
      { transaction },
    );
  }

  if (hasCost || hasOldDtfTable) {
    await seedGlobalPrices(transaction, { hasCost, hasOldDtfTable });
  }
  if (hasCost) {
    await migrateLegacyArticles(transaction);
  }
  if (hasOldDtfTable) {
    await migrateLegacyDtf(transaction);
    // A esta altura order_items.priceSnapshot ya existe si hay order_items.
    if (hasOrderItems) {
      await backfillOrderPriceSnapshots(transaction);
    }
  }

  // 5. Tarifa minima para que el catalogo nunca quede sin precios.
  await sequelize.query(
    `INSERT INTO price_variants
      (id, "productType", tipo, precio, "precioAnterior", activo, "createdAt", "updatedAt")
     SELECT gen_random_uuid(), v."productType", v.tipo, v.precio, NULL, true, now(), now()
     FROM jsonb_to_recordset($1::jsonb) AS v("productType" text, tipo text, precio int)
     ON CONFLICT ("productType", tipo) DO NOTHING`,
    {
      bind: [JSON.stringify(DEFAULT_PRICES)],
      transaction,
    },
  );

  // 6. Retirar el esquema viejo, ya con los datos copiados.
  if (hasOldDtfTable) {
    if (hasOrderItems) {
      await sequelize.query(
        "ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_variantId_fkey",
        { transaction },
      );
    }
    await sequelize.query("DROP TABLE IF EXISTS dtf_price_variants CASCADE", {
      transaction,
    });
  }

  if (hasCost) {
    await sequelize.query("ALTER TABLE articulos DROP COLUMN IF EXISTS cost", {
      transaction,
    });
  }
  if (hasCost || state.hasLegacyDiscount) {
    await sequelize.query(
      "ALTER TABLE articulos DROP COLUMN IF EXISTS descuento",
      { transaction },
    );
  }
};

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

const ensurePricingSchema = async () => {
  // Camino rapido (arranque normal): 2 consultas de solo lectura.
  const initialState = await getSchemaState();
  if (await isUpToDate(initialState)) {
    console.log("✅ Esquema de precios al día");
    return { migrated: false };
  }

  const transaction = await sequelize.transaction();

  try {
    // No dejar una funcion de Vercel esperando un lock para siempre.
    await sequelize.query("SET LOCAL lock_timeout = '10s'", { transaction });
    await sequelize.query("SET LOCAL statement_timeout = '120s'", {
      transaction,
    });

    // Serializa la migracion entre instancias (Vercel puede arrancar varias).
    await sequelize.query(`SELECT pg_advisory_xact_lock(${SCHEMA_LOCK_KEY})`, {
      transaction,
    });

    // Otra instancia pudo migrar mientras esperabamos el lock.
    const state = await getSchemaState(transaction);
    if (await isUpToDate(state, transaction)) {
      await transaction.commit();
      console.log("✅ Esquema de precios al día (otra instancia ya migró)");
      return { migrated: false };
    }

    console.log("🛠️ Migrando el esquema de precios...");
    await applySchema(transaction, state);
    await transaction.commit();
    console.log("✅ Esquema de precios verificado");

    return { migrated: true };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // La conexion pudo caerse: el rollback ya no aplica.
    }
    console.error("❌ Error migrando el esquema de precios:", error.message);
    throw error;
  }
};

module.exports = { ensurePricingSchema, getSchemaState, needsMigration };