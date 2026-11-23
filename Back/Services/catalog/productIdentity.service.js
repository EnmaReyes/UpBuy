// Identidad y normalizacion basica de productos.
//
// Antes esta logica estaba copiada en cada adaptador de proveedor y en el alta
// manual, con regex y limites distintos. Aqui vive la definicion canonica:
// SKU, slug publico, moneda y helpers puros compartidos por importacion,
// sincronizacion y alta manual.
const HttpError = require("../../Utils/HttpError.js");

const MAX_SLUG_LENGTH = 180;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

const cleanText = (value, max) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return max ? text.slice(0, max) : text;
};

const normalizeCurrency = (value) => {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(text) ? text : "COP";
};

// Slug legible para URLs, sin tildes. Se usa como base del slug publico; el
// slug final siempre lleva un fragmento del id externo para ser unico.
const slugify = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

// Valida el slug que escribe el admin en el alta manual. Lanza HttpError para
// que el controller devuelva 400 con un mensaje en espanol.
const normalizeProductSlug = (value) => {
  const slug = String(value || "").trim().toLowerCase();
  if (
    !slug ||
    slug.length > MAX_SLUG_LENGTH ||
    !SLUG_PATTERN.test(slug)
  ) {
    throw new HttpError(
      400,
      "El slug solo admite minusculas, numeros y guiones (maximo 180)",
    );
  }
  return slug;
};

const buildProductSku = (externalId, prefix = "MAN") => {
  const clean = String(externalId || "").replace(/\s+/g, "").slice(0, 80);
  return `${prefix}-${clean}`;
};

const buildProductSlug = (name, externalId) => {
  const base = slugify(name) || "producto";
  const short = String(externalId || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8);
  return short ? `${base}-${short}` : base;
};

// Tallas del producto a partir de las variaciones normalizadas. El proveedor
// que no documenta variaciones devuelve [] directamente.
const productSizes = (variations) => {
  const sizes = new Set();
  for (const variation of variations || []) {
    const attrs = variation?.attributes || {};
    const value = attrs.size ?? attrs.talla ?? Object.values(attrs)[0];
    if (value) sizes.add(String(value));
  }
  return [...sizes];
};

module.exports = {
  MAX_SLUG_LENGTH,
  SLUG_PATTERN,
  toNumberOrNull,
  toInteger,
  cleanText,
  normalizeCurrency,
  slugify,
  normalizeProductSlug,
  buildProductSku,
  buildProductSlug,
  productSizes,
};
