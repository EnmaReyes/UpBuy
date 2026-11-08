const { handleWebhook } = require("../Services/wompi.js");
const { sendError } = require("../Utils/respond.js");

// POST /api/payments/webhook — lo llama Wompi, no el navegador.
//
// No lleva cookie ni sesion: la autenticidad viene de la firma del evento
// (X-Event-Checksum / signature.checksum). Siempre responde 200 cuando el
// evento es valido, incluso si no cambia nada, para que Wompi no reintente
// un evento que ya se proceso.
const webhook = async (req, res) => {
  try {
    const result = await handleWebhook(
      req.body,
      req.get("X-Event-Checksum"),
    );
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudo procesar el evento de pago");
  }
};

module.exports = { webhook };
