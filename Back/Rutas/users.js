const express = require("express");
const { requireAuth } = require("../Middleware/auth.js");
const {
  getMe,
  updateMe,
  addresses,
  createAddressHandler,
  updateAddressHandler,
  deleteAddressHandler,
  setDefaultHandler,
} = require("../Controllers/users.js");

const router = express.Router();

// Todo el namespace es del usuario autenticado.
router.use(requireAuth);

router.get("/me", getMe);
router.put("/me", updateMe);

router.get("/me/addresses", addresses);
router.post("/me/addresses", createAddressHandler);
router.put("/me/addresses/:id", updateAddressHandler);
router.delete("/me/addresses/:id", deleteAddressHandler);
router.put("/me/addresses/:id/default", setDefaultHandler);

module.exports = router;
