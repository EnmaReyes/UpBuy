const express = require("express");
const { enviarMensaje } = require("../Controllers/contacto.controller.js");
const { contactoLimiter } = require("../Middlewares/rateLimits.js");

// Formulario de contacto publico: POST /api/contacto
const router = express.Router();

router.post("/", contactoLimiter, enviarMensaje);

module.exports = router;
