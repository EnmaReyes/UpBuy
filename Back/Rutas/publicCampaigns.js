// Ruta publica de baja de difusion (ADM-7).
//
//   GET /api/public/campaigns/unsubscribe?token=<JWT firmado>
//
// Sin sesion: el token firmado por usuario es la unica credencial. Responde
// una pagina HTML simple de confirmacion (sin datos del pedido ni del
// usuario, solo el correo al que se aplico la baja).
//
// La baja es permanente para lo promocional: marca unsubscribedAt y apaga
// marketingOptIn. El envio de campanas revalida el consentimiento por
// destinatario en cada lote, asi que una baja surte efecto aunque la campana
// ya exista.

const express = require("express");
const {
  unsubscribeByToken,
  CampaignError,
} = require("../Services/campaigns/campaignService.js");
const { createLogger } = require("../Utils/logger.js");

const log = createLogger("campaigns.public");

const router = express.Router();

const page = (title, body) =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1">` +
  `<title>${title} — UPBUY</title></head>` +
  `<body style="font-family:Arial,Helvetica,sans-serif;background:#F5E9D7;padding:40px;margin:0">` +
  `<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">` +
  `<p style="letter-spacing:2px;font-weight:bold;color:#0B0B0B;margin:0 0 12px">UPBUY</p>` +
  `<h1 style="font-size:20px;color:#0B0B0B;margin:0 0 8px">${title}</h1>` +
  `${body}</div></body></html>`;

const unsubscribe = async (req, res) => {
  try {
    const token = String(req.query.token || "");
    const { email } = await unsubscribeByToken(token);

    return res
      .status(200)
      .send(
        page(
          "Baja confirmada",
          `<p style="color:#0B0B0B;margin:0">Se desactivaron las promociones para <strong>${email}</strong>.</p>` +
            `<p style="color:#6B5343;margin:12px 0 0;font-size:14px">Los correos operativos (estado de tus pedidos) no se ven afectados.</p>`,
        ),
      );
  } catch (error) {
    if (error instanceof CampaignError) {
      return res
        .status(error.status)
        .send(
          page(
            "No se pudo procesar la baja",
            `<p style="color:#6B5343;margin:0">${error.message}</p>`,
          ),
        );
    }

    log.error("Error inesperado en la baja", { error: error.message });
    return res
      .status(500)
      .send(
        page(
          "No se pudo procesar la baja",
          `<p style="color:#6B5343;margin:0">Ocurrió un error inesperado. Intenta de nuevo más tarde.</p>`,
        ),
      );
  }
};

router.get("/unsubscribe", unsubscribe);

module.exports = router;
