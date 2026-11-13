const express = require("express");
const {
  requireAuth,
  requireAdminSession,
  requirePermission,
} = require("../Middleware/auth.js");
const { list } = require("../Controllers/adminUsers.js");

const router = express.Router();
router.use(requireAuth, requireAdminSession);

router.get("/", requirePermission("users.read"), list);

module.exports = router;
