const express = require("express");
const crypto = require("crypto");
const {
  CRON_SECRET,
  CRON_SCHEDULE,
  CATALOG_SYNC_ENABLED,
  CATALOG_SYNC_SCHEDULE,
} = require("../config.js");
const { runProviderSync } = require("../Services/cron.js");
const venndeloService = require("../Services/suppliers/venndelo.service.js");
const { CATALOG_SYNC_TRIGGER } = require("../DataBase/models/enums.js");
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
// Valida el Bearer del cron. Devuelve true si la peticion puede continuar.
const authorizeCron = (req, res) => {
  if (!CRON_SECRET) {
    // Sin secreto configurado el endpoint queda cerrado: nunca se acepta
    // una peticion anonima que dispara trabajo contra los proveedores.
    res.status(401).json({ message: "Cron no configurado" });
    return false;
  }

  const header = req.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!safeEqual(token, CRON_SECRET)) {
    log.warn("Intento de cron con secreto inválido", { ip: req.ip });
    res.status(401).json({ message: "No autorizado" });
    return false;
  }

  return true;
};

const syncProviders = async (req, res) => {
  try {
    if (!authorizeCron(req, res)) return undefined;

    const result = await runProviderSync({ limit: req.query.limit });
    return res.status(200).json({ ...result, schedule: CRON_SCHEDULE });
  } catch (error) {
    return sendError(res, error, "No se pudo ejecutar el cron");
  }
};

// GET /api/cron/sync-catalog
//
// Sincroniza el catalogo de Venndelo (direccion IN). Igual que el cron de
// pedidos: Bearer CRON_SECRET y todo el trabajo queda en catalog_sync_runs.
const syncCatalog = async (req, res) => {
  try {
    if (!authorizeCron(req, res)) return undefined;

    if (!CATALOG_SYNC_ENABLED) {
      return res.status(200).json({
        ok: true,
        skipped: "CATALOG_SYNC_ENABLED=false",
      });
    }

    const result = await venndeloService.sync({
      trigger: CATALOG_SYNC_TRIGGER.CRON,
      triggeredBy: null,
      pageSize: req.query.pageSize,
    });

    return res.status(200).json({ ...result, schedule: CATALOG_SYNC_SCHEDULE });
  } catch (error) {
    return sendError(res, error, "No se pudo sincronizar el catálogo");
  }
};

router.get("/sync-providers", syncProviders);
router.get("/sync-catalog", syncCatalog);

module.exports = router;
