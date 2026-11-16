// Logica pura de visibilidad y acciones en lote del catalogo.
//
// No consulta la base ni conoce HTTP: recibe productos/suppliers ya resueltos y
// devuelve el plan que el servicio administrativo aplica. Mantenerlo puro
// permite probar las reglas de negocio sin una base de datos.
const {
  PRODUCT_STATUS,
  PUBLISH_POLICY,
  PUBLISH_POLICY_VALUES,
  PRODUCT_BULK_ACTION,
} = require("../../DataBase/models/enums.js");
const { suggestedPrice } = require("../prices.js");
const HttpError = require("../../Utils/HttpError.js");

const toJson = (value) => (value?.toJSON ? value.toJSON() : value);

// Un producto es visible en la tienda solo si esta activo y su estado
// editorial es `active`. El stock no interviene: 0 se muestra como agotado.
const isVisible = (product) => {
  const json = toJson(product) || {};
  return json.status === PRODUCT_STATUS.ACTIVE && Boolean(json.active);
};

// Politica efectiva de un proveedor. Si falta o es invalida, se usa `manual`:
// el modo seguro siempre es no publicar sin curaduria.
const resolvePublishPolicy = (supplier) => {
  const json = toJson(supplier) || {};
  const policy = String(json.publishPolicy || "").trim();
  return PUBLISH_POLICY_VALUES.includes(policy)
    ? policy
    : PUBLISH_POLICY.MANUAL;
};

// Visibilidad con la que nace un producto publicado.
//   - `visibility` explicita (draft | visible) manda.
//   - Si no viene, solo `auto_visible` publica visible; el resto nace borrador.
const resolvePublishVisibility = ({ visibility, policy } = {}) => {
  const explicit = String(visibility || "").trim();
  if (explicit === "visible") return "visible";
  if (explicit === "draft") return "draft";
  return policy === PUBLISH_POLICY.AUTO_VISIBLE ? "visible" : "draft";
};

const withOverrides = (product, flags) => {
  const json = toJson(product) || {};
  const current =
    json.manualOverrides && typeof json.manualOverrides === "object"
      ? json.manualOverrides
      : {};
  return { ...current, ...flags };
};

const ensureAction = (action) => {
  const value = String(action || "").trim();
  if (!Object.values(PRODUCT_BULK_ACTION).includes(value)) {
    throw new HttpError(400, "Acción de lote no válida");
  }
  return value;
};

const parsePercent = (payload) => {
  const percent = Number(payload?.percent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 1000) {
    throw new HttpError(400, "El porcentaje debe estar entre 0 y 1000");
  }
  return percent;
};

const parseCategories = (payload) => {
  if (!Array.isArray(payload?.categoryIds)) {
    throw new HttpError(400, "categoryIds debe ser un arreglo");
  }
  const mode = payload?.mode === "add" ? "add" : "replace";
  return { categoryIds: payload.categoryIds, categoryMode: mode };
};

const parseFeature = (payload) => {
  if (typeof payload?.value !== "boolean") {
    throw new HttpError(400, "El valor de destacado debe ser booleano");
  }
  return payload.value;
};

// Construye el plan de una accion en lote.
//
// Devuelve `{ updates, skipped }`:
//   updates: [{ id, values?, categoryIds?, categoryMode? }]
//   skipped: [{ id, motivo }]
// Nunca falla por un producto individual: los casos no aplicables se omiten
// con un motivo y el resto del lote continua.
const buildBulkPlan = ({ products = [], action, payload = {} } = {}) => {
  const resolvedAction = ensureAction(action);
  const list = (Array.isArray(products) ? products : []).map(toJson).filter(Boolean);

  const updates = [];
  const skipped = [];

  if (resolvedAction === PRODUCT_BULK_ACTION.APPLY_MARKUP) {
    const percent = parsePercent(payload);
    for (const product of list) {
      const cost = Number(product.cost) || 0;
      if (cost <= 0) {
        skipped.push({ id: product.id, motivo: "Sin costo del proveedor" });
        continue;
      }
      const price = suggestedPrice(cost, percent);
      if (!Number.isFinite(price) || price <= 0) {
        skipped.push({ id: product.id, motivo: "No se pudo calcular el precio" });
        continue;
      }
      updates.push({
        id: product.id,
        values: {
          price,
          markup: percent,
          manualOverrides: withOverrides(product, { price: true }),
        },
      });
    }
    return { updates, skipped };
  }

  if (resolvedAction === PRODUCT_BULK_ACTION.SET_CATEGORIES) {
    const { categoryIds, categoryMode } = parseCategories(payload);
    for (const product of list) {
      updates.push({
        id: product.id,
        categoryIds,
        categoryMode,
        values: {
          manualOverrides: withOverrides(product, { category: true }),
        },
      });
    }
    return { updates, skipped };
  }

  if (resolvedAction === PRODUCT_BULK_ACTION.FEATURE) {
    const value = parseFeature(payload);
    for (const product of list) {
      updates.push({ id: product.id, values: { destacadas: value } });
    }
    return { updates, skipped };
  }

  for (const product of list) {
    if (
      resolvedAction === PRODUCT_BULK_ACTION.MAKE_VISIBLE &&
      product.status === PRODUCT_STATUS.ARCHIVED
    ) {
      skipped.push({
        id: product.id,
        motivo: "Archivado: usa Restaurar borrador antes de hacerlo visible",
      });
      continue;
    }

    const visibilityFlags = {
      manualOverrides: withOverrides(product, { active: true }),
    };

    if (resolvedAction === PRODUCT_BULK_ACTION.MAKE_VISIBLE) {
      updates.push({
        id: product.id,
        values: { status: PRODUCT_STATUS.ACTIVE, active: true, ...visibilityFlags },
      });
    } else if (resolvedAction === PRODUCT_BULK_ACTION.HIDE) {
      updates.push({
        id: product.id,
        values: { active: false, ...visibilityFlags },
      });
    } else if (resolvedAction === PRODUCT_BULK_ACTION.ARCHIVE) {
      updates.push({
        id: product.id,
        values: { status: PRODUCT_STATUS.ARCHIVED, active: false, ...visibilityFlags },
      });
    } else if (resolvedAction === PRODUCT_BULK_ACTION.RESTORE_DRAFT) {
      updates.push({
        id: product.id,
        values: { status: PRODUCT_STATUS.DRAFT, active: false, ...visibilityFlags },
      });
    }
  }

  return { updates, skipped };
};

module.exports = {
  isVisible,
  resolvePublishPolicy,
  resolvePublishVisibility,
  buildBulkPlan,
};
