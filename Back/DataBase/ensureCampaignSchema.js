// Migracion idempotente del esquema de campanas (ADM-7).
//
// Mismo patron que ensureAdminSecuritySchema.js:
//   1. Camino rapido: una consulta de solo lectura cuando todo esta al dia.
//   2. Camino de migracion: transaccion + advisory lock + lock_timeout corto.
//
// Agrega:
//   campaigns            -> campanas de difusion (email).
//   campaign_recipients  -> destinatarios con idempotencia unica
//                           (campaignId + userId).
//   usuarios             -> marketingOptIn, marketingOptInAt, unsubscribedAt,
//                           emailBouncedAt (consentimiento de difusion).

const { sequelize } = require("./db.js");

const SCHEMA_LOCK_KEY = 2147483005;

const getSchemaState = async (transaction) => {
  const [rows] = await sequelize.query(
    `SELECT
       to_regclass('public.campaigns') IS NOT NULL          AS "hasCampaigns",
       to_regclass('public.campaign_recipients') IS NOT NULL
                                                            AS "hasRecipients",

       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'usuarios'
                  AND column_name = 'marketingOptIn')      AS "hasMarketingOptIn",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'usuarios'
                  AND column_name = 'marketingOptInAt')    AS "hasMarketingOptInAt",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'usuarios'
                  AND column_name = 'unsubscribedAt')      AS "hasUnsubscribedAt",
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'usuarios'
                   AND column_name = 'emailBouncedAt')      AS "hasEmailBouncedAt",
        EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'usuarios'
                   AND column_name = 'whatsappOptIn')       AS "hasWhatsappOptIn",
        EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'usuarios'
                   AND column_name = 'whatsappOptInAt')     AS "hasWhatsappOptInAt",
        EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'usuarios'
                   AND column_name = 'whatsappUnsubscribedAt')
                                                             AS "hasWhatsappUnsubscribedAt",
        EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'campaign_recipients'
                   AND column_name = 'phone')               AS "hasRecipientPhone"`,
    { transaction },
  );

  return rows[0] || {};
};

const needsMigration = (state) => {
  // Se llama siempre despues de ensureBaseSchema (usuarios existe), asi que
  // no hace falta un guard extra: si falta cualquiera de las piezas nuevas,
  // hay que migrar.
  return (
    !state.hasCampaigns ||
    !state.hasRecipients ||
    !state.hasMarketingOptIn ||
    !state.hasMarketingOptInAt ||
    !state.hasUnsubscribedAt ||
    !state.hasEmailBouncedAt ||
    !state.hasWhatsappOptIn ||
    !state.hasWhatsappOptInAt ||
    !state.hasWhatsappUnsubscribedAt ||
    !state.hasRecipientPhone
  );
};

const applySchema = async (transaction) => {
  // -------------------------------------------------------------------------
  // 1. Consentimiento de difusion en usuarios.
  // -------------------------------------------------------------------------
  await sequelize.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS "marketingOptIn" BOOLEAN NOT NULL DEFAULT false`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS "marketingOptInAt" TIMESTAMPTZ`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS "unsubscribedAt" TIMESTAMPTZ`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS "emailBouncedAt" TIMESTAMPTZ`,
    { transaction },
  );

  // La baja manda: por coherencia, quien esta dado de baja se considera
  // fuera de toda difusion aunque el opt-in haya quedado en true.
  await sequelize.query(
    `UPDATE usuarios
        SET "marketingOptIn" = false
      WHERE "unsubscribedAt" IS NOT NULL
        AND "marketingOptIn" IS DISTINCT FROM false`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS usuarios_marketing_opt_in_idx
        ON usuarios ("marketingOptIn")
      WHERE "marketingOptIn" = true AND "unsubscribedAt" IS NULL`,
    { transaction },
  );

  // Consentimiento por WhatsApp (ADM-8). El opt-in de correo NO se hereda:
  // son consentimientos independientes.
  await sequelize.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS "whatsappOptInAt" TIMESTAMPTZ`,
    { transaction },
  );

  await sequelize.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS "whatsappUnsubscribedAt" TIMESTAMPTZ`,
    { transaction },
  );

  await sequelize.query(
    `UPDATE usuarios
        SET "whatsappOptIn" = false
      WHERE "whatsappUnsubscribedAt" IS NOT NULL
        AND "whatsappOptIn" IS DISTINCT FROM false`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS usuarios_whatsapp_opt_in_idx
        ON usuarios ("whatsappOptIn")
      WHERE "whatsappOptIn" = true AND "whatsappUnsubscribedAt" IS NULL`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 2. Campanas.
  // -------------------------------------------------------------------------
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS campaigns (
        id UUID PRIMARY KEY,
        subject VARCHAR(200) NOT NULL,
        body TEXT NOT NULL,
        segment VARCHAR(20) NOT NULL DEFAULT 'todos',
        channel VARCHAR(20) NOT NULL DEFAULT 'email',
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        "totalRecipients" INTEGER NOT NULL DEFAULT 0,
        "sentCount" INTEGER NOT NULL DEFAULT 0,
        "failedCount" INTEGER NOT NULL DEFAULT 0,
        "createdBy" UUID NOT NULL REFERENCES usuarios(id)
                       ON UPDATE CASCADE ON DELETE CASCADE,
        "lastBatchResult" JSONB,
        "sentAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS campaigns_status_idx
        ON campaigns (status)`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS campaigns_created_at_idx
        ON campaigns ("createdAt" DESC)`,
    { transaction },
  );

  // -------------------------------------------------------------------------
  // 3. Destinatarios (idempotencia unica por campana + usuario).
  // -------------------------------------------------------------------------
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS campaign_recipients (
        id UUID PRIMARY KEY,
        "campaignId" UUID NOT NULL REFERENCES campaigns(id)
                        ON UPDATE CASCADE ON DELETE CASCADE,
        "userId" UUID NOT NULL REFERENCES usuarios(id)
                   ON UPDATE CASCADE ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(30),
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        error VARCHAR(300),
        "sentAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
    { transaction },
  );

  // Campanas creadas antes de ADM-8: agrega la columna de telefono.
  await sequelize.query(
    `ALTER TABLE campaign_recipients
       ADD COLUMN IF NOT EXISTS "phone" VARCHAR(30)`,
    { transaction },
  );

  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS campaign_recipients_campaign_user_key
        ON campaign_recipients ("campaignId", "userId")`,
    { transaction },
  );

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS campaign_recipients_campaign_status_idx
        ON campaign_recipients ("campaignId", status)`,
    { transaction },
  );
};

const ensureCampaignSchema = async () => {
  // Camino rapido (arranque normal en Vercel): solo lectura.
  const initialState = await getSchemaState();
  if (!needsMigration(initialState)) {
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

    // Otra instancia pudo migrar mientras esperabamos el lock.
    const state = await getSchemaState(transaction);
    if (!needsMigration(state)) {
      await transaction.commit();
      return { migrated: false };
    }

    console.log("🛠️ Migrando el esquema de campanas...");
    await applySchema(transaction);
    await transaction.commit();
    console.log("✅ Esquema de campanas verificado");

    return { migrated: true };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // La conexion pudo caerse: el rollback ya no aplica.
    }
    console.error("❌ Error migrando el esquema de campanas:", error.message);
    throw error;
  }
};

module.exports = {
  ensureCampaignSchema,
  getSchemaState,
  needsMigration,
};
