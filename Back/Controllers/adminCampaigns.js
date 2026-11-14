// Controlador HTTP de campanas (ADM-7). Capa delgada: valida lo minimo,
// delega en Services/campaigns/campaignService.js y responde. La logica de
// negocio (consentimiento, lotes, cifrado del token) vive en el servicio.

const {
  CampaignError,
  campaignDetail,
  createCampaign,
  createWhatsappCampaign,
  gmailStatus,
  listCampaigns,
  markWhatsappManualSent,
  oauthCallback,
  oauthStart,
  previewAudience,
  previewWhatsappAudience,
  runBatch,
  runWhatsappBatch,
  sendTestEmail,
  sendWhatsappTest,
  whatsappManualCsv,
  whatsappManualList,
  whatsappStatus,
} = require("../Services/campaigns/campaignService.js");
const { sendError } = require("../Utils/respond.js");

// Error del servicio (status + code) -> respuesta limpia sin stack.
const respondError = (
  res,
  error,
  fallback = "No se pudo procesar la campana",
) => {
  if (error instanceof CampaignError) {
    return res
      .status(error.status)
      .json({ message: error.message, code: error.code });
  }
  return sendError(res, error, fallback);
};

// GET /api/admin/campaigns/status
const status = async (req, res) => {
  try {
    const data = await gmailStatus({ adminId: req.user.id });
    return res.json(data);
  } catch (error) {
    return respondError(res, error, "No se pudo consultar el estado de Gmail");
  }
};

// GET /api/admin/campaigns/oauth/start
const startOauth = async (req, res) => {
  try {
    const { url, state } = oauthStart({ adminId: req.user.id });

    // El state viaja tambien en cookie httpOnly (misma clase que la URL de
    // retorno): el callback exige igualdad. 15 min es mas que el TTL del JWT.
    res.cookie("upbuy.gmail_oauth", state, {
      httpOnly: true,
      sameSite: "lax", // debe sobrevivir la navegacion de vuelta desde Google
      secure: req.secure || process.env.NODE_ENV === "production",
      maxAge: 15 * 60 * 1000,
      path: "/api/admin/campaigns/oauth",
    });

    return res.json({ url });
  } catch (error) {
    return respondError(
      res,
      error,
      "No se pudo iniciar la autorización de Gmail",
    );
  }
};

// GET /api/admin/campaigns/oauth/callback?code=&state=
const oauthRedirectHandler = async (req, res) => {
  const html = (title, body) =>
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title>` +
    `<body style="font-family:Arial,Helvetica,sans-serif;background:#F5E9D7;padding:40px">` +
    `<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">` +
    `<p style="letter-spacing:2px;font-weight:bold;color:#0B0B0B;margin:0 0 12px">UPBUY</p>` +
    `${body}</div></body></html>`;

  try {
    if (!req.user) {
      return res
        .status(401)
        .send(
          html(
            "Autorización",
            "<p>Inicia sesión en el panel e intenta conectar Gmail de nuevo.</p>",
          ),
        );
    }

    await oauthCallback({
      code: req.query.code,
      state: req.query.state,
      stateCookie: req.cookies?.["upbuy.gmail_oauth"],
      adminId: req.user.id,
    });

    return res.send(
      html(
        "Gmail conectado",
        "<p>Gmail quedó conectado. Puedes cerrar esta ventana y volver al panel.</p>",
      ),
    );
  } catch (error) {
    return res
      .status(400)
      .send(
        html(
          "No se pudo conectar Gmail",
          `<p>${(error.message || "Error al autorizar Gmail").replace(/[<>&]/g, "")}</p>`,
        ),
      );
  }
};

// POST /api/admin/campaigns/audience
const audience = async (req, res) => {
  try {
    return res.json(await previewAudience(req.body?.segment));
  } catch (error) {
    return respondError(res, error, "No se pudo calcular la audiencia");
  }
};

// POST /api/admin/campaigns/:id/send  (lote de 25, reintentable)
const send = async (req, res) => {
  try {
    const result = await runBatch({
      adminId: req.user.id,
      campaignId: req.params.id,
    });
    // El techo diario no es error: se informa para que el cron siga luego.
    return res.json(result);
  } catch (error) {
    return respondError(res, error, "No se pudo enviar el lote");
  }
};

