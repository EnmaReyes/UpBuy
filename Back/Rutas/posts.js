const express = require("express");
const { requireAdmin } = require("../Middleware/auth.js");
const {
  addArticle,
  deleteArticle,
  getArticleByID,
  getArticleByTitle,
  getArticle,
  updateArticle,
} = require("../Controllers/posts.js");

const router = express.Router();

// Catalogo publico
router.get("/", getArticle);
router.get("/search", getArticleByTitle);
router.get("/:id", getArticleByID);

// Mutaciones: solo administradores
router.post("/add", requireAdmin, addArticle);
router.delete("/:id", requireAdmin, deleteArticle);
router.put("/:id", requireAdmin, updateArticle);

module.exports = router;
