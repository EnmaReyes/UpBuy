const express = require("express");
const {
  requireAuth,
  requireAdminSession,
  requirePermission,
} = require("../Middleware/auth.js");
const { requireStepUp } = require("../Middlewares/requireStepUp.js");
const { PRODUCT_STATUS } = require("../DataBase/models/enums.js");
const {
  listAdmin,
  detailAdmin,
  update,
} = require("../Controllers/catalog.controller.js");

const router = express.Router();

router.use(requireAuth, requireAdminSession);

router.get("/", listAdmin);
router.get("/:id", detailAdmin);
const isUnpublish = (req) => {
  const body = req.body || {};
  if (body.active !== undefined && body.active === false) return true;
  return (
    body.status !== undefined &&
    String(body.status) !== PRODUCT_STATUS.ACTIVE
  );
};

router.patch(
  "/:id",
  requirePermission("catalog.write"),
  requireStepUp("catalog.unpublish", { when: isUnpublish }),
  update,
);

module.exports = router;