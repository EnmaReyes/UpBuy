const express = require("express");
const { requireAdmin } = require("../Middleware/auth.js");

const {
  addDtf,
  getDtf,
  updateDtf,
  getDtfByCategory,
} = require("../Controllers/dtf");

const router = express.Router();

router.get("/", getDtf);
router.get("/category", getDtfByCategory);
router.post("/add", requireAdmin, addDtf);
router.put("/:id", requireAdmin, updateDtf);

module.exports = router;
