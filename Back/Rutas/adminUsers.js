const express = require("express");
const { requireAuth, requireAdmin } = require("../Middleware/auth.js");
const { list } = require("../Controllers/adminUsers.js");

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get("/", list);

module.exports = router;
