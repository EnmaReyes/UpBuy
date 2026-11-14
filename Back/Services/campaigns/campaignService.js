// Servicio de campanas de difusion por email (ADM-7).
//
// Reglas:
//   - Sin Gmail configurado (OAuth + GMAIL_TOKEN_ENCRYPTION_KEY) el envio
//     responde 503 GMAIL_NOT_CONFIGURED: la UI lo muestra y no finge enviar.
//   - El envio corre por lotes de 25; `sendBatchForCampaign` es reintentable
//     sin duplicar: solo reclama filas `pending` con FOR UPDATE SKIP LOCKED
//     y revalida el consentimiento de cada destinatario al reclamarlo.
//   - La baja y los rebotes mandan: un usuario dado de baja jamas recibe
//     promociones, aunque su fila exista en la campana.
//   - El techo diario (CAMPAIGN_DAILY_LIMIT, 400) es global: todas las
//     campanas suman contra los correos enviados hoy.
//   - El token de refresh nunca sale de este modulo (solo pasa de la base a
//     gmail.sendEmail) y nunca se registra en logs.

const { Op } = require("sequelize");
const jwt = require("jsonwebtoken");
const { sequelize } = require("../../DataBase/db.js");
const {
  Campaign,
  CampaignRecipient,
  Usuarios,
  Order,
} = require("../../DataBase/models/index.js");
const gmail = require("../gmail.js");
const whatsapp = require("../whatsapp/index.js");
const {
  CAMPAIGN_DAILY_LIMIT,
  JWT_SECRET,
  JWT_ALGORITHM,
  JWT_ISSUER,
  JWT_AUDIENCE,
  FRONTEND_URL,
  WHATSAPP_TEMPLATE_MARKETING,
  WHATSAPP_TEMPLATE_LANG,
} = require("../../config.js");
const {
  SEGMENTS,
  SEGMENT_LABELS,
  isValidSegment,
  audienceWhere,
  previewAudience,
  previewWhatsappAudience,
  whatsappAudience,
} = require("../consent.js");
const { createState, verifyState, PURPOSE } = require("./oauthState.js");
const { renderTemplate, buildHtmlDocument } = require("./render.js");
const { createLogger } = require("../../Utils/logger.js");

const log = createLogger("campaigns");

const BATCH_SIZE = 25;
// Lote de WhatsApp: Cloud API tolera 20 sin problemas de throughput.
const WHATSAPP_BATCH_SIZE = 20;
// Filas `claimed` con mas de este tiempo se recuperan (crash de la funcion
// tras reclamar): vuelven a `pending` para que el reintento las tome.
const STALE_CLAIMED_MINUTES = 10;

const UNSUB_PURPOSE = "campaign_unsub";

class CampaignError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const NOT_CONFIGURED = () =>
  new CampaignError(503, "GMAIL_NOT_CONFIGURED", "Gmail no está configurado");
const NOT_CONNECTED = () =>
  new CampaignError(
    503,
    "GMAIL_NOT_CONNECTED",
    "Gmail no está conectado: ningún administrador autorizó el envío",
  );

// ---------------------------------------------------------------------------
// Estado de Gmail
// ---------------------------------------------------------------------------

// Correos enviados HOY (UTC) por todas las campanas.
const sentTodayCount = async () => {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

  const rows = await sequelize.query(
    `SELECT COUNT(*)::int AS total
       FROM campaign_recipients
      WHERE status = 'sent'
        AND "sentAt" >= :start`,
    { replacements: { start }, type: sequelize.QueryTypes.SELECT },
  );

  return Number(rows[0]?.total || 0);
};

const gmailStatus = async ({ adminId } = {}) => {
  const configured = gmail.isGmailConfigured();
  let connected = false;

  if (configured) {
    if (adminId) {
      connected = await gmail.hasRefreshToken(adminId);
    } else {
      // Sin sesion (cron): sirve cualquier admin con token.
      const withToken = await Usuarios.count({
        where: { gmailRefreshToken: { [Op.ne]: null } },
      });
      connected = withToken > 0;
    }
  }

  return {
    configured,
    connected,
    from: process.env.GOOGLE_MAIL_FROM || "upbuy.official@gmail.com",
    dailyLimit: CAMPAIGN_DAILY_LIMIT,
    sentToday: await sentTodayCount(),
    // El redirect URI que hay que registrar en Google Cloud Console.
    redirectPath: "/api/admin/campaigns/oauth/callback",
  };
};

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

