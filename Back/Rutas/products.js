const express = require("express");
const { list, detail } = require("../Controllers/catalog.controller.js");

const router = express.Router();

// Catalogo publico (sin sesion). Solo productos publicados y activos.
router.get("/", list);
router.get("/:slug", detail);

module.exports = router;