const express = require("express");
const { listPublic } = require("../Controllers/categories.controller.js");

const router = express.Router();

// Categorias publicas (solo activas).
router.get("/", listPublic);

module.exports = router;