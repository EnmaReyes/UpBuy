// Pruebas de la difusion por email (ADM-7):
//   - render de plantillas con escapado;
//   - estado OAuth firmado y verificacion;
//   - cifrado del refresh token de Gmail;
//   - consentimiento (opt-in, baja, admins excluidos);
//   - idempotencia del reclamo de lotes;
//   - baja publica con token.
//
// Sin base de datos los tests de DB se saltan solos (patron del repo).

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

process.chdir(path.join(__dirname, ".."));

// Clave fija de cifrado para todo este archivo (config.js la lee al cargar).
process.env.GMAIL_TOKEN_ENCRYPTION_KEY =
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY ||
  Buffer.alloc(32, 9).toString("base64");

const {
  sequelize,
  Usuarios,
  Campaign,
  CampaignRecipient,
  Order,
} = require("../DataBase/models/index.js");
const {
  ensureCampaignSchema,
} = require("../DataBase/ensureCampaignSchema.js");
const { renderTemplate, escapeHtml } = require("../Services/campaigns/render.js");
const {
  createState,
  verifyState,
  PURPOSE,
} = require("../Services/campaigns/oauthState.js");
const {
  encryptGmailToken,
  decryptGmailToken,
} = require("../Services/campaigns/tokenVault.js");
const {
  consentWhere,
  SEGMENTS,
  SEGMENT_LABELS,
} = require("../Services/consent.js");
const {
  claimBatch,
  createCampaign,
  unsubscribeByToken,
  unsubscribeTokenFor,
  CampaignError,
} = require("../Services/campaigns/campaignService.js");

// ---------------------------------------------------------------------------
// Puros
// ---------------------------------------------------------------------------

test("renderTemplate resuelve variables y escapa HTML", () => {
  const { text, html } = renderTemplate("Hola {{nombre}}, pedido {{ultimoPedido}}", {
    nombre: 'Ana <b>"Test"',
    ultimoPedido: "UPBUY-2026-000011",
    ciudad: "Medellín",
  });

  assert.equal(
    text,
    'Hola Ana <b>"Test", pedido UPBUY-2026-000011',
  );
  assert.ok(html.includes("&lt;b&gt;"));
  assert.ok(!html.includes("<b>"));
});

test("renderTemplate deja las marcas desconocidas intactas", () => {
  const { text } = renderTemplate("Hola {{nombreReal}} y {{ciudad}}", {
    ciudad: "Bogotá",
  });
  assert.equal(text, "Hola {{nombreReal}} y Bogotá");
});

test("escapeHtml neutraliza inyeccion", () => {
  const out = escapeHtml("<script>&'\"");
  assert.equal(out, "&lt;script&gt;&amp;&#39;&quot;");
});

test("el estado OAuth es un JWT corto con purpose gmail_oauth", () => {
  const state = createState("11111111-1111-1111-1111-111111111111");
  const payload = verifyState(state);

  assert.ok(payload);
  assert.equal(payload.purpose, PURPOSE);
  assert.equal(payload.adminId, "11111111-1111-1111-1111-111111111111");

  // Otro admin no vale, y un token alterado tampoco.
  assert.equal(verifyState(state, { adminId: "22222222-2222-2222-2222-222222222222" }), null);
  assert.equal(verifyState(`${state}x`), null);
  assert.equal(verifyState(""), null);
});

test("el refresh token de Gmail se cifra y descifra (AES-256-GCM)", () => {
  const secret = "1//0g-refresh-token-de-prueba";
  const encrypted = encryptGmailToken(secret);

  assert.match(encrypted, /^gmail1:/);
  assert.ok(!encrypted.includes(secret));

  const plain = decryptGmailToken(encrypted);
  assert.equal(plain, secret);
});

test("sin clave no se guarda el token en claro", () => {
  // Vaciar el cache para re-require sin clave.
  const configPath = require.resolve("../config.js");
  const vaultPath = require.resolve("../Services/campaigns/tokenVault.js");
  const previousKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  delete require.cache[configPath];
  delete require.cache[vaultPath];

  try {
    const { encryptGmailToken: encryptWithoutKey } = require("../Services/campaigns/tokenVault.js");
    assert.throws(() => encryptWithoutKey("1//0g-token"), /GMAIL_KEY_MISSING|GMAIL_TOKEN/);
  } finally {
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = previousKey;
    delete require.cache[configPath];
    delete require.cache[vaultPath];
  }
});

