// Migracion idempotente del esquema de dropshipping.
//
// Mismo patron que ensurePricing.js (que es el que ya funciona en Neon):
//
//   1. Camino rapido: si el esquema ya esta al dia se resuelve con UNA
//      consulta de solo lectura (sin transaccion, sin lock, sin DDL). Ese es
//      el caso de todos los arranques normales en Vercel.
//   2. Camino de migracion: solo si falta algo. Transaccion con advisory
//      lock y lock_timeout corto, para no colgar una funcion de Vercel
//      esperando un lock.
//
// Que agrega:
//
//   orders        -> fulfillmentStatus, paymentState, paymentMethodCode y
//                    las columnas del proveedor (provider, providerOrderId,
//                    providerStatus, statusSource, manualOverride,
//                    providerOutOfSync) + contabilidad (providerCost,
//                    gatewayFee, providerFee, netProfit) + addressSnapshot.
//   payments      -> payoutAmount, payoutDate, collectedAt, settledAt.
//   usuarios      -> profileComplete, profileCompleteAt.
//   notificaciones-> orderId, channel, sentAt, payload.
//   (nuevas)      -> addresses, webhook_events, audit_logs, sync_logs.
//
// Los estados canonicos se COPIAN desde los legacy (status / paymentStatus)
// en el backfill. Las columnas legacy NO se borran aqui: se eliminan en la
// Fase 2, cuando todo el codigo ya lee las canonicas. Asi la API sigue
// funcionando despues de cada fase.

const { sequelize } = require("./db.js");

const SCHEMA_LOCK_KEY = 2147483002;

// ---------------------------------------------------------------------------
// Deteccion
// ---------------------------------------------------------------------------

// Una sola consulta: que existe y que falta.
const getSchemaState = async (transaction) => {
  const [rows] = await sequelize.query(
    `SELECT
       to_regclass('public.orders') IS NOT NULL          AS "hasOrders",
       to_regclass('public.payments') IS NOT NULL         AS "hasPayments",
       to_regclass('public.usuarios') IS NOT NULL         AS "hasUsers",
       to_regclass('public.notificaciones') IS NOT NULL   AS "hasNotifications",
       to_regclass('public.addresses') IS NOT NULL        AS "hasAddresses",
       to_regclass('public.webhook_events') IS NOT NULL   AS "hasWebhookEvents",
       to_regclass('public.audit_logs') IS NOT NULL       AS "hasAuditLogs",
       to_regclass('public.sync_logs') IS NOT NULL        AS "hasSyncLogs",

       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'orders'
                  AND column_name = 'fulfillmentStatus')  AS "hasFulfillmentStatus",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'orders'
                  AND column_name = 'paymentState')       AS "hasPaymentState",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'orders'
                  AND column_name = 'paymentMethodCode')  AS "hasPaymentMethodCode",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'orders'
                  AND column_name = 'provider')           AS "hasProvider",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'orders'
                  AND column_name = 'providerOrderId')    AS "hasProviderOrderId",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'orders'
                  AND column_name = 'statusSource')       AS "hasStatusSource",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'orders'
                  AND column_name = 'manualOverride')     AS "hasManualOverride",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'orders'
                  AND column_name = 'providerOutOfSync')  AS "hasProviderOutOfSync",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'orders'
                  AND column_name = 'netProfit')          AS "hasNetProfit",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'orders'
                  AND column_name = 'addressSnapshot')    AS "hasAddressSnapshot",

       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'orders'
                  AND column_name = 'status')              AS "hasLegacyStatus",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'orders'
                  AND column_name = 'paymentStatus')       AS "hasLegacyPaymentStatus",

       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'payments'
                  AND column_name = 'payoutAmount')       AS "hasPayoutAmount",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'payments'
                  AND column_name = 'collectedAt')        AS "hasCollectedAt",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'payments'
                  AND column_name = 'settledAt')          AS "hasSettledAt",

       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'usuarios'
                  AND column_name = 'profileComplete')    AS "hasProfileComplete",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'usuarios'
                  AND column_name = 'createdAt')         AS "hasUserCreatedAt",

       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'notificaciones'
                  AND column_name = 'orderId')            AS "hasNotificationOrderId",

       -- Indice unico que garantiza la idempotencia de los webhooks. Se
       -- verifica aparte porque los indices no aparecen en information_schema.
       EXISTS (SELECT 1 FROM pg_indexes
                WHERE schemaname = 'public'
                  AND indexname = 'webhook_events_provider_event_id_unique')
                                                          AS "hasWebhookUnique"`,
    { transaction },
  );

  return rows[0] || {};
};

