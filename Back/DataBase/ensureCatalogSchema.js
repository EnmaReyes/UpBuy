// Migracion idempotente del catalogo (productos, categorias, imagenes) y de la
// integracion con proveedores.
//
// Misma estructura que ensureDropshippingSchema.js:
//
//   1. Camino rapido: si el esquema ya esta al dia se resuelve con UNA
//      consulta de solo lectura (sin transaccion, sin lock, sin DDL).
//   2. Camino de migracion: solo si falta algo. Transaccion con advisory lock
//      y lock_timeout corto, para no colgar una funcion de Vercel.
//
// Que hace:
//
//   - Crea `products` (reemplaza a `articulos`): catalogo publicado.
//   - Crea `categories` + `product_categories` (N:M) y `product_images`.
//   - Crea el catalogo de proveedores: `suppliers`, `supplier_credentials`,
//     `supplier_products`, `supplier_product_variations`,
//     `supplier_product_assets` y `catalog_sync_runs`.
//   - Agrega `order_items.supplierProductId` (trazabilidad, sin FK).
//   - RETIRA el esquema viejo de precios por talla (price_variants,
//     product_prices) y las tablas articulos/dtfs, que quedaron obsoletas.
//   - Siembra el proveedor Venndelo (idempotente).
//
// Los DROP solo se ejecutan si la tabla existe Y esta vacia: si tiene filas,
// se deja intacta y se registra un aviso (nunca se pierden datos por arrancar).

const { sequelize } = require("./db.js");

const SCHEMA_LOCK_KEY = 2147483003;

// ---------------------------------------------------------------------------
// Deteccion
// ---------------------------------------------------------------------------

const getSchemaState = async (transaction) => {
  const [rows] = await sequelize.query(
    `SELECT
       to_regclass('public.products') IS NOT NULL                 AS "hasProducts",
       to_regclass('public.categories') IS NOT NULL               AS "hasCategories",
       to_regclass('public.product_images') IS NOT NULL           AS "hasProductImages",
       to_regclass('public.product_categories') IS NOT NULL       AS "hasProductCategories",
       to_regclass('public.suppliers') IS NOT NULL                AS "hasSuppliers",
       to_regclass('public.supplier_credentials') IS NOT NULL     AS "hasSupplierCredentials",
       to_regclass('public.supplier_products') IS NOT NULL        AS "hasSupplierProducts",
       to_regclass('public.supplier_product_variations') IS NOT NULL AS "hasSupplierVariations",
       to_regclass('public.supplier_product_assets') IS NOT NULL  AS "hasSupplierAssets",
       to_regclass('public.catalog_sync_runs') IS NOT NULL        AS "hasCatalogSyncRuns",
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'products'
            AND column_name = 'supplierProductId'
       ) AS "hasSupplierProductId",
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'products'
            AND column_name = 'manualOverrides'
       ) AS "hasManualOverrides",
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'order_items'
            AND column_name = 'supplierProductId'
       ) AS "hasOrderItemSupplierProductId",
       to_regclass('public.articulos') IS NOT NULL                AS "hasLegacyArticles",
       to_regclass('public.dtfs') IS NOT NULL                     AS "hasLegacyDtfs",
       to_regclass('public.price_variants') IS NOT NULL           AS "hasLegacyPriceVariants",
       to_regclass('public.product_prices') IS NOT NULL           AS "hasLegacyProductPrices"`,
    { transaction },
  );

  return rows[0] || {};
};

const needsMigration = (state) => {
  // Sin order_items todavia (base nueva) el resto de la estructura igual se
  // puede crear: no se exige.
  return (
    !state.hasProducts ||
    !state.hasCategories ||
    !state.hasProductImages ||
    !state.hasProductCategories ||
    !state.hasSuppliers ||
    !state.hasSupplierCredentials ||
    !state.hasSupplierProducts ||
    !state.hasSupplierVariations ||
    !state.hasSupplierAssets ||
    !state.hasCatalogSyncRuns ||
    !state.hasSupplierProductId ||
    !state.hasManualOverrides ||
    !state.hasOrderItemSupplierProductId ||
    state.hasLegacyArticles ||
    state.hasLegacyDtfs ||
    state.hasLegacyPriceVariants ||
    state.hasLegacyProductPrices
  );
};

// ---------------------------------------------------------------------------
// Helpers DDL
// ---------------------------------------------------------------------------

