const express = require("express");
const { list } = require("../Controllers/products.js");

const router = express.Router();

// Publico: el catalogo se puede ver sin sesion.
router.get("/", list);

module.exports = router;