// Falta estructura (tablas/columnas).
const needsMigration = (state) => {
  if (!state.hasOrders) return false;

  return (
    !state.hasFulfillmentStatus ||
    !state.hasPaymentState ||
    !state.hasPaymentMethodCode ||
    !state.hasProvider ||
    !state.hasProviderOrderId ||
    !state.hasStatusSource ||
    !state.hasManualOverride ||
    !state.hasProviderOutOfSync ||
    !state.hasNetProfit ||
    !state.hasAddressSnapshot ||
    !state.hasAddresses ||
    !state.hasWebhookEvents ||
    !state.hasAuditLogs ||
    !state.hasSyncLogs ||
    !state.hasWebhookUnique ||
    (state.hasPayments && !state.hasPayoutAmount) ||
    (state.hasPayments && !state.hasCollectedAt) ||
    (state.hasPayments && !state.hasSettledAt) ||
    (state.hasUsers && !state.hasProfileComplete) ||
    (state.hasUsers && !state.hasUserCreatedAt) ||
    (state.hasNotifications && !state.hasNotificationOrderId) ||
    // Fase 2: las columnas historicas ya no se usan. Mientras existan, la
    // migracion tiene trabajo pendiente (backfill del historial y DROP).
    state.hasLegacyStatus ||
    state.hasLegacyPaymentStatus
  );
};

const isUpToDate = async (state, transaction) =>
  !needsMigration(state);

// ---------------------------------------------------------------------------
// Aplicacion del esquema
// ---------------------------------------------------------------------------

// Reemplaza un CHECK de enum por el conjunto de valores de este archivo.
//
// En Postgres no hay "ADD CONSTRAINT IF NOT EXISTS", asi que se consulta
// pg_constraint primero (mismo truco que usa ensurePricing.js) y, si el
// conjunto de valores cambio, se rehace.
//
// OJO: el cuerpo de un bloque DO es una cadena PL/pgSQL, no admite
// parametros de bind ($1). Por eso los nombres se escriben como literales:
// son constantes internas de este archivo, nunca entrada de usuario.
const addCheckConstraint = async (transaction, table, column, values, name) => {
  const lista = values.map((v) => `'${v}'`).join(", ");
  const definicion = `CHECK (${column} IS NULL OR ${column} IN (${lista}))`;

  await sequelize.query(
    `DO $constraint$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_constraint
          WHERE conrelid = '${table}'::regclass
            AND conname = '${name}'
       ) THEN
         ALTER TABLE ${table}
           ADD CONSTRAINT ${name}
           ${definicion};
       END IF;
     END
     $constraint$`,
    { transaction },
  );

  // Si el constraint ya existe pero con otros valores, se rehace para que
  // este archivo sea la unica fuente de verdad.
  const [actual] = await sequelize.query(
    `SELECT pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE conrelid = '${table}'::regclass
        AND conname = '${name}'`,
    { transaction },
  );

  const defActual = actual?.[0]?.def || "";
  const normalizada = defActual.replace(/\s+/g, " ").toLowerCase();
  const defEsperada = definicion.replace(/\s+/g, " ").toLowerCase();

  if (!normalizada.includes(defEsperada)) {
    await sequelize.query(
      `ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`,
      { transaction },
    );
    await sequelize.query(
      `ALTER TABLE ${table} ADD CONSTRAINT ${name} ${definicion}`,
      { transaction },
    );
  }
};