// El `state` viaja firmado (JWT) y ademas en una cookie httpOnly: el callback
// exige igualdad entre ambos.
const oauthStart = ({ adminId }) => {
  if (!gmail.isGmailConfigured()) throw NOT_CONFIGURED();

  const state = createState(adminId);
  return { url: gmail.getAuthUrl(state), state };
};

const oauthCallback = async ({ code, state, adminId, stateCookie }) => {
  if (!gmail.isGmailConfigured()) throw NOT_CONFIGURED();

  const payload = verifyState(state);
  if (!payload || String(payload.adminId) !== String(adminId)) {
    throw new CampaignError(
      400,
      "GMAIL_STATE_INVALID",
      "Estado OAuth inválido o expirado",
    );
  }

  // La cookie debe traer el mismo state (anti inyeccion de code ajeno).
  if (!stateCookie || stateCookie !== state) {
    throw new CampaignError(
      400,
      "GMAIL_STATE_INVALID",
      "Estado OAuth inválido o expirado",
    );
  }

  await gmail.handleCallback({
    code,
    state,
    expectedState: state,
    userId: adminId,
  });

  return { connected: true };
};

// ---------------------------------------------------------------------------
// Audiencia y creacion
// ---------------------------------------------------------------------------

const createCampaign = async ({
  adminId,
  subject,
  body,
  segment = SEGMENTS.todos,
}) => {
  const cleanSubject = String(subject || "").trim();
  const cleanBody = String(body || "").trim();

  if (!cleanSubject || cleanSubject.length > 200) {
    throw new CampaignError(
      400,
      "CAMPAIGN_SUBJECT_INVALID",
      "El asunto es obligatorio (máximo 200 caracteres)",
    );
  }
  if (!cleanBody) {
    throw new CampaignError(
      400,
      "CAMPAIGN_BODY_INVALID",
      "El cuerpo del correo es obligatorio",
    );
  }
  if (!isValidSegment(segment)) {
    throw new CampaignError(
      400,
      "CAMPAIGN_SEGMENT_INVALID",
      "Segmento de audiencia inválido",
    );
  }

  const recipients = await Usuarios.findAll({
    where: audienceWhere(segment),
    attributes: ["id", "email"],
  });

  if (recipients.length === 0) {
    throw new CampaignError(
      422,
      "CAMPAIGN_EMPTY_AUDIENCE",
      "La audiencia seleccionada no tiene destinatarios",
    );
  }

  return sequelize.transaction(async (transaction) => {
    const campaign = await Campaign.create(
      {
        subject: cleanSubject,
        body: cleanBody,
        segment,
        channel: "email",
        status: "sending",
        totalRecipients: recipients.length,
        createdBy: adminId,
      },
      { transaction },
    );

    // DENTRO de una campana el par (campaignId, userId) es unico (indice en
    // ensureCampaignSchema): reintentar jamas duplica destinatarios.
    await CampaignRecipient.bulkCreate(
      recipients.map((user) => ({
        campaignId: campaign.id,
        userId: user.id,
        email: user.email,
        status: "pending",
      })),
      { transaction, ignoreDuplicates: true },
    );

    return campaign;
  });
};

// ---------------------------------------------------------------------------
// Variables de plantilla por destinatario
// ---------------------------------------------------------------------------

