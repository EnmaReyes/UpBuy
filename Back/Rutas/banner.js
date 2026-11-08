const express = require("express");
const { requireAdmin } = require("../Middleware/auth.js");
const {
  getBanner,
  addBanner,
  EditBanner,
  deleteBanner,
} = require("../Controllers/banner.js");

const router = express.Router();

router.get("/", getBanner);
router.post("/addbanner", requireAdmin, addBanner);
router.put("/:id", requireAdmin, EditBanner);
router.delete("/:id", requireAdmin, deleteBanner);

module.exports = router;
