const crypto = require("crypto");
const { Usuarios, Campaign } = require("../DataBase/models/index.js");
const { requireAuth, requireAdmin } = require("../Middleware/auth.js");
const { sendError } = require("../Utils/respond.js");
const gmail = require("../Services/gmail.js");

// Estado OAuth temporal en cookie (CSRF protection).
const STATE_COOKIE = "gmail_oauth_state";

const oauthStart = (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  const production = process.env.NODE_ENV === "production";
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: production,
    sameSite: production ? "none" : "lax",
    maxAge: 10 * 60 * 1000,
  });
  const url = gmail.getAuthUrl(state);
  return res.redirect(url);
};

const oauthCallback = async (req, res) => {
  const { code, state } = req.query;
  const expectedState = req.cookies?.[STATE_COOKIE];

  // Limpia la cookie de state.
  const production = process.env.NODE_ENV === "production";
  res.clearCookie(STATE_COOKIE, {
    httpOnly: true,
    secure: production,
    sameSite: production ? "none" : "lax",
  });

  if (!code) {
    return res.status(400).send("Falta el código de autorización.");
  }

  try {
    await gmail.handleCallback({
      code,
      state,
      expectedState,
      userId: req.user.id,
    });
    // Redirige al panel de campañas.
    const frontend =
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL
        : "http://localhost:5173";
    return res.redirect(`${frontend}/dashboard/admin/usuarios?authorized=1`);
  } catch (error) {
    console.error("Error en callback de Gmail:", error.message);
    return res.status(400).send(`Error de autorización: ${error.message}`);
  }
};

// GET /api/admin/campaigns/status
const status = async (req, res) => {
  try {
    const authorized = await gmail.hasRefreshToken(req.user.id);
    return res.status(200).json({ authorized });
  } catch (error) {
    return sendError(res, error, "No se pudo verificar la autorización");
  }
};

// POST /api/admin/campaigns/send  { subject, body, recipientIds: [] }
const send = async (req, res) => {
  try {
    const { subject, body, recipientIds } = req.body || {};
    if (
      typeof subject !== "string" ||
      !subject.trim() ||
      typeof body !== "string" ||
      !body.trim() ||
      !Array.isArray(recipientIds) ||
      recipientIds.length === 0
    ) {
      return res
        .status(400)
        .json("Faltan datos: asunto, mensaje y destinatarios.");
    }

    const authorized = await gmail.hasRefreshToken(req.user.id);
    if (!authorized) {
      return res
        .status(400)
        .json("Primero autoriza la aplicación con Gmail.");
    }

    const user = await Usuarios.findByPk(req.user.id, {
      attributes: ["gmailRefreshToken"],
    });

    const recipients = await Usuarios.findAll({
      where: { id: recipientIds },
      attributes: ["id", "email"],
    });

    const emails = recipients.map((r) => r.email).filter(Boolean);
    if (emails.length === 0) {
      return res.status(400).json("No hay destinatarios válidos.");
    }

    const results = [];
    for (const to of emails) {
      try {
        await gmail.sendEmail({
          to,
          subject: subject.trim(),
          body: body.trim(),
          refreshToken: user.gmailRefreshToken,
        });
        results.push({ to, ok: true });
      } catch (error) {
        console.error(`Error enviando a ${to}:`, error.message);
        results.push({ to, ok: false, error: error.message });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    await Campaign.create({
      adminId: req.user.id,
      subject: subject.trim(),
      body: body.trim(),
      recipientCount: sent,
    });

    return res.status(200).json({
      total: emails.length,
      sent,
      failed: emails.length - sent,
      results,
    });
  } catch (error) {
    return sendError(res, error, "No se pudo enviar la campaña");
  }
};

// GET /api/admin/campaigns — historial de campañas enviadas
const list = async (req, res) => {
  try {
    const campaigns = await Campaign.findAll({
      where: { adminId: req.user.id },
      order: [["sentAt", "DESC"]],
      limit: 50,
    });
    return res.status(200).json(campaigns);
  } catch (error) {
    return sendError(res, error, "No se pudieron cargar las campañas");
  }
};

module.exports = {
  oauthStart,
  oauthCallback,
  status,
  send,
  list,
};
