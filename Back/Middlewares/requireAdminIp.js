// Lista de IPs permitidas para el panel (ADM-S4).
//
// `ADMIN_IP_ALLOWLIST` acepta IPs exactas y rangos CIDR separados por comas,
// por ejemplo:
//
//   ADMIN_IP_ALLOWLIST=190.1.2.3,10.0.0.0/8,2800:3f0::/32
//
// Vacia = sin restriccion (comportamiento por defecto). Se aplica a
// `/api/admin` y a los endpoints de segundo factor (`/api/auth/admin/*`);
// el login de un administrador tambien se rechaza si su IP no esta permitida.
//
// La IP se toma de `req.ip`, que respeta `TRUST_PROXY`. Con Vercel el valor es
// el del cliente real porque `TRUST_PROXY=1` ya esta configurado.

const net = require("node:net");
const { ADMIN_IP_ALLOWLIST } = require("../config.js");
const { logger } = require("../Utils/logger.js");

const normalizeIp = (value) => {
  let ip = String(value || "").trim();
  if (!ip) return "";
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  ip = ip.split("%")[0].toLowerCase();
  if (ip.startsWith("::ffff:") && net.isIPv4(ip.slice(7))) {
    return ip.slice(7);
  }
  return ip;
};

const ipv4ToBigInt = (ip) => {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
};

const expandIpv6 = (ip) => {
  const halves = ip.split("::");
  if (halves.length > 2) return null;

  const parseGroups = (text) => {
    if (!text) return [];
    const groups = text.split(":");
    const last = groups[groups.length - 1];
    if (last && last.includes(".")) {
      if (!net.isIPv4(last)) return null;
      const [a, b, c, d] = last.split(".").map(Number);
      groups.splice(
        groups.length - 1,
        1,
        ((a << 8) | b).toString(16),
        ((c << 8) | d).toString(16),
      );
    }
    return groups;
  };

  const left = parseGroups(halves[0]);
  const right = halves.length === 2 ? parseGroups(halves[1]) : [];
  if (!left || !right) return null;

  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;

  const groups = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ];

  if (
    groups.length !== 8 ||
    groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))
  ) {
    return null;
  }

  return groups;
};

const ipv6ToBigInt = (ip) => {
  const groups = expandIpv6(ip);
  if (!groups) return null;
  let value = 0n;
  for (const group of groups) {
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
};

const parseEntry = (raw) => {
  const entry = String(raw || "").trim();
  if (!entry) return null;

  const [address, prefixRaw, extra] = entry.split("/");
  if (extra !== undefined) return null;

  const ip = normalizeIp(address);

  if (net.isIPv4(ip)) {
    const prefix = prefixRaw === undefined ? 32 : Number(prefixRaw);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
    const value = ipv4ToBigInt(ip);
    return value === null ? null : { family: 4, bits: 32, prefix, value };
  }

  if (net.isIPv6(ip)) {
    const prefix = prefixRaw === undefined ? 128 : Number(prefixRaw);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) return null;
    const value = ipv6ToBigInt(ip);
    return value === null ? null : { family: 6, bits: 128, prefix, value };
  }

  return null;
};

const compileAllowlist = (entries = ADMIN_IP_ALLOWLIST) => {
  const compiled = [];
  for (const entry of entries) {
    const parsed = parseEntry(entry);
    if (parsed) {
      compiled.push(parsed);
    } else {
      logger.warn("Entrada inválida en ADMIN_IP_ALLOWLIST; se ignora", {
        entry,
      });
    }
  }
  return compiled;
};

const COMPILED_ALLOWLIST = compileAllowlist();

const ipMatchesEntry = (ip, entry) => {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;

  if (entry.family === 4) {
    if (!net.isIPv4(normalized)) return false;
    const value = ipv4ToBigInt(normalized);
    if (value === null) return false;
    const hostBits = BigInt(entry.bits - entry.prefix);
    const mask =
      ((1n << BigInt(entry.bits)) - 1n) ^ ((1n << hostBits) - 1n);
    return (value & mask) === (entry.value & mask);
  }

  if (!net.isIPv6(normalized)) return false;
  const value = ipv6ToBigInt(normalized);
  if (value === null) return false;
  const hostBits = BigInt(entry.bits - entry.prefix);
  const mask = ((1n << BigInt(entry.bits)) - 1n) ^ ((1n << hostBits) - 1n);
  return (value & mask) === (entry.value & mask);
};

const isIpAllowed = (ip, entries = COMPILED_ALLOWLIST) => {
  if (!entries || entries.length === 0) return true;
  return entries.some((entry) => ipMatchesEntry(ip, entry));
};

const isRequestIpAllowed = (req) => isIpAllowed(req?.ip);

const requireAdminIp = (req, res, next) => {
  if (isRequestIpAllowed(req)) return next();

  return res.status(403).json({
    message: "Esta dirección IP no tiene acceso al panel administrativo",
    code: "ADMIN_IP_NOT_ALLOWED",
  });
};

module.exports = {
  normalizeIp,
  parseEntry,
  compileAllowlist,
  isIpAllowed,
  isRequestIpAllowed,
  requireAdminIp,
};
