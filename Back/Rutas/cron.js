const express = require("express");
const crypto = require("crypto");
const { CRON_SECRET, CRON_SCHEDULE } = require("../config.js");
const { runProviderSync } = require("../Services/cron.js");
const { sendError } = require("../Utils/respond.js");
const { createLogger } = require("../Utils/logger.js");

const log = createLogger("cron.route");

const router = express.Router();

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

// GET /api/cron/sync-providers
//
// Lo llama Vercel Cron (o cualquier scheduler externo) con
// `Authorization: Bearer ${CRON_SECRET}`. No usa sesion de usuario: un cron
// no tiene cookie, y el secreto es la unica credencial.
const syncProviders = async (req, res) => {
  try {
    if (!CRON_SECRET) {
      // Sin secreto configurado el endpoint queda cerrado: nunca se acepta
      // una peticion anonima que dispara trabajo contra los proveedores.
      return res.status(401).json({ message: "Cron no configurado" });
    }

    const header = req.get("Authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";

    if (!safeEqual(token, CRON_SECRET)) {
      log.warn("Intento de cron con secreto inválido", { ip: req.ip });
      return res.status(401).json({ message: "No autorizado" });
    }

    const result = await runProviderSync({ limit: req.query.limit });
    return res.status(200).json({ ...result, schedule: CRON_SCHEDULE });
  } catch (error) {
    return sendError(res, error, "No se pudo ejecutar el cron");
  }
};

router.get("/sync-providers", syncProviders);

module.exports = router;
