const { handleWebhook } = require("../Services/wompi.js");
const { createCheckoutForOrder } = require("../Services/wompi.js");
const { sendError } = require("../Utils/respond.js");
const HttpError = require("../Utils/HttpError.js");

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

// POST /api/payments/intent — crea el intento de pago del pedido y devuelve
// la URL del checkout del proveedor elegido. Hoy solo Wompi esta integrado;
// `provider` existe para que el front no tenga que cambiar cuando se sume
// otro (Vendelo checkout, por ejemplo).
//
// Body: { orderId, provider? }
const intent = async (req, res) => {
  try {
    const { orderId, provider } = req.body || {};
    if (!orderId) {
      throw new HttpError(400, "Falta el pedido");
    }

    const name = String(provider || "wompi").toLowerCase();
    if (name !== "wompi") {
      throw new HttpError(
        503,
        `El pago con "${name}" no está disponible todavía`,
      );
    }

    const result = await createCheckoutForOrder({
      orderId,
      userId: req.user.id,
    });

    return res.status(201).json({ provider: name, ...result });
  } catch (error) {
    return sendError(res, error, "No se pudo iniciar el pago");
  }
};

module.exports = { webhook, intent };
