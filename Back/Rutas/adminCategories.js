const express = require("express");
const { requireAuth, requireAdmin } = require("../Middleware/auth.js");
const {
  listAdmin,
  create,
  update,
  remove,
} = require("../Controllers/categories.controller.js");

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get("/", listAdmin);
router.post("/", create);
router.put("/:id", update);
router.delete("/:id", remove);

module.exports = router;