test("el where de consentimiento excluye admins, bajas y rebotes", () => {
  const where = consentWhere();
  assert.equal(where.role, "customer");
  assert.equal(where.marketingOptIn, true);
  assert.equal(where.unsubscribedAt, null);
  assert.equal(where.emailBouncedAt, null);
  assert.ok(where.email);
});

test("los segmentos existentes tienen etiqueta", () => {
  for (const segment of Object.values(SEGMENTS)) {
    assert.ok(SEGMENT_LABELS[segment]);
  }
});

// ---------------------------------------------------------------------------
// Con base de datos
// ---------------------------------------------------------------------------

let dbError = null;

test.before(async () => {
  try {
    await sequelize.authenticate();
    await ensureCampaignSchema();
  } catch (error) {
    dbError = error;
  }
});

test.after(async () => {
  await sequelize.close().catch(() => {});
});

const skipIfNoDb = (t) => {
  if (dbError) {
    t.skip(`sin base de datos: ${dbError.message}`);
    return true;
  }
  return false;
};

const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const created = { users: [], campaigns: [] };

const makeUser = async (overrides = {}) => {
  const user = await Usuarios.create({
    username: `camp${Math.floor(Math.random() * 1e9)}`,
    email: `camp-${Math.floor(Math.random() * 1e9)}@test.local`,
    password: "no-importa",
    ...overrides,
  });
  created.users.push(user.id);
  return user;
};

const makeOptInUser = async (overrides = {}) =>
  makeUser({
    marketingOptIn: true,
    marketingOptInAt: new Date(),
    name: "Ana",
    lastName: "Prueba",
    ...overrides,
  });

const cleanup = async () => {
  if (created.campaigns.length) {
    await CampaignRecipient.destroy({
      where: { campaignId: created.campaigns },
    });
    await Campaign.destroy({ where: { id: created.campaigns } });
    created.campaigns.length = 0;
  }
  if (created.users.length) {
    await Order.destroy({ where: { userId: created.users } }).catch(() => {});
    await Usuarios.destroy({ where: { id: created.users } });
    created.users.length = 0;
  }
};

test.afterEach(async () => {
  if (!dbError) await cleanup();
});

test("createCampaign solo crea destinatarios con consentimiento vigente", async (t) => {
  if (skipIfNoDb(t)) return;

  const optIn = await makeOptInUser();
  const sinOptIn = await makeUser();
  const dadoDeBaja = await makeOptInUser({
    unsubscribedAt: new Date(),
    marketingOptIn: true,
  });
  const admin = await makeOptInUser({ role: "admin", admin: true });
  const rebotado = await makeOptInUser({ emailBouncedAt: new Date() });

  const adminCreador = await makeUser({ role: "admin", admin: true });
  const campaign = await createCampaign({
    adminId: adminCreador.id,
    subject: `Prueba ${stamp}`,
    body: "Hola {{nombre}}",
    segment: SEGMENTS.todos,
  });
  created.campaigns.push(campaign.id);

  const recipients = await CampaignRecipient.findAll({
    where: { campaignId: campaign.id },
    attributes: ["userId"],
  });
  const recipientIds = recipients.map((r) => r.userId);

  assert.equal(recipientIds.length, 1);
  assert.ok(recipientIds.includes(optIn.id));
  assert.ok(!recipientIds.includes(sinOptIn.id));
  assert.ok(!recipientIds.includes(dadoDeBaja.id));
  assert.ok(!recipientIds.includes(admin.id));
  assert.ok(!recipientIds.includes(rebotado.id));
  assert.equal(campaign.status, "sending");
  assert.equal(campaign.totalRecipients, 1);
});

