const express = require("express");
const {
  requireAuth,
  requireAdminSession,
  requirePermission,
} = require("../Middleware/auth.js");
const { requireStepUp } = require("../Middlewares/requireStepUp.js");
const {
  PRODUCT_STATUS,
  PRODUCT_BULK_ACTION,
} = require("../DataBase/models/enums.js");
const {
  listAdmin,
  listUnpublished,
  detailAdmin,
  create,
  update,
  visibility,
  bulk,
  setImages,
  restoreImages,
  restoreSync,
  listSuppliers,
} = require("../Controllers/catalog.controller.js");
const {
  homeSections,
  replaceHomeSection,
} = require("../Controllers/home.controller.js");

const router = express.Router();

router.use(requireAuth, requireAdminSession);

router.get("/", listAdmin);

// Alta manual: articulos creados desde el panel, con proveedor asignable.
router.post("/", requirePermission("catalog.write"), create);

// Las rutas fijas van antes de las que llevan parametro.
router.get(
  "/unpublished",
  requirePermission("providers.manage"),
  listUnpublished,
);

// Proveedores activos para el alta manual (catalog.write, no providers.manage).
router.get(
  "/suppliers",
  requirePermission("catalog.write"),
  listSuppliers,
);

// Buscador de articulos originales de los proveedores para el alta asistida.
router.get(
  "/supplier-products",
  requirePermission("catalog.write"),
  listUnpublished,
);

// Curaduria de la Home. Rutas fijas antes de las que llevan parametro.
router.get("/home-sections", requirePermission("catalog.write"), homeSections);
router.put(
  "/home-sections/:section",
  requirePermission("catalog.write"),
  replaceHomeSection,
);

router.post(
  "/bulk",
  requirePermission("catalog.write"),
  requireStepUp("catalog.unpublish", {
    when: (req) =>
      [PRODUCT_BULK_ACTION.HIDE, PRODUCT_BULK_ACTION.ARCHIVE].includes(
        String(req.body?.action || ""),
      ),
  }),
  bulk,
);

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

router.post(
  "/:id/visibility",
  requirePermission("catalog.write"),
  requireStepUp("catalog.unpublish", {
    when: (req) => req.body?.visible === false,
  }),
  visibility,
);

router.post(
  "/:id/restore-sync",
  requirePermission("catalog.write"),
  restoreSync,
);

router.put("/:id/images", requirePermission("catalog.write"), setImages);
router.post(
  "/:id/images/restore",
  requirePermission("catalog.write"),
  restoreImages,
);

module.exports = router;