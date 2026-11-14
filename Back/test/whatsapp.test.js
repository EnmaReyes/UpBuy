// Pruebas de la difusion por WhatsApp (ADM-8):
//   - normalizePhone (E.164 Colombia);
//   - estado de configuracion;
//   - consentimiento WhatsApp (opt-in, baja, telefonos invalidos excluidos);
//   - idempotencia del reclamo de lotes;
//   - modo manual (lista, marca de enviado, CSV).
//
// Sin base de datos los tests de DB se saltan solos (patron del repo).

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

process.chdir(path.join(__dirname, ".."));

const {
  sequelize,
  Usuarios,
  Campaign,
  CampaignRecipient,
} = require("../DataBase/models/index.js");
const {
  ensureCampaignSchema,
} = require("../DataBase/ensureCampaignSchema.js");
const {
  normalizePhone,
  waMeLink,
} = require("../Services/whatsapp/index.js");
const {
  whatsappAudience,
  previewWhatsappAudience,
  whatsappOptInWhere,
} = require("../Services/consent.js");
const {
  claimWhatsappBatch,
  createWhatsappCampaign,
  markWhatsappManualSent,
  whatsappManualCsv,
  whatsappStatus,
  WHATSAPP_BATCH_SIZE,
} = require("../Services/campaigns/campaignService.js");

// ---------------------------------------------------------------------------
// Puros
// ---------------------------------------------------------------------------

test("normalizePhone acepta celulares colombianos en varios formatos", () => {
  assert.equal(normalizePhone("3001234567"), "+573001234567");
  assert.equal(normalizePhone("+573001234567"), "+573001234567");
  assert.equal(normalizePhone("573001234567"), "+573001234567");
  assert.equal(normalizePhone("(300) 123-4567"), "+573001234567");
});

test("normalizePhone rechaza invalidos", () => {
  // Demasiado corto, fijo, otro pais sin +, vacio.
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(null), null);
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone("6012345678"), null); // fijo colombiano
  assert.equal(normalizePhone("4412345678"), null); // 10 digitos sin 57/3
  assert.equal(normalizePhone("57300123456"), null); // longitud rara
  assert.equal(normalizePhone("+123456"), null); // corto con +
});

test("waMeLink arma enlace sin '+' y con texto", () => {
  const link = waMeLink("3001234567", "Hola Ana");
  assert.equal(link, "https://wa.me/573001234567?text=Hola%20Ana");
  assert.equal(waMeLink("123"), null);
});

test("el where de opt-in de WhatsApp exige consentimiento propio", () => {
  const where = whatsappOptInWhere();
  assert.equal(where.role, "customer");
  assert.equal(where.whatsappOptIn, true);
  assert.equal(where.whatsappUnsubscribedAt, null);
  assert.ok(where.phone);
});

