const { listShippingRates, quoteShipping } = require("../Services/shipping.js");
const { sendError } = require("../Utils/respond.js");

// GET /api/shipping/rates — catalogo publico de tarifas
const rates = async (req, res) => {
  try {
    const list = await listShippingRates();
    return res.status(200).json(list);
  } catch (error) {
    return sendError(res, error, "No se pudieron cargar las tarifas de envío");
  }
};

// POST /api/shipping/quote — costo de envio para una direccion
// Body: { department, city, lat?, lng? }
const quote = async (req, res) => {
  try {
    const { department, city, lat, lng } = req.body || {};
    const result = await quoteShipping({ department, city, lat, lng });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "No se pudo calcular el envío");
  }
};

module.exports = { rates, quote };
