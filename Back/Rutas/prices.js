const express = require("express");
const { requireAdmin } = require("../Middleware/auth.js");
const {
  getPrices,
  updatePrices,
  normalizePrices,
} = require("../Controllers/prices.js");

const router = express.Router();

// Tarifa publica: la usan el catalogo y el panel de administracion.
router.get("/", getPrices);

// Mutaciones: solo administradores.
router.put("/", requireAdmin, updatePrices);
router.post("/normalize", requireAdmin, normalizePrices);

module.exports = router;
