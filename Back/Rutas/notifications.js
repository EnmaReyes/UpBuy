const express = require("express");
const { requireAuth } = require("../Middleware/auth.js");
const {
  list,
  unreadCount,
  readOne,
  readAll,
  removeOne,
  removeAll,
} = require("../Controllers/notifications.js");

const router = express.Router();

// Todas las notificaciones son personales: requieren sesion.
router.use(requireAuth);

// /unread-count antes de /:id para no capturarlo.
router.get("/unread-count", unreadCount);
router.patch("/read-all", readAll);
router.delete("/", removeAll);

router.get("/", list);
router.patch("/:id/read", readOne);
router.delete("/:id", removeOne);

module.exports = router;
