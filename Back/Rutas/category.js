const express = require("express");
const { requireAdmin } = require("../Middleware/auth.js");
const {
  addCategory,
  updateCategory,
  getCategories,
} = require("../Controllers/category.js");
const router = express.Router();

router.get("/", getCategories);
router.post("/addcategory", requireAdmin, addCategory);
router.put("/updatecategory/:id", requireAdmin, updateCategory);

module.exports = router;
