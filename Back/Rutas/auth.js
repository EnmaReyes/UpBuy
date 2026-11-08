const express = require("express");
const { register, login, logout, me } = require("../Controllers/auth.js");
const { googleLogin, facebookLogin } = require("../Controllers/socialAuth.js");
const {
  authLimiter,
  registerLimiter,
} = require("../Middlewares/rateLimits.js");

const router = express.Router();

// Los limites van por ruta (no en router.use) para que /me y /logout no
// consuman el cupo de intentos de inicio de sesion.
router.post("/register", registerLimiter, register);
router.post("/login", authLimiter, login);
router.post("/logout", logout);
router.get("/me", me);
router.post("/google", authLimiter, googleLogin);
router.post("/facebook", authLimiter, facebookLogin);

module.exports = router;
