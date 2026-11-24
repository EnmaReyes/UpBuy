// Importacion del catalogo de un proveedor a PostgreSQL.
//
// Es IDEMPOTENTE: cada producto se identifica por (supplierId, externalId) y
// cada variacion/imagen por su id externo, asi que correr la importacion dos
// veces no duplica nada.
//
// Reglas:
//   - Se escribe por PAGINA (una transaccion por pagina): una respuesta
//     enorme no deja una transaccion abierta durante minutos.
//   - Nunca se borra un producto porque "no vino" en una pagina: la
//     desaparicion se resuelve en la sincronizacion (marcar no disponible),
//     no en la importacion.
//   - Las variaciones/imagenes que SI dejan de venir en el detalle completo de
//     un producto se eliminan, porque ese payload es la verdad de ese producto.
const {
  sequelize,
  SupplierProduct,
  SupplierProductVariation,
  SupplierProductAsset,
} = require("../../DataBase/models/index.js");
const {
  normalizeProduct: defaultNormalizeProduct,
} = require("../../integrations/suppliers/venndelo/venndelo.normalize.js");
const { createLogger } = require("../../Utils/logger.js");

const log = createLogger("catalog.import");

const num = (value) => (value === null || value === undefined ? null : Number(value));

const jsonEqual = (a, b) => {
  const normalize = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(normalize);
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = normalize(value[key]);
    }
    return sorted;
  };
  return JSON.stringify(normalize(a ?? null)) === JSON.stringify(normalize(b ?? null));
};

// ---------------------------------------------------------------------------
// Variaciones
// ---------------------------------------------------------------------------

const syncVariations = async (supplierProductId, variations, transaction) => {
  const now = new Date();
  const existing = await SupplierProductVariation.findAll({
    where: { supplierProductId },
    transaction,
  });
  const byExternalId = new Map(existing.map((row) => [row.externalId, row]));
  const incomingIds = new Set();
  let changed = false;

  for (const variation of variations) {
    incomingIds.add(variation.externalId);
    const row = byExternalId.get(variation.externalId);
    const values = {
      sku: variation.sku,
      attributes: variation.attributes,
      originalPrice: variation.originalPrice,
      compareAtPrice: variation.compareAtPrice,
      supplierPrice: variation.supplierPrice,
      quantity: variation.quantity,
      available: variation.available,
      rawData: variation.rawData,
      lastSyncedAt: now,
    };

    if (!row) {
      await SupplierProductVariation.create(
        { supplierProductId, externalId: variation.externalId, ...values },
        { transaction },
      );
      changed = true;
      continue;
    }

    const differs =
      row.sku !== values.sku ||
      jsonEqual(row.attributes, values.attributes) === false ||
      num(row.originalPrice) !== num(values.originalPrice) ||
      num(row.compareAtPrice) !== num(values.compareAtPrice) ||
      num(row.supplierPrice) !== num(values.supplierPrice) ||
      Number(row.quantity) !== Number(values.quantity) ||
      Boolean(row.available) !== Boolean(values.available);

    await row.update(values, { transaction });
    if (differs) changed = true;
  }

  // Variaciones que ya no existen en el proveedor.
  for (const row of existing) {
    if (!incomingIds.has(row.externalId)) {
      await row.destroy({ transaction });
      changed = true;
    }
  }

  return changed;
};

// ---------------------------------------------------------------------------
// Imagenes
// ---------------------------------------------------------------------------

const syncAssets = async (supplierProductId, assets, transaction) => {
  const existing = await SupplierProductAsset.findAll({
    where: { supplierProductId },
    transaction,
  });
  const byExternalId = new Map(existing.map((row) => [row.externalAssetId, row]));
  const incomingIds = new Set();
  let changed = false;

  // La posicion es unica dentro del producto: se libera antes de reasignar
  // para no chocar con el indice unico (producto, posicion) al reordenar.
  await SupplierProductAsset.update(
    { position: sequelize.literal("position + 100") },
    { where: { supplierProductId }, transaction },
  );

  for (const asset of assets) {
    incomingIds.add(asset.externalAssetId);
    const row = byExternalId.get(asset.externalAssetId);
    const values = {
      url: asset.url,
      fileName: asset.fileName,
      contentType: asset.contentType,
      size: asset.size,
      position: asset.position,
      isPrimary: asset.isPrimary,
    };

    if (!row) {
      await SupplierProductAsset.create(
        { supplierProductId, externalAssetId: asset.externalAssetId, ...values },
        { transaction },
      );
      changed = true;
      continue;
    }

    const differs =
      row.url !== values.url ||
      row.position !== values.position ||
      Boolean(row.isPrimary) !== Boolean(values.isPrimary) ||
      row.fileName !== values.fileName;

    await SupplierProductAsset.update(values, {
      where: { id: row.id },
      transaction,
    });
    // Se usa la actualizacion estatica: la instancia en memoria conserva la
    // posicion vieja (se libero arriba con `position + 100`) y Sequelize
    // omitiria la columna por "sin cambios", dejando los assets desplazados.
    if (differs) changed = true;
  }

  for (const row of existing) {
    if (!incomingIds.has(row.externalAssetId)) {
      await row.destroy({ transaction });
      changed = true;
    }
  }

  return changed;
};