test("whatsappStatus no filtra secretos", async () => {
  const status = await whatsappStatus();
  assert.ok("configured" in status);
  assert.ok("dailyLimit" in status);
  const json = JSON.stringify(status);
  assert.ok(!json.includes("WHATSAPP_ACCESS_TOKEN"));
  assert.ok(!("accessToken" in status));
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

const created = { users: [], campaigns: [] };

const makeUser = async (overrides = {}) => {
  const user = await Usuarios.create({
    username: `wa${Math.floor(Math.random() * 1e9)}`,
    email: `wa-${Math.floor(Math.random() * 1e9)}@test.local`,
    password: "no-importa",
    ...overrides,
  });
  created.users.push(user.id);
  return user;
};

const makeWhatsappUser = async (overrides = {}) =>
  makeUser({
    name: "Ana",
    lastName: "Prueba",
    phone: "+573001234567",
    whatsappOptIn: true,
    whatsappOptInAt: new Date(),
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
    await Usuarios.destroy({ where: { id: created.users } });
    created.users.length = 0;
  }
};

test.afterEach(async () => {
  if (!dbError) await cleanup();
});

test("la audiencia de WhatsApp separa elegibles de telefonos invalidos", async (t) => {
  if (skipIfNoDb(t)) return;

  await makeWhatsappUser(); // valido
  const invalido = await makeWhatsappUser({ phone: "123" }); // invalido
  await makeUser({
    phone: "+573001234569",
    // opt-in de email NO hereda: sin whatsappOptIn queda fuera.
    marketingOptIn: true,
  });

  const { eligible, invalidPhoneIds } = await whatsappAudience("todos");
  assert.ok(eligible.every((row) => /^\+?573\d{9}$/.test(row.phone)));
  assert.ok(eligible.length >= 1);
  assert.ok(invalidPhoneIds.includes(invalido.id));
  // El usuario solo con opt-in de email no participa.
  assert.ok(!eligible.some((row) => row.phone === "+573001234569"));
});

test("previewWhatsappAudience reporta invalidos y muestra acotada", async (t) => {
  if (skipIfNoDb(t)) return;

  await makeWhatsappUser({ phone: "3112223344" });
  const preview = await previewWhatsappAudience("todos");
  assert.equal(preview.channel, "whatsapp");
  assert.ok(typeof preview.count === "number");
  assert.ok(typeof preview.invalidCount === "number");
  assert.ok(preview.sample.length <= 10);
});

test("createWhatsappCampaign crea destinatarios con telefono y email vacio", async (t) => {
  if (skipIfNoDb(t)) return;

  const user = await makeWhatsappUser();
  const sinOptIn = await makeUser({ phone: "+5730011111111" });
  void sinOptIn;

  const campaign = await createWhatsappCampaign({
    adminId: user.id,
    body: "Hola {{nombre}}, nueva coleccion en UPBUY",
    segment: "todos",
  });
  created.campaigns.push(campaign.id);

  assert.equal(campaign.channel, "whatsapp");
  assert.equal(campaign.status, "sending");

  const recipients = await CampaignRecipient.findAll({
    where: { campaignId: campaign.id },
  });
  assert.equal(recipients.length, 1);
  assert.equal(recipients[0].userId, user.id);
  assert.equal(recipients[0].phone, "+573001234567");
  assert.equal(recipients[0].email, "");
});

test("reclamar lotes de WhatsApp es idempotente y respeta el tamano", async (t) => {
  if (skipIfNoDb(t)) return;

  assert.equal(WHATSAPP_BATCH_SIZE, 20);

  const owner = await makeWhatsappUser();
  const campaign = await createWhatsappCampaign({
    adminId: owner.id,
    body: "Promo UPBUY",
    segment: "todos",
  });
  created.campaigns.push(campaign.id);

  const first = await claimWhatsappBatch(campaign.id);
  assert.equal(first.length, 1);
  assert.equal(first[0].phone, "+573001234567");

  // Un segundo reclamo no repite destinatarios.
  const second = await claimWhatsappBatch(campaign.id);
  assert.equal(second.length, 0);
});

test("un whatsappOptIn false no entra al lote aunque el telefono sea valido", async (t) => {
  if (skipIfNoDb(t)) return;

  const owner = await makeWhatsappUser();
  await makeUser({ phone: "+573009998877" }); // sin opt-in de WhatsApp
  const campaign = await createWhatsappCampaign({
    adminId: owner.id,
    body: "Promo",
    segment: "todos",
  });
  created.campaigns.push(campaign.id);

  const batch = await claimWhatsappBatch(campaign.id);
  assert.ok(!batch.some((row) => row.phone === "+573009998877"));
});

test("marcar enviado manual es idempotente", async (t) => {
  if (skipIfNoDb(t)) return;

  const owner = await makeWhatsappUser();
  const campaign = await createWhatsappCampaign({
    adminId: owner.id,
    body: "Promo",
    segment: "todos",
  });
  created.campaigns.push(campaign.id);
  const recipients = await CampaignRecipient.findAll({
    where: { campaignId: campaign.id },
  });
  assert.equal(recipients.length, 1);

  await markWhatsappManualSent({
    campaignId: campaign.id,
    recipientId: recipients[0].id,
  });
  // Segunda vez: no falla y no cambia el estado.
  await markWhatsappManualSent({
    campaignId: campaign.id,
    recipientId: recipients[0].id,
  });
  const after = await CampaignRecipient.findByPk(recipients[0].id);
  assert.equal(after.status, "sent");
  assert.ok(after.sentAt);
});

test("el CSV manual incluye encabezado y mensaje por destinatario", async (t) => {
  if (skipIfNoDb(t)) return;

  const owner = await makeWhatsappUser();
  const campaign = await createWhatsappCampaign({
    adminId: owner.id,
    body: "Hola {{nombre}}, oferta UPBUY",
    segment: "todos",
  });
  created.campaigns.push(campaign.id);

  const csv = await whatsappManualCsv({ campaignId: campaign.id });
  assert.ok(csv.startsWith("nombre,telefono,mensaje,estado"));
  assert.ok(csv.includes("Ana Prueba"));
  assert.ok(csv.includes("+573001234567"));
  assert.ok(csv.includes("Hola Ana Prueba, oferta UPBUY"));
});