// POST /api/admin/campaigns/test-send
const testSend = async (req, res) => {
  try {
    return res.json(
      await sendTestEmail({
        adminId: req.user.id,
        subject: req.body?.subject,
        body: req.body?.body,
      }),
    );
  } catch (error) {
    return respondError(res, error, "No se pudo enviar la prueba");
  }
};

// GET /api/admin/campaigns
const list = async (req, res) => {
  try {
    return res.json(
      await listCampaigns({
        limit: req.query.limit,
        offset: req.query.offset,
      }),
    );
  } catch (error) {
    return respondError(res, error, "No se pudo listar las campañas");
  }
};

// GET /api/admin/campaigns/:id
const detail = async (req, res) => {
  try {
    const data = await campaignDetail(req.params.id);
    if (!data) {
      return res.status(404).json({ message: "Campana no encontrada" });
    }
    return res.json(data);
  } catch (error) {
    return respondError(res, error, "No se pudo consultar la campaña");
  }
};

// GET /api/admin/whatsapp/status  (montado en Rutas/adminWhatsapp.js)
const whatsappStatusHandler = async (req, res) => {
  try {
    return res.json(await whatsappStatus());
  } catch (error) {
    return respondError(
      res,
      error,
      "No se pudo consultar el estado de WhatsApp",
    );
  }
};

// POST /api/admin/campaigns/whatsapp/audience
const whatsappAudienceHandler = async (req, res) => {
  try {
    return res.json(await previewWhatsappAudience(req.body?.segment));
  } catch (error) {
    return respondError(
      res,
      error,
      "No se pudo calcular la audiencia de WhatsApp",
    );
  }
};

// POST /api/admin/whatsapp/test  (prueba solo al telefono del admin)
const whatsappTest = async (req, res) => {
  try {
    return res.json(
      await sendWhatsappTest({
        adminId: req.user.id,
        body: req.body?.body,
      }),
    );
  } catch (error) {
    return respondError(res, error, "No se pudo enviar la prueba de WhatsApp");
  }
};

// POST /api/admin/campaigns  (channel = email | whatsapp)
const create = async (req, res) => {
  try {
    const channel = req.body?.channel === "whatsapp" ? "whatsapp" : "email";
    const campaign =
      channel === "whatsapp"
        ? await createWhatsappCampaign({
            adminId: req.user.id,
            body: req.body?.body,
            segment: req.body?.segment,
          })
        : await createCampaign({
            adminId: req.user.id,
            subject: req.body?.subject,
            body: req.body?.body,
            segment: req.body?.segment,
          });

    return res.status(201).json({ campaign });
  } catch (error) {
    return respondError(res, error, "No se pudo crear la campaña");
  }
};

// POST /api/admin/campaigns/:id/send-whatsapp  (lote de 20, reintentable)
const sendWhatsapp = async (req, res) => {
  try {
    const result = await runWhatsappBatch({ campaignId: req.params.id });
    return res.json(result);
  } catch (error) {
    return respondError(res, error, "No se pudo enviar el lote de WhatsApp");
  }
};

// GET /api/admin/campaigns/:id/whatsapp/manual
const whatsappManual = async (req, res) => {
  try {
    return res.json(await whatsappManualList({ campaignId: req.params.id }));
  } catch (error) {
    return respondError(res, error, "No se pudo armar el modo manual");
  }
};

// POST /api/admin/campaigns/:id/whatsapp/manual-sent
const whatsappManualSent = async (req, res) => {
  try {
    return res.json(
      await markWhatsappManualSent({
        campaignId: req.params.id,
        recipientId: req.body?.recipientId,
      }),
    );
  } catch (error) {
    return respondError(res, error, "No se pudo marcar el envio manual");
  }
};

// GET /api/admin/campaigns/:id/whatsapp/export.csv
const whatsappCsv = async (req, res) => {
  try {
    const csv = await whatsappManualCsv({ campaignId: req.params.id });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="campana-whatsapp-${req.params.id}.csv"`,
    );
    return res.send(csv);
  } catch (error) {
    return respondError(res, error, "No se pudo exportar el CSV");
  }
};

module.exports = {
  audience,
  create,
  detail,
  list,
  oauthRedirectHandler,
  send,
  startOauth,
  status,
  testSend,
  whatsappAudienceHandler,
  whatsappCsv,
  whatsappManual,
  whatsappManualSent,
  whatsappStatusHandler,
  whatsappTest,
  sendWhatsapp,
};