test("createCampaign rechaza cuerpo vacio y segmento invalido", async (t) => {
  if (skipIfNoDb(t)) return;

  const admin = await makeUser({ role: "admin", admin: true });

  await assert.rejects(
    () => createCampaign({ adminId: admin.id, subject: "x", body: "   " }),
    (error) => error instanceof CampaignError && error.code === "CAMPAIGN_BODY_INVALID",
  );

  await assert.rejects(
    () => createCampaign({ adminId: admin.id, subject: "x", body: "hola", segment: "jaja" }),
    (error) => error instanceof CampaignError && error.code === "CAMPAIGN_SEGMENT_INVALID",
  );
});

test("reclamar lotes es idempotente: dos pasadas no toman la misma fila", async (t) => {
  if (skipIfNoDb(t)) return;

  const creator = await makeUser({ role: "admin", admin: true });
  const target = await makeOptInUser();
  const campaign = await createCampaign({
    adminId: creator.id,
    subject: `Lote ${stamp}`,
    body: "Hola",
    segment: SEGMENTS.todos,
  });
  created.campaigns.push(campaign.id);

  const first = await claimBatch(campaign.id);
  assert.equal(first.length, 1);
  assert.equal(first[0].userId, target.id);

  const second = await claimBatch(campaign.id);
  assert.equal(second.length, 0);

  // La fila queda 'claimed', no 'sent': el envio real la resuelve despues.
  const row = await CampaignRecipient.findOne({
    where: { campaignId: campaign.id },
  });
  assert.equal(row.status, "claimed");
});

test("una fila claimed vieja vuelve a pending (recuperacion de crash)", async (t) => {
  if (skipIfNoDb(t)) return;

  const creator = await makeUser({ role: "admin", admin: true });
  await makeOptInUser();
  const campaign = await createCampaign({
    adminId: creator.id,
    subject: `Crash ${stamp}`,
    body: "Hola",
    segment: SEGMENTS.todos,
  });
  created.campaigns.push(campaign.id);

  const first = await claimBatch(campaign.id);
  assert.equal(first.length, 1);

  // Simula un crash viejo: createdAt en el pasado y status claimed.
  const old = new Date(Date.now() - 60 * 60 * 1000);
  await sequelize.query(
    `UPDATE campaign_recipients SET "createdAt" = :old WHERE "campaignId" = :id`,
    { replacements: { old, id: campaign.id } },
  );

  const second = await claimBatch(campaign.id);
  assert.equal(second.length, 1);
});

test("si el usuario pierde el consentimiento, el reclamo lo excluye", async (t) => {
  if (skipIfNoDb(t)) return;

  const creator = await makeUser({ role: "admin", admin: true });
  const user = await makeOptInUser();
  const campaign = await createCampaign({
    adminId: creator.id,
    subject: `Baja ${stamp}`,
    body: "Hola",
    segment: SEGMENTS.todos,
  });
  created.campaigns.push(campaign.id);

  // El usuario se da de baja DESPUES de crear la campana.
  await user.update({ unsubscribedAt: new Date(), marketingOptIn: false });

  const batch = await claimBatch(campaign.id);
  assert.equal(batch.length, 0);

  const row = await CampaignRecipient.findOne({
    where: { campaignId: campaign.id },
  });
  assert.equal(row.status, "pending");
});

test("la baja con token apaga el opt-in y es idempotente", async (t) => {
  if (skipIfNoDb(t)) return;

  const user = await makeOptInUser();
  const token = unsubscribeTokenFor(user.id);

  const first = await unsubscribeByToken(token);
  assert.equal(first.email, user.email);

  const after = await Usuarios.findByPk(user.id);
  assert.ok(after.unsubscribedAt);
  assert.equal(after.marketingOptIn, false);

  // Segunda vez no falla ni cambia el correo.
  const second = await unsubscribeByToken(token);
  assert.equal(second.email, user.email);
});

test("un token de baja alterado no aplica nada", async (t) => {
  if (skipIfNoDb(t)) return;

  await assert.rejects(
    () => unsubscribeByToken("no-es-un-token"),
    (error) => error instanceof CampaignError && error.code === "UNSUBSCRIBE_TOKEN_INVALID",
  );

  await assert.rejects(
    () => unsubscribeByToken(unsubscribeTokenFor("00000000-0000-0000-0000-000000000000")),
    (error) => error instanceof CampaignError && error.code === "UNSUBSCRIBE_USER_NOT_FOUND",
  );
});
