const express = require("express");
const {
  requireAuth,
  requireAdminSession,
  requirePermission,
} = require("../Middleware/auth.js");
const {
  listAdmin,
  create,
  update,
  remove,
} = require("../Controllers/categories.controller.js");

const router = express.Router();

router.use(requireAuth, requireAdminSession);

const canWriteCatalog = requirePermission("catalog.write");

router.get("/", listAdmin);
router.post("/", canWriteCatalog, create);
router.put("/:id", canWriteCatalog, update);
router.delete("/:id", canWriteCatalog, remove);

module.exports = router;