const variablesFor = async (userId) => {
  const [user, lastOrder] = await Promise.all([
    Usuarios.findByPk(userId, {
      attributes: ["name", "lastName", "username", "address"],
    }),
    Order.findOne({
      where: { userId },
      order: [["createdAt", "DESC"]],
      attributes: ["orderNumber", "city"],
    }),
  ]);

  const nombre =
    [user?.name, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.username ||
    "cliente";

  return {
    nombre,
    ultimoPedido: lastOrder?.orderNumber || "",
    ciudad: lastOrder?.city || user?.address || "",
  };
};

// ---------------------------------------------------------------------------
// Envio por lotes
// ---------------------------------------------------------------------------

// Reclama hasta `BATCH_SIZE` destinatarios pendientes con consentimiento
// vigente. Atomico: dos invocaciones concurrentes nunca toman la misma fila
// (FOR UPDATE SKIP LOCKED). Los `claimed` viejos vuelven a `pending`.
const claimBatch = async (campaignId) => {
  const staleBefore = new Date(
    Date.now() - STALE_CLAIMED_MINUTES * 60 * 1000,
  );

  await sequelize.query(
    `UPDATE campaign_recipients
        SET status = 'pending'
      WHERE "campaignId" = :campaignId
        AND status = 'claimed'
        AND "createdAt" < :staleBefore`,
    { replacements: { campaignId, staleBefore } },
  );

  const [claimed] = await sequelize.query(
    `UPDATE campaign_recipients AS cr
        SET status = 'claimed'
      WHERE cr.id IN (
        SELECT r.id
          FROM campaign_recipients r
          JOIN usuarios u ON u.id = r."userId"
         WHERE r."campaignId" = :campaignId
           AND r.status = 'pending'
           AND u."marketingOptIn" = true
           AND u."unsubscribedAt" IS NULL
           AND u."emailBouncedAt" IS NULL
           AND u.email IS NOT NULL
           AND u.role = 'customer'
           AND u.disabled = false
         ORDER BY r.id
         LIMIT :batchSize
         FOR UPDATE OF r SKIP LOCKED
      )
      RETURNING cr.id, cr."userId", cr.email`,
    { replacements: { campaignId, batchSize: BATCH_SIZE } },
  );

  return claimed.map((row) => ({
    recipientId: row.id,
    userId: row.userId,
    email: row.email,
  }));
};

// Los pendientes que perdieron el consentimiento (baja, rebote, opt-out)
// pasan a `excluded`: descarte legítimo, sin error ni reintento.
const markExcluded = async (campaignId) => {
  const [, meta] = await sequelize.query(
    `UPDATE campaign_recipients cr
        SET status = 'excluded'
      FROM usuarios u
      WHERE cr."userId" = u.id
        AND cr."campaignId" = :campaignId
        AND cr.status = 'pending'
        AND (u."marketingOptIn" IS DISTINCT FROM true
             OR u."unsubscribedAt" IS NOT NULL
             OR u."emailBouncedAt" IS NOT NULL)`,
    { replacements: { campaignId } },
  );

  return Number(meta?.rowCount ?? meta ?? 0) || 0;
};

// Remitente: el admin de la sesion si tiene token; si no, el primero que lo
// tenga (así el cron funciona aunque la sesion haya cerrado).
const resolveRefreshToken = async ({ adminId }) => {
  const tokenOwner = await Usuarios.findOne({
    where: adminId
      ? { id: adminId, gmailRefreshToken: { [Op.ne]: null } }
      : { gmailRefreshToken: { [Op.ne]: null }, disabled: false },
    attributes: ["id"],
    order: [["createdAt", "ASC"]],
  });

  if (!tokenOwner) return null;
  return gmail.getRefreshToken(tokenOwner.id);
};

// Siguiente campana con pendientes (mas antigua primero). El cron y el
// reintento manual comparten esta seleccion.
const nextCampaignWithPending = async () => {
  const rows = await sequelize.query(
    `SELECT c.id, c.subject, c.body
       FROM campaigns c
      WHERE c.status = 'sending'
        AND EXISTS (SELECT 1 FROM campaign_recipients r
                     WHERE r."campaignId" = c.id AND r.status = 'pending')
      ORDER BY c."createdAt" ASC
      LIMIT 1`,
    { type: sequelize.QueryTypes.SELECT },
  );

  return rows[0] || null;
};

// Envía UN lote de la campana indicada. Reintentable sin duplicar.
const sendBatchForCampaign = async ({ campaign, refreshToken }) => {
  const excludedByConsent = await markExcluded(campaign.id);

  const dailyLimitReached = (await sentTodayCount()) >= CAMPAIGN_DAILY_LIMIT;
  const batch = dailyLimitReached ? [] : await claimBatch(campaign.id);

  const errors = [];
  let sent = 0;
  let failed = 0;

  for (const recipient of batch) {
    try {
      const values = await variablesFor(recipient.userId);
      const rendered = renderTemplate(campaign.body, values);

      await gmail.sendEmail({
        to: recipient.email,
        subject: campaign.subject,
        body: rendered.text,
        html: buildHtmlDocument({
          textHtml: rendered.html,
          unsubscribeUrl: buildUnsubscribeUrl(recipient.userId),
        }),
        refreshToken,
      });

      await CampaignRecipient.update(
        { status: "sent", sentAt: new Date(), error: null },
        { where: { id: recipient.recipientId } },
      );
      sent += 1;
    } catch (error) {
      const message = String(error.message || "Error de envío").slice(0, 300);
      await CampaignRecipient.update(
        { status: "failed", error: message },
        { where: { id: recipient.recipientId } },
      );
      failed += 1;
      errors.push({
        userId: recipient.userId,
        email: recipient.email,
        error: message,
      });
      log.error("Envío fallido a un destinatario", {
        campaignId: campaign.id,
        error: message,
      });
    }
  }

  const remaining = await CampaignRecipient.count({
    where: { campaignId: campaign.id, status: "pending" },
  });
  const done = remaining === 0;

  if (done) {
    await Campaign.update(
      { status: "sent", sentAt: new Date() },
      { where: { id: campaign.id, status: "sending" } },
    );
  }

  await Campaign.update(
    {
      sentCount: sequelize.literal(`"sentCount" + ${sent}`),
      failedCount: sequelize.literal(`"failedCount" + ${failed}`),
      lastBatchResult: {
        sent,
        failed,
        excludedByConsent,
        dailyLimitReached,
        at: new Date().toISOString(),
      },
    },
    { where: { id: campaign.id } },
  );

  return { sent, failed, remaining, errors, dailyLimitReached, done };
};

// Envía UN lote de la campana indicada (o de la mas antigua con pendientes).
// Reintentable sin duplicar.
const runBatch = async ({ adminId, campaignId } = {}) => {
  const refreshToken = await resolveRefreshToken({ adminId });
  if (!refreshToken) throw NOT_CONNECTED();

  let campaign = null;
  if (campaignId) {
    campaign = await Campaign.findByPk(campaignId, {
      attributes: ["id", "subject", "body", "status"],
    });
    if (!campaign) {
      throw new CampaignError(404, "CAMPAIGN_NOT_FOUND", "Campana no encontrada");
    }
    if (campaign.status !== "sending") {
      throw new CampaignError(
        422,
        "CAMPAIGN_NOT_SENDABLE",
        "La campana no tiene envíos pendientes",
      );
    }
  } else {
    campaign = await nextCampaignWithPending();
  }

  if (!campaign) {
    return { sent: 0, failed: 0, remaining: 0, errors: [], done: true };
  }

  return sendBatchForCampaign({ campaign, refreshToken });
};

// ---------------------------------------------------------------------------
// WhatsApp (ADM-8)
//
// Difusion SOLO con plantilla aprobada por Meta: el texto renderizado viaja
// como unico parametro de cuerpo {{1}}. Sin credenciales, todo lo de abajo
// responde 503 WHATSAPP_NOT_CONFIGURED y el panel ofrece modo manual.
// ---------------------------------------------------------------------------

const WHATSAPP_NOT_CONFIGURED = () =>
  new CampaignError(
    503,
    "WHATSAPP_NOT_CONFIGURED",
    "WhatsApp no está configurado (Cloud API + plantilla marketing)",
  );

const whatsappStatus = async () => {
  const configured = whatsapp.isConfigured();
  return {
    configured,
    apiVersion: process.env.WHATSAPP_API_VERSION || "v21.0",
    templateMarketing: WHATSAPP_TEMPLATE_MARKETING || null,
    templateLang: WHATSAPP_TEMPLATE_LANG || "es",
    dailyLimit: CAMPAIGN_DAILY_LIMIT,
    sentToday: await sentTodayCount(),
  };
};

// Campana de WhatsApp: mismos segmentos; destinatarios con telefono valido
// (los invalidos quedan reportados en `invalidCount` y jamas entran).
const createWhatsappCampaign = async ({ adminId, body, segment }) => {
  const cleanBody = String(body || "").trim();
  if (!cleanBody) {
    throw new CampaignError(400, "CAMPAIGN_BODY_INVALID", "El cuerpo del mensaje es obligatorio");
  }
  if (cleanBody.length > 1024) {
    throw new CampaignError(
      400,
      "CAMPAIGN_BODY_INVALID",
      "El mensaje no puede superar 1024 caracteres",
    );
  }
  if (!isValidSegment(segment)) {
    throw new CampaignError(400, "CAMPAIGN_SEGMENT_INVALID", "Segmento de audiencia inválido");
  }

  const { eligible, invalidPhoneIds } = await whatsappAudience(segment);
  if (eligible.length === 0) {
    throw new CampaignError(
      422,
      "CAMPAIGN_EMPTY_AUDIENCE",
      "La audiencia no tiene teléfonos válidos con consentimiento",
    );
  }

  return sequelize.transaction(async (transaction) => {
    const campaign = await Campaign.create(
      {
        // El subject de WhatsApp es el propio texto de la plantilla: se
        // guarda en body y subject queda como etiqueta corta.
        subject: "WhatsApp",
        body: cleanBody,
        segment,
        channel: "whatsapp",
        status: "sending",
        totalRecipients: eligible.length,
        lastBatchResult: { invalidPhoneIds: invalidPhoneIds.length },
        createdBy: adminId,
      },
      { transaction },
    );

    await CampaignRecipient.bulkCreate(
      eligible.map((row) => ({
        campaignId: campaign.id,
        userId: row.id,
        email: "", // fila de WhatsApp: el correo no aplica
        phone: row.phone,
        status: "pending",
      })),
      { transaction, ignoreDuplicates: true },
    );

    return campaign;
  });
};

// Pendientes con consentimiento vigente por WhatsApp: opt-in explicito, sin
// baja de WhatsApp, telefono real y filtro de segmento en SQL.
const nextWhatsappCampaignWithPending = async () => {
  const rows = await sequelize.query(
    `SELECT c.id, c.body
       FROM campaigns c
      WHERE c.status = 'sending'
        AND c.channel = 'whatsapp'
        AND EXISTS (SELECT 1 FROM campaign_recipients r
                      WHERE r."campaignId" = c.id AND r.status = 'pending')
      ORDER BY c."createdAt" ASC
      LIMIT 1`,
    { type: sequelize.QueryTypes.SELECT },
  );
  return rows[0] || null;
};

const claimWhatsappBatch = async (campaignId) => {
  const staleBefore = new Date(
    Date.now() - STALE_CLAIMED_MINUTES * 60 * 1000,
  );

  await sequelize.query(
    `UPDATE campaign_recipients
        SET status = 'pending'
      WHERE "campaignId" = :campaignId
        AND status = 'claimed'
        AND "createdAt" < :staleBefore`,
    { replacements: { campaignId, staleBefore } },
  );

  const [claimed] = await sequelize.query(
    `UPDATE campaign_recipients AS cr
        SET status = 'claimed'
      WHERE cr.id IN (
        SELECT r.id
          FROM campaign_recipients r
          JOIN usuarios u ON u.id = r."userId"
         WHERE r."campaignId" = :campaignId
           AND r.status = 'pending'
           AND r.phone IS NOT NULL
           AND u."whatsappOptIn" = true
           AND u."whatsappUnsubscribedAt" IS NULL
           AND u.role = 'customer'
           AND u.disabled = false
           AND (
             (SELECT COUNT(*) FROM orders o WHERE o."userId" = u.id) > 0
           ) = :compradoresOnly
         ORDER BY r.id
         LIMIT :batchSize
         FOR UPDATE OF r SKIP LOCKED
      )
      RETURNING cr.id, cr."userId", cr.phone`,
    { replacements: { campaignId, batchSize: WHATSAPP_BATCH_SIZE, compradoresOnly: false } },
  );

  return claimed.map((row) => ({
    recipientId: row.id,
    userId: row.userId,
    phone: row.phone,
  }));
};

const markWhatsappExcluded = async (campaignId) => {
  const [, meta] = await sequelize.query(
    `UPDATE campaign_recipients cr
        SET status = 'excluded'
      FROM usuarios u
      WHERE cr."userId" = u.id
        AND cr."campaignId" = :campaignId
        AND cr.status = 'pending'
        AND (u."whatsappOptIn" IS DISTINCT FROM true
             OR u."whatsappUnsubscribedAt" IS NOT NULL
             OR cr.phone IS NULL)`,
    { replacements: { campaignId } },
  );
  return Number(meta?.rowCount ?? meta ?? 0) || 0;
};

// Lote de WhatsApp. Reintentable sin duplicar: mismas garantias que email.
const sendWhatsappBatchForCampaign = async ({ campaign }) => {
  if (!whatsapp.isConfigured()) throw WHATSAPP_NOT_CONFIGURED();

  const excludedByConsent = await markWhatsappExcluded(campaign.id);

  const dailyLimitReached = (await sentTodayCount()) >= CAMPAIGN_DAILY_LIMIT;
  const batch = dailyLimitReached ? [] : await claimWhatsappBatch(campaign.id);

  const errors = [];
  let sent = 0;
  let failed = 0;

  for (const recipient of batch) {
    try {
      const values = await variablesFor(recipient.userId);
      const rendered = renderTemplate(campaign.body, values);

      // Un solo parametro de cuerpo {{1}} con el texto renderizado.
      const result = await whatsapp.sendTemplate({
        to: recipient.phone,
        template: WHATSAPP_TEMPLATE_MARKETING,
        language: WHATSAPP_TEMPLATE_LANG,
        variables: [rendered.text],
      });

      if (!result.ok) throw new Error(result.error || "Error de envío");

      await CampaignRecipient.update(
        { status: "sent", sentAt: new Date(), error: null },
        { where: { id: recipient.recipientId } },
      );
      sent += 1;
    } catch (error) {
      const message = String(error.message || "Error de envío").slice(0, 300);
      await CampaignRecipient.update(
        { status: "failed", error: message },
        { where: { id: recipient.recipientId } },
      );
      failed += 1;
      errors.push({
        userId: recipient.userId,
        phone: recipient.phone,
        error: message,
      });
      log.error("Envio de WhatsApp fallido", {
        campaignId: campaign.id,
        error: message,
      });
    }
  }

  const remaining = await CampaignRecipient.count({
    where: { campaignId: campaign.id, status: "pending" },
  });
  const done = remaining === 0;

  if (done) {
    await Campaign.update(
      { status: "sent", sentAt: new Date() },
      { where: { id: campaign.id, status: "sending" } },
    );
  }

  await Campaign.update(
    {
      sentCount: sequelize.literal(`"sentCount" + ${sent}`),
      failedCount: sequelize.literal(`"failedCount" + ${failed}`),
      lastBatchResult: {
        sent,
        failed,
        excludedByConsent,
        dailyLimitReached,
        at: new Date().toISOString(),
      },
    },
    { where: { id: campaign.id } },
  );

  return { sent, failed, remaining, errors, dailyLimitReached, done };
};

// UN lote de WhatsApp de la campana indicada (o de la mas antigua con
// pendientes). Reintentable sin duplicar.
const runWhatsappBatch = async ({ campaignId } = {}) => {
  if (!whatsapp.isConfigured()) throw WHATSAPP_NOT_CONFIGURED();

  let campaign = null;
  if (campaignId) {
    campaign = await Campaign.findByPk(campaignId, {
      attributes: ["id", "body", "status", "channel"],
    });
    if (!campaign || campaign.channel !== "whatsapp") {
      throw new CampaignError(404, "CAMPAIGN_NOT_FOUND", "Campana no encontrada");
    }
  } else {
    campaign = await nextWhatsappCampaignWithPending();
  }

  if (!campaign) {
    return { sent: 0, failed: 0, remaining: 0, errors: [], done: true };
  }
  if (campaign.status !== "sending") {
    throw new CampaignError(
      422,
      "CAMPAIGN_NOT_SENDABLE",
      "La campana no tiene envíos pendientes",
    );
  }

  return sendWhatsappBatchForCampaign({ campaign });
};

// Prueba al telefono del propio admin. Solo si su cuenta tiene uno valido.
const sendWhatsappTest = async ({ adminId, body }) => {
  if (!whatsapp.isConfigured()) throw WHATSAPP_NOT_CONFIGURED();

  const admin = await Usuarios.findByPk(adminId, {
    attributes: ["phone", "name", "lastName", "username"],
  });
  const phone = whatsapp.normalizePhone(admin?.phone);
  if (!phone) {
    throw new CampaignError(
      422,
      "ADMIN_PHONE_MISSING",
      "Tu cuenta de administrador no tiene un teléfono válido",
    );
  }

  const values = await variablesFor(adminId);
  const rendered = renderTemplate(String(body || "").trim(), values);

  const result = await whatsapp.sendTemplate({
    to: phone,
    template: WHATSAPP_TEMPLATE_MARKETING,
    language: WHATSAPP_TEMPLATE_LANG,
    variables: [rendered.text],
  });
  if (!result.ok) {
    throw new CampaignError(502, "WHATSAPP_SEND_FAILED", result.error || "Error de Meta");
  }

  return { sent: true, to: phone };
};

// ---------------------------------------------------------------------------
// Modo manual (sin WhatsApp configurado)
// ---------------------------------------------------------------------------

// Filas para envio manual uno a uno: mensaje renderizado + enlace wa.me.
const whatsappManualList = async ({ campaignId }) => {
  const campaign = await Campaign.findByPk(campaignId, {
    attributes: ["id", "body", "channel"],
  });
  if (!campaign || campaign.channel !== "whatsapp") {
    throw new CampaignError(404, "CAMPAIGN_NOT_FOUND", "Campana no encontrada");
  }

  const rows = await CampaignRecipient.findAll({
    where: { campaignId },
    order: [["createdAt", "ASC"]],
    limit: 500,
    attributes: ["id", "userId", "phone", "status", "error"],
    include: [
      {
        model: Usuarios,
        as: "user",
        attributes: ["name", "lastName"],
        required: false,
      },
    ],
  });

  const list = [];
  for (const row of rows) {
    const values = await variablesFor(row.userId);
    const rendered = renderTemplate(campaign.body, values);
    list.push({
      recipientId: row.id,
      userId: row.userId,
      name: [row.user?.name, row.user?.lastName].filter(Boolean).join(" ").trim(),
      phone: row.phone,
      status: row.status,
      error: row.error,
      message: rendered.text,
      waMeLink: whatsapp.waMeLink(row.phone, rendered.text),
    });
  }

  return { campaignId, rows: list };
};

// Marca un envio manual hecho. Idempotente: repetir no duplica ni falla.
const markWhatsappManualSent = async ({ campaignId, recipientId }) => {
  const recipient = await CampaignRecipient.findOne({
    where: { id: recipientId, campaignId },
  });
  if (!recipient) {
    throw new CampaignError(404, "RECIPIENT_NOT_FOUND", "Destinatario no encontrado");
  }
  if (recipient.status !== "sent") {
    await recipient.update({ status: "sent", sentAt: new Date(), error: null });
  }
  return { ok: true };
};

// CSV para el modo manual: nombre, telefono y mensaje (sin enlaces).
const whatsappManualCsv = async ({ campaignId }) => {
  const { rows } = await whatsappManualList({ campaignId });
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = "nombre,telefono,mensaje,estado";
  const body = rows
    .map(
      (row) =>
        `${escape(row.name)},${escape(row.phone)},${escape(row.message)},${escape(row.status)}`,
    )
    .join("\n");
  return `${header}\n${body}`;
};

// ---------------------------------------------------------------------------
// Baja publica (token firmado por usuario)
// ---------------------------------------------------------------------------

// Sin expiracion: la baja debe funcionar siempre.
const unsubscribeTokenFor = (userId) =>
  jwt.sign({ purpose: UNSUB_PURPOSE, userId }, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    subject: String(userId),
  });

