const express = require("express");
const { rates, quote } = require("../Controllers/shipping.js");

const router = express.Router();

// Publico: el checkout necesita calcular el envio antes de iniciar sesion.
router.get("/rates", rates);
router.post("/quote", quote);

module.exports = router;