const applySchema = async (transaction, state) => {
  // -------------------------------------------------------------------------
  // 0. Secuencia de numeracion de pedidos.
  //
  // Services/orders.js -> generateOrderNumber() hace
  // "SELECT nextval('order_number_seq')". La secuencia se usaba pero nunca
  // se creaba desde el codigo (venia de la base original), asi que una base
  // nueva fallaba al crear el primer pedido. Se crea aqui si falta.
  // -------------------------------------------------------------------------
  await sequelize.query(
    `CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1 INCREMENT 1`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 1. Tablas nuevas.
  // -------------------------------------------------------------------------

  // Direcciones del usuario. Hay varias por usuario y una principal
  // (isDefault). El indice unico parcial garantiza como maximo una
  // principal por persona.
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS addresses (
      id UUID PRIMARY KEY,
      "userId" UUID NOT NULL REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE,
      department VARCHAR(100),
      city VARCHAR(100),
      address VARCHAR(255) NOT NULL,
      reference VARCHAR(200),
      "isDefault" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS addresses_user_id_idx ON addresses ("userId")`,
    { transaction },
  );

  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS addresses_one_default_per_user
       ON addresses ("userId") WHERE "isDefault" = true`,
    { transaction },
  );

  // Eventos de webhook. La idempotencia se apoya en el indice unico
  // (provider, eventId): si el evento ya existe, no se reprocesa.
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS webhook_events (
      id UUID PRIMARY KEY,
      provider VARCHAR(30) NOT NULL,
      "eventId" VARCHAR(200) NOT NULL,
      event VARCHAR(80),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      processed BOOLEAN NOT NULL DEFAULT false,
      "processedAt" TIMESTAMPTZ,
      error TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    { transaction },
  );

  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_provider_event_id_unique
       ON webhook_events (provider, "eventId")`,
    { transaction },
  );

  // El indice no unico equivalente es redundante y permitia duplicados en
  // bases donde la migracion no habia corrido: se retira.
  await sequelize.query(
    `DROP INDEX IF EXISTS webhook_events_lookup_idx`,
    { transaction },
  );

  // Auditoria: quien, que, antes, despues, desde donde y cuando.
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY,
      "userId" UUID REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL,
      entity VARCHAR(50) NOT NULL,
      "entityId" VARCHAR(100),
      action VARCHAR(80) NOT NULL,
      before JSONB,
      after JSONB,
      ip VARCHAR(64),
      "requestId" VARCHAR(80),
      note TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
       ON audit_logs (entity, "entityId", "createdAt" DESC)`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
       ON audit_logs ("createdAt" DESC)`,
    { transaction },
  );

  // Bitacora de sincronizacion con proveedores (entrada y salida).
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS sync_logs (
      id UUID PRIMARY KEY,
      "orderId" UUID REFERENCES orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
      provider VARCHAR(30) NOT NULL,
      direction VARCHAR(10) NOT NULL CHECK (direction IN ('in', 'out')),
      attempt INTEGER NOT NULL DEFAULT 1,
      ok BOOLEAN NOT NULL DEFAULT false,
      request JSONB,
      response JSONB,
      error TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS sync_logs_order_id_idx ON sync_logs ("orderId")`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS sync_logs_failed_idx
       ON sync_logs (provider, direction, ok, "createdAt" DESC)`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 2. Columnas de orders.
  // -------------------------------------------------------------------------

  await sequelize.query(
    `ALTER TABLE orders
       ADD COLUMN IF NOT EXISTS "fulfillmentStatus" VARCHAR(30) NOT NULL DEFAULT 'pending_payment'`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE orders
       ADD COLUMN IF NOT EXISTS "paymentState" VARCHAR(30) NOT NULL DEFAULT 'unpaid'`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE orders
       ADD COLUMN IF NOT EXISTS "paymentMethodCode" VARCHAR(30)`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE orders
       ADD COLUMN IF NOT EXISTS "provider" VARCHAR(30)`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE orders
       ADD COLUMN IF NOT EXISTS "providerOrderId" VARCHAR(120)`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE orders
       ADD COLUMN IF NOT EXISTS "providerStatus" VARCHAR(80)`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE orders
       ADD COLUMN IF NOT EXISTS "statusSource" VARCHAR(30) NOT NULL DEFAULT 'manual_admin'`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE orders
       ADD COLUMN IF NOT EXISTS "manualOverride" BOOLEAN NOT NULL DEFAULT false`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE orders
       ADD COLUMN IF NOT EXISTS "providerOutOfSync" BOOLEAN NOT NULL DEFAULT false`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE orders
       ADD COLUMN IF NOT EXISTS "trackingUrl" TEXT`,
    { transaction },
  );

  // Contabilidad. Todo en pesos COP enteros, igual que subtotal/total.
  await sequelize.query(
    `ALTER TABLE orders
       ADD COLUMN IF NOT EXISTS "providerCost" INTEGER NOT NULL DEFAULT 0`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE orders
       ADD COLUMN IF NOT EXISTS "gatewayFee" INTEGER NOT NULL DEFAULT 0`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE orders
       ADD COLUMN IF NOT EXISTS "providerFee" INTEGER NOT NULL DEFAULT 0`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE orders
       ADD COLUMN IF NOT EXISTS "netProfit" INTEGER NOT NULL DEFAULT 0`,
    { transaction },
  );

  // Direccion congelada al momento de la compra. Es la que ve el courier:
  // si el usuario cambia su direccion despues, el pedido no se mueve.
  await sequelize.query(
    `ALTER TABLE orders
       ADD COLUMN IF NOT EXISTS "addressSnapshot" JSONB NOT NULL DEFAULT '{}'::jsonb`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE orders
       ADD COLUMN IF NOT EXISTS "profileCompleteAt" TIMESTAMPTZ`,
    { transaction },
  );

  // CHECKs de los enums canonicos.
  await addCheckConstraint(
    transaction,
    "orders",
    '"fulfillmentStatus"',
    [
      "pending_payment",
      "paid",
      "packing",
      "shipped",
      "delivered",
      "cancelled",
    ],
    "orders_fulfillment_status_check",
  );

  await addCheckConstraint(
    transaction,
    "orders",
    '"paymentState"',
    ["unpaid", "pending_collection", "collected", "settled", "refunded"],
    "orders_payment_state_check",
  );

  await addCheckConstraint(
    transaction,
    "orders",
    '"paymentMethodCode"',
    ["wompi", "vendelo", "cod_dropi", "cod_vendelo"],
    "orders_payment_method_code_check",
  );

  await addCheckConstraint(
    transaction,
    "orders",
    "provider",
    ["vendelo", "dropi"],
    "orders_provider_check",
  );

  await addCheckConstraint(
    transaction,
    "orders",
    '"statusSource"',
    ["auto_sync", "manual_admin", "manual_admin_pushed", "webhook", "customer"],
    "orders_status_source_check",
  );

  // Indices.
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS orders_fulfillment_status_idx
       ON orders ("fulfillmentStatus")`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS orders_payment_state_idx
       ON orders ("paymentState")`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS orders_provider_order_id_idx
       ON orders (provider, "providerOrderId")`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS orders_provider_out_of_sync_idx
       ON orders ("providerOutOfSync") WHERE "providerOutOfSync" = true`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 3. Columnas de payments.
  // -------------------------------------------------------------------------

  await sequelize.query(
    `ALTER TABLE payments
       ADD COLUMN IF NOT EXISTS "payoutAmount" INTEGER`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE payments
       ADD COLUMN IF NOT EXISTS "payoutDate" DATE`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE payments
       ADD COLUMN IF NOT EXISTS "collectedAt" TIMESTAMPTZ`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE payments
       ADD COLUMN IF NOT EXISTS "settledAt" TIMESTAMPTZ`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 4. Columnas de usuarios y notificaciones.
  // -------------------------------------------------------------------------

  await sequelize.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS "profileComplete" BOOLEAN NOT NULL DEFAULT false`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS "profileCompleteAt" TIMESTAMPTZ`,
    { transaction },
  );

  // La tabla de usuarios no tenia marcas de tiempo. Se agregan ahora para
  // que el modelo pueda gestionarlas (timestamps: true).
  //
  // OJO: para los usuarios que ya existian, "createdAt" queda con la fecha
  // de esta migracion, no la real de creacion. Es la mejor aproximacion
  // disponible sin historial previo.
  await sequelize.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE notificaciones
       ADD COLUMN IF NOT EXISTS "orderId" UUID REFERENCES orders(id) ON UPDATE CASCADE ON DELETE CASCADE`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE notificaciones
       ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'in_app'`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE notificaciones
       ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMPTZ`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE notificaciones
       ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS notificaciones_order_id_idx
       ON notificaciones ("orderId")`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 5. Backfill: estados legacy -> canonicos.
  //
  // Solo corre si las columnas historicas todavia existen. Se hace ANTES de
  // retirarlas (paso 7).
  // -------------------------------------------------------------------------

  if (state.hasLegacyStatus) {
    await sequelize.query(
      `UPDATE orders
          SET "fulfillmentStatus" = CASE "status"
                WHEN 'pendiente_pago'  THEN 'pending_payment'
                WHEN 'pagado'          THEN 'paid'
                WHEN 'en_preparacion'  THEN 'packing'
                WHEN 'enviado'         THEN 'shipped'
                WHEN 'entregado'       THEN 'delivered'
                WHEN 'cancelado'       THEN 'cancelled'
                ELSE 'pending_payment'
              END
        WHERE "fulfillmentStatus" = 'pending_payment'
          AND "status" <> 'pendiente_pago'`,
      { transaction },
    );
  }

  if (state.hasLegacyPaymentStatus) {
    // El estado del dinero solo se toca cuando sigue en el valor por defecto
    // ('unpaid') y el legacy dice otra cosa. Asi una segunda corrida de la
    // migracion no degrada un estado canonico ya avanzado (p. ej. 'collected').
    await sequelize.query(
      `UPDATE orders
          SET "paymentState" = CASE "paymentStatus"
                WHEN 'aprobado'     THEN 'settled'
                WHEN 'anulado'      THEN 'refunded'
                WHEN 'reembolsado'  THEN 'refunded'
                ELSE 'unpaid'
              END
        WHERE "paymentState" = 'unpaid'
          AND "paymentStatus" IN ('aprobado', 'anulado', 'reembolsado')`,
      { transaction },
    );
  }

  // El metodo de pago canonico solo se puede afirmar con evidencia: si el
  // pedido tiene un pago de Wompi, su metodo fue wompi. Para el resto se
  // deja NULL (pago manual o venta presencial): adivinar seria peor que
  // no saber.
  await sequelize.query(
    `UPDATE orders o
        SET "paymentMethodCode" = 'wompi'
      WHERE o."paymentMethodCode" IS NULL
        AND EXISTS (
          SELECT 1 FROM payments p
           WHERE p."orderId" = o.id
             AND p.provider = 'wompi'
        )`,
    { transaction },
  );

  // Direccion congelada a partir de los campos planos del snapshot.
  await sequelize.query(
    `UPDATE orders
        SET "addressSnapshot" = jsonb_build_object(
              'address', "address",
              'city', "city",
              'department', "department",
              'postalCode', "postalCode",
              'recipientName', "recipientName",
              'phone', "phone",
              'email', "email",
              'source', 'legacy'
            )
      WHERE "addressSnapshot" = '{}'::jsonb
        AND ("address" IS NOT NULL OR "city" IS NOT NULL OR "department" IS NOT NULL)`,
    { transaction },
  );

  // Direcciones: cada usuario con una direccion guardada en el perfil
  // recibe una direccion principal.
  await sequelize.query(
    `INSERT INTO addresses (id, "userId", department, city, address, reference, "isDefault", "createdAt", "updatedAt")
     SELECT gen_random_uuid(), u.id, NULL, NULL, u.address, NULL, true, now(), now()
       FROM usuarios u
      WHERE u.address IS NOT NULL
        AND btrim(u.address) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM addresses a WHERE a."userId" = u.id
        )`,
    { transaction },
  );

  // Perfil completo: nombre, apellido, telefono y direccion principal.
  await sequelize.query(
    `UPDATE usuarios u
        SET "profileComplete" = (
              u.name IS NOT NULL AND btrim(u.name) <> ''
          AND u."lastName" IS NOT NULL AND btrim(u."lastName") <> ''
          AND u.phone IS NOT NULL AND btrim(u.phone) <> ''
          AND EXISTS (
            SELECT 1 FROM addresses a
             WHERE a."userId" = u.id
               AND a."isDefault" = true
          )
        )`,
    { transaction },
  );

  await sequelize.query(
    `UPDATE usuarios
        SET "profileCompleteAt" = COALESCE("profileCompleteAt", now())
      WHERE "profileComplete" = true
        AND "profileCompleteAt" IS NULL`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 6. Utilidad: la direccion principal que ya existe en el perfil no debe
  //    quedar duplicada como direccion secundaria.
  // -------------------------------------------------------------------------
  await sequelize.query(
    `UPDATE addresses a
        SET "isDefault" = false
      WHERE a."isDefault" = true
        AND EXISTS (
          SELECT 1 FROM addresses b
           WHERE b."userId" = a."userId"
             AND b.id <> a.id
             AND b."isDefault" = true
        )`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 7. Retiro de las columnas historicas de estado (Fase 2).
  //
  // No hay front que las consuma: los estados canonicos ya son la unica
  // fuente de verdad. Antes de borrarlas, el historial del pedido se traduce
  // al vocabulario canonico para que las dos mitades de la tabla se lean
  // igual.
  // -------------------------------------------------------------------------

  if (state.hasLegacyStatus || state.hasLegacyPaymentStatus) {
    // Historial logistico: valores en espanol -> canonicos.
    await sequelize.query(
      `UPDATE order_status_history
          SET "fromStatus" = CASE "fromStatus"
                WHEN 'pendiente_pago'  THEN 'pending_payment'
                WHEN 'pagado'          THEN 'paid'
                WHEN 'en_preparacion'  THEN 'packing'
                WHEN 'enviado'         THEN 'shipped'
                WHEN 'entregado'       THEN 'delivered'
                WHEN 'cancelado'       THEN 'cancelled'
                ELSE "fromStatus"
              END,
              "toStatus" = CASE "toStatus"
                WHEN 'pendiente_pago'  THEN 'pending_payment'
                WHEN 'pagado'          THEN 'paid'
                WHEN 'en_preparacion'  THEN 'packing'
                WHEN 'enviado'         THEN 'shipped'
                WHEN 'entregado'       THEN 'delivered'
                WHEN 'cancelado'       THEN 'cancelled'
                ELSE "toStatus"
              END
        WHERE kind = 'logistica'`,
      { transaction },
    );

    // Historial de pago: el vocabulario viejo del pedido -> canonico.
    await sequelize.query(
      `UPDATE order_status_history
          SET "fromStatus" = CASE "fromStatus"
                WHEN 'pendiente'    THEN 'unpaid'
                WHEN 'rechazado'    THEN 'unpaid'
                WHEN 'en_revision'  THEN 'unpaid'
                WHEN 'error'        THEN 'unpaid'
                WHEN 'aprobado'     THEN 'settled'
                WHEN 'anulado'      THEN 'refunded'
                WHEN 'reembolsado'  THEN 'refunded'
                ELSE "fromStatus"
              END,
              "toStatus" = CASE "toStatus"
                WHEN 'pendiente'    THEN 'unpaid'
                WHEN 'rechazado'    THEN 'unpaid'
                WHEN 'en_revision'  THEN 'unpaid'
                WHEN 'error'        THEN 'unpaid'
                WHEN 'aprobado'     THEN 'settled'
                WHEN 'anulado'      THEN 'refunded'
                WHEN 'reembolsado'  THEN 'refunded'
                ELSE "toStatus"
              END
        WHERE kind = 'pago'`,
      { transaction },
    );

    // Se retiran los indices antes que las columnas (Postgres los borra
    // igual, pero dejarlo explicito evita sorpresas en el log).
    await sequelize.query(
      `DROP INDEX IF EXISTS orders_status_idx`,
      { transaction },
    );
    await sequelize.query(
      `DROP INDEX IF EXISTS orders_payment_status_idx`,
      { transaction },
    );

    await sequelize.query(
      `ALTER TABLE orders
         DROP COLUMN IF EXISTS status,
         DROP COLUMN IF EXISTS "paymentStatus"`,
      { transaction },
    );
  }
};

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

const ensureDropshippingSchema = async () => {
  // Camino rapido (arranque normal): una consulta de solo lectura.
  const initialState = await getSchemaState();
  if (await isUpToDate(initialState)) {
    console.log("✅ Esquema de dropshipping al día");
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
      console.log("✅ Esquema de dropshipping al día (otra instancia ya migró)");
      return { migrated: false };
    }

    console.log("🛠️ Migrando el esquema de dropshipping...");
    await applySchema(transaction, state);
    await transaction.commit();
    console.log("✅ Esquema de dropshipping verificado");

    return { migrated: true };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // La conexion pudo caerse: el rollback ya no aplica.
    }
    console.error("❌ Error migrando el esquema de dropshipping:", error.message);
    throw error;
  }
};

module.exports = {
  ensureDropshippingSchema,
  getSchemaState,
  needsMigration,
};