const buildUnsubscribeUrl = (userId) =>
  `${(FRONTEND_URL || "").replace(/\/+$/, "") || "https://upbuy.co"}/baja?token=${encodeURIComponent(
    unsubscribeTokenFor(userId),
  )}`;

const verifyUnsubscribeToken = (token) => {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (payload.purpose !== UNSUB_PURPOSE || !payload.userId) return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
};

// Aplica la desuscripcion. Idempotente: darse de baja dos veces no falla.
const unsubscribeByToken = async (token) => {
  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    throw new CampaignError(
      400,
      "UNSUBSCRIBE_TOKEN_INVALID",
      "Enlace de baja inválido o alterado",
    );
  }

  const user = await Usuarios.findByPk(payload.userId, {
    attributes: ["id", "email", "unsubscribedAt"],
  });
  if (!user) {
    throw new CampaignError(404, "UNSUBSCRIBE_USER_NOT_FOUND", "No encontramos esta cuenta");
  }

  if (!user.unsubscribedAt) {
    await user.update({ unsubscribedAt: new Date(), marketingOptIn: false });
  }

  return { email: user.email };
};

// ---------------------------------------------------------------------------
// Envio de prueba y consultas
// ---------------------------------------------------------------------------

// Prueba al correo del propio admin. No consume la campana ni el techo diario
// (es un correo, no un lote), pero SI exige Gmail conectado.
const sendTestEmail = async ({ adminId, subject, body }) => {
  if (!gmail.isGmailConfigured()) throw NOT_CONFIGURED();

  const refreshToken = await gmail.getRefreshToken(adminId);
  if (!refreshToken) {
    throw new CampaignError(
      503,
      "GMAIL_NOT_CONNECTED",
      "Conecta Gmail antes de enviar la prueba",
    );
  }

  const admin = await Usuarios.findByPk(adminId, {
    attributes: ["email"],
  });
  if (!admin?.email) {
    throw new CampaignError(422, "ADMIN_EMAIL_MISSING", "Tu cuenta no tiene correo");
  }

  const values = await variablesFor(adminId);
  const rendered = renderTemplate(body, values);

  await gmail.sendEmail({
    to: admin.email,
    subject: `[Prueba] ${String(subject || "").trim() || "Campana UPBUY"}`,
    body: rendered.text,
    html: buildHtmlDocument({ textHtml: rendered.html }),
    refreshToken,
  });

  return { sent: true, to: admin.email };
};

