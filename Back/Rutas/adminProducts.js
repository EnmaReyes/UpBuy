const express = require("express");
const { requireAuth, requireAdmin } = require("../Middleware/auth.js");
const {
  listAdmin,
  detailAdmin,
  update,
} = require("../Controllers/catalog.controller.js");

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get("/", listAdmin);
router.get("/:id", detailAdmin);
router.patch("/:id", update);

module.exports = router;