// Borra una tabla obsoleta.
//
//   - `purge: false` (por defecto): solo se borra si esta vacia. Con filas se
//     conserva y se avisa: el arranque nunca destruye informacion.
//   - `purge: true`: la tabla es configuracion derivada y sin valor de negocio
//     (tarifas), asi que se vacia y se borra.
const dropIfEmpty = async (transaction, table, { purge = false } = {}) => {
  const [exists] = await sequelize.query(
    `SELECT to_regclass('public.${table}') IS NOT NULL AS ok`,
    { transaction },
  );
  if (!exists?.[0]?.ok) return;

  const [rows] = await sequelize.query(
    `SELECT count(*)::int AS n FROM ${table}`,
    { transaction },
  );
  const total = rows?.[0]?.n || 0;

  if (total > 0) {
    if (!purge) {
      console.warn(
        `⚠️  ${table} tiene ${total} fila(s): no se elimina. Migrala a mano.`,
      );
      return;
    }
    console.warn(`🗑️  ${table}: se descartan ${total} fila(s) de configuracion.`);
  }

  await sequelize.query(`DROP TABLE IF EXISTS ${table} CASCADE`, {
    transaction,
  });
  console.log(`🧹 Esquema viejo retirado: ${table}`);
};

// Agrega una FK por columna si el modelo lo pide y la tabla referida existe.
const addForeignKeyIfPossible = async (
  transaction,
  { table, column, refTable, refColumn = "id", onDelete = "SET NULL", name },
) => {
  const [ref] = await sequelize.query(
    `SELECT to_regclass('public.${refTable}') IS NOT NULL AS ok`,
    { transaction },
  );
  if (!ref?.[0]?.ok) return;

  await sequelize.query(
    `DO $fk$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_constraint
          WHERE conrelid = '${table}'::regclass AND conname = '${name}'
       ) THEN
         ALTER TABLE ${table}
           ADD CONSTRAINT ${name}
           FOREIGN KEY ("${column}") REFERENCES ${refTable}(${refColumn})
           ON UPDATE CASCADE ON DELETE ${onDelete};
       END IF;
     END
     $fk$`,
    { transaction },
  );
};

// ---------------------------------------------------------------------------
// Aplicacion del esquema
// ---------------------------------------------------------------------------