const listCampaigns = async ({ limit = 50, offset = 0 } = {}) => {
  const { rows, count } = await Campaign.findAndCountAll({
    order: [["createdAt", "DESC"]],
    limit: Math.min(Number(limit) || 50, 200),
    offset: Number(offset) || 0,
    attributes: [
      "id",
      "subject",
      "segment",
      "channel",
      "status",
      "totalRecipients",
      "sentCount",
      "failedCount",
      "createdAt",
      "sentAt",
      "lastBatchResult",
    ],
  });

  return {
    campaigns: rows,
    total: count,
    limit: Math.min(Number(limit) || 50, 200),
    offset: Number(offset) || 0,
  };
};

const campaignDetail = async (id) => {
  const campaign = await Campaign.findByPk(id, {
    attributes: { exclude: ["body"] },
  });
  if (!campaign) return null;

  const recipients = await CampaignRecipient.findAll({
    where: { campaignId: id },
    order: [["status", "ASC"], ["createdAt", "ASC"]],
    limit: 500,
    attributes: ["id", "userId", "email", "status", "error", "sentAt", "createdAt"],
    include: [
      {
        model: Usuarios,
        as: "user",
        attributes: ["name", "lastName"],
        required: false,
      },
    ],
  });

  return { campaign, recipients };
};

const pendingRemaining = async () =>
  CampaignRecipient.count({ where: { status: "pending" } });

module.exports = {
  BATCH_SIZE,
  CAMPAIGN_DAILY_LIMIT,
  CampaignError,
  SEGMENTS,
  SEGMENT_LABELS,
  campaignDetail,
  claimBatch,
  createCampaign,
  listCampaigns,
  nextCampaignWithPending,
  oauthCallback,
  oauthStart,
  pendingRemaining,
  previewAudience,
  previewWhatsappAudience,
  runBatch,
  runWhatsappBatch,
  sendBatchForCampaign,
  sendTestEmail,
  sendWhatsappBatchForCampaign,
  sendWhatsappTest,
  sentTodayCount,
  unsubscribeByToken,
  unsubscribeTokenFor,
  buildUnsubscribeUrl,
  variablesFor,
  whatsappAudience,
  whatsappManualCsv,
  whatsappManualList,
  whatsappStatus,
  markWhatsappManualSent,
  createWhatsappCampaign,
  claimWhatsappBatch,
  markWhatsappExcluded,
  WHATSAPP_BATCH_SIZE,
  PURPOSE,
};