// ---------------------------------------------------------------------------
// Producto
// ---------------------------------------------------------------------------

// Crea o actualiza un producto original. Devuelve { outcome, record }.
const importProduct = async ({ supplierId, normalized, transaction }) => {
  const now = new Date();
  const existing = await SupplierProduct.findOne({
    where: { supplierId, externalId: normalized.externalId },
    transaction,
  });

  const productValues = {
    name: normalized.name,
    description: normalized.description,
    originalPrice: normalized.originalPrice,
    currency: normalized.currency,
    availability: normalized.availability,
    totalQuantity: normalized.totalQuantity,
    processingTime: normalized.processingTime,
    rawData: normalized.rawData,
    lastSyncedAt: now,
  };

  let record;
  let productChanged;
  let outcome;

  if (!existing) {
    record = await SupplierProduct.create(
      { supplierId, externalId: normalized.externalId, ...productValues },
      { transaction },
    );
    productChanged = true;
    outcome = "created";
  } else {
    productChanged =
      existing.name !== productValues.name ||
      existing.description !== productValues.description ||
      num(existing.originalPrice) !== num(productValues.originalPrice) ||
      Boolean(existing.availability) !== Boolean(productValues.availability) ||
      Number(existing.totalQuantity) !== Number(productValues.totalQuantity) ||
      existing.processingTime !== productValues.processingTime;

    await existing.update(productValues, { transaction });
    record = existing;
  }

  const variationsChanged = await syncVariations(
    record.id,
    normalized.variations,
    transaction,
  );
  const assetsChanged = await syncAssets(record.id, normalized.assets, transaction);

  if (outcome !== "created") {
    outcome =
      productChanged || variationsChanged || assetsChanged
        ? "updated"
        : "unchanged";
  }

  return { outcome, record };
};

// Importa una pagina completa dentro de SU PROPIA transaccion.
//
// `normalizeProduct` es el normalizador del proveedor (hook del adaptador). Si
// no se pasa, se usa el de Venndelo para conservar el comportamiento previo.
const importPage = async ({
  supplierId,
  items,
  normalizeProduct = defaultNormalizeProduct,
}) => {
  const stats = { created: 0, updated: 0, unchanged: 0, errors: 0, errorSummary: [] };

  const transaction = await sequelize.transaction();

  try {
    for (const raw of items) {
      try {
        // Un producto malformado no debe tumbar la pagina completa.
        const normalized = normalizeProduct(raw);

        if (!normalized.externalId) {
          throw new Error("Producto sin id externo");
        }

        const { outcome } = await importProduct({
          supplierId,
          normalized,
          transaction,
        });
        stats[outcome] += 1;
      } catch (error) {
        stats.errors += 1;
        // El id externo puede llamarse distinto segun el proveedor.
        const externalId = raw?.id ?? raw?.idProduct ?? null;
        if (stats.errorSummary.length < 20) {
          stats.errorSummary.push({
            externalId: externalId === null ? null : String(externalId),
            motivo: error.message,
          });
        }
        log.warn("No se pudo importar un producto", {
          externalId: externalId === null ? null : String(externalId),
          error: error.message,
        });
      }
    }

    await transaction.commit();
    return stats;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// Importa el catalogo completo usando el iterador del adaptador.
const importCatalog = async ({ supplier, adapter, pageSize, filters, onProgress }) => {
  const normalizeProduct =
    adapter.catalog?.normalizeProduct || defaultNormalizeProduct;
  const totals = {
    pages: 0,
    received: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    errors: 0,
    errorSummary: [],
  };

  const result = await adapter.catalog.iteratePages(
    supplier,
    { pageSize, filters },
    async (page) => {
      totals.pages += 1;
      totals.received += page.items.length;

      const stats = await importPage({
        supplierId: supplier.id,
        items: page.items,
        normalizeProduct,
      });
      totals.created += stats.created;
      totals.updated += stats.updated;
      totals.unchanged += stats.unchanged;
      totals.errors += stats.errors;
      totals.errorSummary.push(...stats.errorSummary);
      if (totals.errorSummary.length > 20) {
        totals.errorSummary = totals.errorSummary.slice(0, 20);
      }

      if (typeof onProgress === "function") {
        await onProgress({ page: totals.pages, ...totals });
      }
    },
  );

  return { ...totals, cursor: result.cursor };
};

module.exports = {
  importProduct,
  importPage,
  importCatalog,
  syncVariations,
  syncAssets,
};