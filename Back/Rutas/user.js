const express = require("express");
const { userById, updateUser } = require("../Controllers/user.js");
const { requireAuth } = require("../Middleware/auth.js");

const router = express.Router();

// Perfil del usuario autenticado. La sesion se valida con requireAuth
// (req.user), igual que el resto de rutas protegidas.
router.get("/edit", requireAuth, userById);
router.put("/edit", requireAuth, updateUser);

module.exports = router;
