// Webhooks publicos de pago.
//
// Ruta canonica: POST /api/webhooks/:provider
//   - wompi   -> Services/wompi.js
//   - vendelo -> Services/vendeloWebhook.js
//
// No llevan sesion: la autenticidad la da la firma del evento. Por eso el
// rate limit es mas permisivo que en el resto de la API, pero sigue existiendo
// (un webhook legitimo reintenta, no martilla).

const { handleWebhook } = require("../Services/wompi.js");
const { handleVendeloWebhook } = require("../Services/vendeloWebhook.js");
const {
  handleVenndeloWebhook,
} = require("../Services/venndeloChatbotWebhook.js");
const { sendError } = require("../Utils/respond.js");
const HttpError = require("../Utils/HttpError.js");

// POST /api/webhooks/wompi
const wompi = async (req, res) => {
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

// POST /api/webhooks/vendelo
const vendelo = async (req, res) => {
  try {
    const result = await handleVendeloWebhook({
      body: req.body,
      headers: req.headers,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudo procesar el evento de Vendelo");
  }
};

// POST /api/webhooks/venndelo — eventos de pedidos/envios (chatbot).
const venndelo = async (req, res) => {
  try {
    const result = await handleVenndeloWebhook({
      body: req.body,
      headers: req.headers,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudo procesar el evento de Venndelo");
  }
};

// POST /api/webhooks/:provider — despacha al handler correcto.
const dispatch = async (req, res) => {
  const provider = String(req.params.provider || "").toLowerCase();
  if (provider === "wompi") return wompi(req, res);
  if (provider === "vendelo") return vendelo(req, res);
  if (provider === "venndelo") return venndelo(req, res);
  return sendError(
    res,
    new HttpError(404, `Webhook de proveedor desconocido: "${provider}"`),
    "Webhook desconocido",
  );
};

module.exports = { wompi, vendelo, venndelo, dispatch };