const applySchema = async (transaction, state) => {
  // -------------------------------------------------------------------------
  // 1. Proveedores
  // -------------------------------------------------------------------------
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS suppliers (
      id UUID PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      slug VARCHAR(40) NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "baseUrl" VARCHAR(255),
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    { transaction },
  );
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS suppliers_slug_unique ON suppliers (slug)`,
    { transaction },
  );

  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS supplier_credentials (
      id UUID PRIMARY KEY,
      "supplierId" UUID NOT NULL REFERENCES suppliers(id) ON UPDATE CASCADE ON DELETE CASCADE,
      "clientId" VARCHAR(255),
      "encryptedClientSecret" TEXT,
      "encryptedRefreshToken" TEXT,
      "refreshTokenExpiresAt" TIMESTAMPTZ,
      "accessTokenExpiresAt" TIMESTAMPTZ,
      "lastRotatedAt" TIMESTAMPTZ,
      source VARCHAR(10) NOT NULL DEFAULT 'env',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    { transaction },
  );
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS supplier_credentials_supplier_unique
       ON supplier_credentials ("supplierId")`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 2. Catalogo original del proveedor
  // -------------------------------------------------------------------------
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS supplier_products (
      id UUID PRIMARY KEY,
      "supplierId" UUID NOT NULL REFERENCES suppliers(id) ON UPDATE CASCADE ON DELETE CASCADE,
      "externalId" VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      "originalPrice" DECIMAL(12,2),
      currency CHAR(3) NOT NULL DEFAULT 'COP',
      availability BOOLEAN NOT NULL DEFAULT false,
      "totalQuantity" INTEGER NOT NULL DEFAULT 0,
      "processingTime" VARCHAR(20),
      "rawData" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "lastSyncedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    { transaction },
  );
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS supplier_products_supplier_external_unique
       ON supplier_products ("supplierId", "externalId")`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS supplier_products_supplier_idx ON supplier_products ("supplierId")`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS supplier_products_synced_idx ON supplier_products ("lastSyncedAt")`,
    { transaction },
  );

  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS supplier_product_variations (
      id UUID PRIMARY KEY,
      "supplierProductId" UUID NOT NULL REFERENCES supplier_products(id) ON UPDATE CASCADE ON DELETE CASCADE,
      "externalId" VARCHAR(64) NOT NULL,
      sku VARCHAR(255),
      attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
      "originalPrice" DECIMAL(12,2),
      "compareAtPrice" DECIMAL(12,2),
      "supplierPrice" DECIMAL(12,2),
      quantity INTEGER NOT NULL DEFAULT 0,
      available BOOLEAN NOT NULL DEFAULT false,
      "rawData" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "lastSyncedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    { transaction },
  );
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS supplier_variations_product_external_unique
       ON supplier_product_variations ("supplierProductId", "externalId")`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS supplier_variations_product_idx
       ON supplier_product_variations ("supplierProductId")`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS supplier_variations_sku_idx
       ON supplier_product_variations (sku)`,
    { transaction },
  );

  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS supplier_product_assets (
      id UUID PRIMARY KEY,
      "supplierProductId" UUID NOT NULL REFERENCES supplier_products(id) ON UPDATE CASCADE ON DELETE CASCADE,
      "externalAssetId" VARCHAR(20) NOT NULL,
      url TEXT NOT NULL,
      "fileName" VARCHAR(255),
      "contentType" VARCHAR(30),
      size INTEGER,
      position INTEGER NOT NULL DEFAULT 1,
      "isPrimary" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    { transaction },
  );
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS supplier_assets_product_external_unique
       ON supplier_product_assets ("supplierProductId", "externalAssetId")`,
    { transaction },
  );
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS supplier_assets_product_position_unique
       ON supplier_product_assets ("supplierProductId", position)`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 3. Productos publicados, categorias e imagenes
  // -------------------------------------------------------------------------
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY,
      sku VARCHAR(100) NOT NULL,
      slug VARCHAR(180),
      "supplierId" UUID REFERENCES suppliers(id) ON UPDATE CASCADE ON DELETE SET NULL,
      "supplierProductId" UUID REFERENCES supplier_products(id) ON UPDATE CASCADE ON DELETE SET NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      images JSONB NOT NULL DEFAULT '[]'::jsonb,
      cost INTEGER NOT NULL DEFAULT 0,
      markup INTEGER NOT NULL DEFAULT 30,
      price INTEGER NOT NULL DEFAULT 0,
      "compareAtPrice" INTEGER,
      currency CHAR(3) NOT NULL DEFAULT 'COP',
      stock INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      provider VARCHAR(30) NOT NULL DEFAULT 'manual',
      "providerSku" VARCHAR(100),
      sizes JSONB NOT NULL DEFAULT '[]'::jsonb,
      oversize BOOLEAN NOT NULL DEFAULT false,
      destacadas BOOLEAN NOT NULL DEFAULT false,
      combo BOOLEAN NOT NULL DEFAULT false,
      "descuentoPorcentaje" INTEGER,
      "manualOverrides" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "publishedAt" TIMESTAMPTZ,
      uid UUID,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    { transaction },
  );
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique ON products (sku)`,
    { transaction },
  );
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS products_slug_unique ON products (slug) WHERE slug IS NOT NULL`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS products_provider_idx ON products (provider)`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS products_status_idx ON products (status)`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS products_active_idx ON products (active)`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS products_uid_idx ON products (uid)`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS products_supplier_idx ON products ("supplierId")`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS products_supplier_product_idx ON products ("supplierProductId")`,
    { transaction },
  );

  // FK del autor (usuarios puede no existir todavia en una base nueva).
  await addForeignKeyIfPossible(transaction, {
    table: "products",
    column: "uid",
    refTable: "usuarios",
    onDelete: "SET NULL",
    name: "products_uid_fkey",
  });

  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS categories (
      id UUID PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      slug VARCHAR(140) NOT NULL,
      description VARCHAR(255),
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "supplierId" UUID REFERENCES suppliers(id) ON UPDATE CASCADE ON DELETE SET NULL,
      "externalId" VARCHAR(120),
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    { transaction },
  );
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS categories_slug_unique ON categories (slug)`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS categories_active_idx ON categories ("isActive")`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS categories_supplier_external_idx
       ON categories ("supplierId", "externalId")`,
    { transaction },
  );

  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS product_categories (
      "productId" UUID NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
      "categoryId" UUID NOT NULL REFERENCES categories(id) ON UPDATE CASCADE ON DELETE CASCADE,
      PRIMARY KEY ("productId", "categoryId")
    )`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS product_categories_category_idx
       ON product_categories ("categoryId")`,
    { transaction },
  );

  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS product_images (
      id UUID PRIMARY KEY,
      "productId" UUID NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
      "externalAssetId" VARCHAR(20),
      url TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 1,
      "isPrimary" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    { transaction },
  );
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS product_images_product_position_unique
       ON product_images ("productId", position)`,
    { transaction },
  );
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS product_images_product_asset_unique
       ON product_images ("productId", "externalAssetId")
       WHERE "externalAssetId" IS NOT NULL`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS product_images_product_idx ON product_images ("productId")`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 4. Bitacora de sincronizacion de catalogo
  // -------------------------------------------------------------------------
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS catalog_sync_runs (
      id UUID PRIMARY KEY,
      "supplierId" UUID NOT NULL REFERENCES suppliers(id) ON UPDATE CASCADE ON DELETE CASCADE,
      trigger VARCHAR(10) NOT NULL DEFAULT 'manual',
      status VARCHAR(10) NOT NULL DEFAULT 'running',
      "startedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "finishedAt" TIMESTAMPTZ,
      cursor VARCHAR(255),
      pages INTEGER NOT NULL DEFAULT 0,
      received INTEGER NOT NULL DEFAULT 0,
      created INTEGER NOT NULL DEFAULT 0,
      updated INTEGER NOT NULL DEFAULT 0,
      unchanged INTEGER NOT NULL DEFAULT 0,
      errors INTEGER NOT NULL DEFAULT 0,
      "errorSummary" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "triggeredBy" UUID,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS catalog_sync_runs_supplier_idx ON catalog_sync_runs ("supplierId")`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS catalog_sync_runs_supplier_status_idx
       ON catalog_sync_runs ("supplierId", status)`,
    { transaction },
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS catalog_sync_runs_started_idx ON catalog_sync_runs ("startedAt")`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 5. Trazabilidad en order_items
  // -------------------------------------------------------------------------
  await sequelize.query(
    `ALTER TABLE order_items
       ADD COLUMN IF NOT EXISTS "supplierProductId" UUID`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 6. Retiro del esquema viejo (solo si esta vacio)
  // -------------------------------------------------------------------------
  // Las tarifas globales por talla (price_variants/product_prices) son
  // configuracion derivada del modelo de precios viejo: no tienen valor de
  // negocio, se descartan. articulos/dtfs pudieron tener catalogo: solo se
  // eliminan si estan vacias.
  await dropIfEmpty(transaction, "price_variants", { purge: true });
  await dropIfEmpty(transaction, "product_prices", { purge: true });
  await dropIfEmpty(transaction, "dtf_price_variants", { purge: true });
  await dropIfEmpty(transaction, "dtfs");
  await dropIfEmpty(transaction, "articulos");

  // -------------------------------------------------------------------------
  // 7. Semillas
  // -------------------------------------------------------------------------
  await sequelize.query(
    `INSERT INTO suppliers (id, name, slug, "isActive", "baseUrl", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), 'Venndelo', 'venndelo', true, 'https://api.venndelo.com', now(), now())
     ON CONFLICT (slug) DO NOTHING`,
    { transaction },
  );
};

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

const ensureCatalogSchema = async () => {
  const initialState = await getSchemaState();
  if (!needsMigration(initialState)) {
    console.log("✅ Esquema de catálogo al día");
    return { migrated: false };
  }

  const transaction = await sequelize.transaction();

  try {
    await sequelize.query("SET LOCAL lock_timeout = '10s'", { transaction });
    await sequelize.query("SET LOCAL statement_timeout = '120s'", {
      transaction,
    });
    await sequelize.query(`SELECT pg_advisory_xact_lock(${SCHEMA_LOCK_KEY})`, {
      transaction,
    });

    const state = await getSchemaState(transaction);
    if (!needsMigration(state)) {
      await transaction.commit();
      console.log("✅ Esquema de catálogo al día (otra instancia ya migró)");
      return { migrated: false };
    }

    console.log("🛠️ Migrando el esquema de catálogo...");
    await applySchema(transaction, state);
    await transaction.commit();
    console.log("✅ Esquema de catálogo verificado");

    return { migrated: true };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // La conexion pudo caerse: el rollback ya no aplica.
    }
    console.error("❌ Error migrando el esquema de catálogo:", error.message);
    throw error;
  }
};

module.exports = {
  ensureCatalogSchema,
  getSchemaState,
  needsMigration,
};
