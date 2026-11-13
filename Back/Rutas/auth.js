const express = require("express");
const {
  register,
  login,
  logout,
  me,
  verifyAdminMfa,
  stepUpAdmin,
  setupAdminMfa,
  enrollAdminMfa,
} = require("../Controllers/auth.js");
const { requireAuth } = require("../Middleware/auth.js");
const { googleLogin, facebookLogin } = require("../Controllers/socialAuth.js");
const {
  authLimiter,
  registerLimiter,
  adminMfaLimiter,
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

// MFA de administradores (ADM-S2). El segundo paso del login y el
// enrolamiento tienen su propio limite: adivinar un TOTP no debe compartir
// cupo con la contrasena.
router.post("/admin/mfa", adminMfaLimiter, verifyAdminMfa);
router.post("/admin/mfa/setup", adminMfaLimiter, setupAdminMfa);
router.post("/admin/mfa/enroll", adminMfaLimiter, enrollAdminMfa);

// Step-up de acciones destructivas (ADM-S3). La sesion ya debe existir: aqui
// solo se refresca `mfaAt` con un codigo reciente.
router.post("/admin/step-up", adminMfaLimiter, requireAuth, stepUpAdmin);

module.exports = router;
