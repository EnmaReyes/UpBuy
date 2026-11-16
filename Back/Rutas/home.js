const express = require("express");
const { getHome } = require("../Controllers/home.controller.js");

const router = express.Router();

// Portada publica: las tres secciones curadas + categorias, en una sola
// llamada para que todo el render sea coherente.
router.get("/", getHome);

module.exports = router;
