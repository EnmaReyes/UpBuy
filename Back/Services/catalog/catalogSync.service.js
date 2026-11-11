// Sincronizacion del catalogo de un proveedor con el catalogo publicado.
//
// Dos capas:
//   1. Importacion (catalogImport.service): guarda el catalogo ORIGINAL del
//      proveedor (supplier_products + variaciones + assets).
//   2. Sincronizacion: aplica ese original a los productos PUBLICADOS en
//      Upbuy, respetando las personalizaciones del administrador.
//
// Reglas de negocio implementadas:
//   - El stock se actualiza con las unidades REALES del proveedor.
//   - El precio de venta NUNCA se pisa (solo se sugiere al publicar).
//   - Si el producto deja de estar disponible se DESACTIVA; no se borra.
//   - Un producto con pedidos jamas se elimina.
//   - Nunca se sobrescribe un campo que el admin haya marcado en
//     `manualOverrides`.
//   - Todo queda registrado en `catalog_sync_runs`.
const {
  sequelize,
  Product,
  ProductImage,
  Category,
  SupplierProduct,
  SupplierProductVariation,
  SupplierProductAsset,
} = require("../../DataBase/models/index.js");
const {
  CATALOG_SYNC_STATUS,
  CATALOG_SYNC_TRIGGER,
  PRODUCT_STATUS,
} = require("../../DataBase/models/enums.js");
const { DEFAULT_MARKUP_PERCENT } = require("../../config.js");
const HttpError = require("../../Utils/HttpError.js");
const { createLogger } = require("../../Utils/logger.js");
const { getSupplierAdapter } = require("../../integrations/suppliers/index.js");
const { suggestedPrice } = require("../prices.js");
const {
  productSizes,
  buildProductSku,
  buildProductSlug,
} = require("../../integrations/suppliers/venndelo/venndelo.normalize.js");
const { importCatalog } = require("./catalogImport.service.js");
const runs = require("./catalogRuns.service.js");

const log = createLogger("catalog.sync");

// ---------------------------------------------------------------------------
// Imagenes publicadas
// ---------------------------------------------------------------------------

// Reconstruye product_images y la cache products.images a partir de los assets
// del proveedor. Devuelve la lista de URLs (principal primero).
const rebuildProductImages = async (product, assets, transaction) => {
  await ProductImage.destroy({ where: { productId: product.id }, transaction });

  const ordered = [...assets].sort((a, b) => a.position - b.position);

  if (ordered.length > 0) {
    await ProductImage.bulkCreate(
      ordered.map((asset) => ({
        productId: product.id,
        externalAssetId: asset.externalAssetId,
        url: asset.url,
        position: asset.position,
        isPrimary: asset.position === 1,
      })),
      { transaction },
    );
  }

  return ordered.map((asset) => asset.url);
};

// ---------------------------------------------------------------------------
// Aplicar un producto del proveedor a uno publicado
// ---------------------------------------------------------------------------

const applyToPublished = async (product, supplierProduct, transaction) => {
  const overrides = product.manualOverrides || {};
  const updates = {};
  let changed = false;

  const setIf = (field, value) => {
    if (product[field] !== value) {
      updates[field] = value;
      changed = true;
    }
  };

  // Costo (dato interno) siempre refleja al proveedor.
  const cost = supplierProduct.originalPrice === null
    ? null
    : Math.round(Number(supplierProduct.originalPrice));
  if (cost !== null) setIf("cost", cost);

  // Stock: unidades reales del proveedor.
  if (!overrides.stock) {
    setIf("stock", Number(supplierProduct.totalQuantity) || 0);
  }

  // Contenido comercial: solo si el admin no lo personalizo.
  if (!overrides.name) setIf("name", supplierProduct.name);
  if (!overrides.description) setIf("description", supplierProduct.description);

  const variations = await SupplierProductVariation.findAll({
    where: { supplierProductId: supplierProduct.id },
    transaction,
  });
  const sizes = productSizes(variations);
  const jsonSizes = JSON.stringify(product.sizes || []);
  if (jsonSizes !== JSON.stringify(sizes)) {
    updates.sizes = sizes;
    changed = true;
  }

  const firstSku = variations.find((v) => v.sku)?.sku || null;
  if (firstSku && !overrides.name) setIf("providerSku", firstSku);

  // Imagenes: solo si el admin no las personalizo.
  if (!overrides.images) {
    const assets = await SupplierProductAsset.findAll({
      where: { supplierProductId: supplierProduct.id },
      transaction,
    });
    const urls = await rebuildProductImages(product, assets, transaction);
    updates.images = urls;
    changed = true;
  }

  // Disponibilidad -> visibilidad. `active` es el interruptor de la tienda.
  if (!overrides.active) {
    const shouldBeActive =
      product.status === PRODUCT_STATUS.ACTIVE &&
      Boolean(supplierProduct.availability);
    if (Boolean(product.active) !== shouldBeActive) {
      updates.active = shouldBeActive;
      changed = true;
    }
  }

  if (changed) {
    await product.update(updates, { transaction });
  }

  return changed;
};

// Sincroniza todos los productos publicados de un proveedor.
const syncPublishedProducts = async ({ supplierId, transaction }) => {
  const products = await Product.findAll({
    where: { supplierId },
    transaction,
  });

  let updated = 0;
  let unchanged = 0;

  for (const product of products) {
    if (!product.supplierProductId) continue;

    const supplierProduct = await SupplierProduct.findByPk(
      product.supplierProductId,
      { transaction },
    );
    if (!supplierProduct) continue;

    const changed = await applyToPublished(product, supplierProduct, transaction);
    if (changed) updated += 1;
    else unchanged += 1;
  }

  return { candidates: products.length, updated, unchanged };
};

// ---------------------------------------------------------------------------
// Publicar / despublicar (boton "Publicar" del panel)
// ---------------------------------------------------------------------------

const resolveCategoryIds = async (categoryIds, transaction) => {
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) return [];
  const rows = await Category.findAll({
    where: { id: categoryIds },
    attributes: ["id"],
    transaction,
  });
  return rows.map((row) => row.id);
};

// Publica (o actualiza) un producto del proveedor en la tienda.
const publishSupplierProduct = async ({
  supplierProductId,
  categoryIds = [],
  price,
  markup,
  actorUserId = null,
} = {}) => {
  const result = await sequelize.transaction(async (transaction) => {
    const supplierProduct = await SupplierProduct.findByPk(supplierProductId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!supplierProduct) {
      throw new HttpError(404, "Producto del proveedor no encontrado");
    }

    const { Supplier } = require("../../DataBase/models/index.js");
    const supplier = await Supplier.findByPk(supplierProduct.supplierId, {
      transaction,
    });
    if (!supplier) {
      throw new HttpError(409, "El proveedor del producto ya no existe");
    }

    const variations = await SupplierProductVariation.findAll({
      where: { supplierProductId: supplierProduct.id },
      transaction,
    });
    const assets = await SupplierProductAsset.findAll({
      where: { supplierProductId: supplierProduct.id },
      transaction,
    });

    const cost = supplierProduct.originalPrice === null
      ? 0
      : Math.round(Number(supplierProduct.originalPrice));
    const markupValue = Number.isFinite(Number(markup))
      ? Number(markup)
      : DEFAULT_MARKUP_PERCENT;

    // Precio de venta: el que fije el admin; si no, sugerido por markup.
    const explicitPrice = Number(price);
    const salePrice =
      Number.isFinite(explicitPrice) && explicitPrice > 0
        ? Math.round(explicitPrice)
        : suggestedPrice(cost, markupValue);

    const ids = await resolveCategoryIds(categoryIds, transaction);

    let product = await Product.findOne({
      where: { supplierProductId: supplierProduct.id },
      transaction,
    });

    const base = {
      supplierId: supplierProduct.supplierId,
      supplierProductId: supplierProduct.id,
      name: supplierProduct.name,
      description: supplierProduct.description,
      cost,
      stock: Number(supplierProduct.totalQuantity) || 0,
      status: PRODUCT_STATUS.ACTIVE,
      active: Boolean(supplierProduct.availability),
      providerSku: variations.find((v) => v.sku)?.sku || null,
      sizes: productSizes(variations),
    };

    if (!product) {
      const sku = buildProductSku(supplierProduct.externalId);
      const slug = buildProductSlug(supplierProduct.name, supplierProduct.externalId);
      const occupied = await Product.findOne({ where: { sku }, transaction });
      if (occupied) {
        throw new HttpError(
          409,
          `Ya existe un producto con el SKU ${sku}. Revisa el catálogo.`,
        );
      }

      product = await Product.create(
        {
          ...base,
          sku,
          slug,
          provider: supplier.slug,
          price: salePrice,
          markup: markupValue,
          compareAtPrice:
            supplierProduct.rawData?.variations?.[0]?.compare_at_price
              ? Math.round(
                  Number(supplierProduct.rawData.variations[0].compare_at_price),
                )
              : null,
          currency: supplierProduct.currency || "COP",
          publishedAt: new Date(),
          uid: actorUserId,
          // Un precio fijado al publicar es una decision comercial: se marca
          // para que ninguna sincronizacion lo pise.
          manualOverrides:
            Number.isFinite(Number(price)) && Number(price) > 0
              ? { price: true }
              : {},
        },
        { transaction },
      );
    } else {
      const overrides = product.manualOverrides || {};
      // Se reconstruye sin `name`/`description`/`stock` para poder respetar
      // las personalizaciones del admin campo a campo.
      const updates = {
        supplierId: base.supplierId,
        supplierProductId: base.supplierProductId,
        cost: base.cost,
        status: base.status,
        active: base.active,
        providerSku: base.providerSku,
        sizes: base.sizes,
      };
      if (!overrides.name) updates.name = base.name;
      if (!overrides.description) updates.description = base.description;
      if (!overrides.stock) updates.stock = base.stock;

      if (!overrides.price && Number(product.price) <= 0) {
        updates.price = salePrice;
      }
      if (Number.isFinite(Number(price)) && Number(price) > 0) {
        updates.price = Math.round(Number(price));
        updates.manualOverrides = { ...overrides, price: true };
      }
      if (Number.isFinite(Number(markup))) {
        updates.markup = Number(markup);
      }
      await product.update(updates, { transaction });
    }

    const urls = await rebuildProductImages(product, assets, transaction);
    await product.update({ images: urls }, { transaction });

    if (ids.length > 0) {
      await product.setCategories(ids, { transaction });
    }

    return product;
  });

  return result.toJSON();
};

// Despublica sin borrar: el producto conserva historico y pedidos.
const unpublishProduct = async ({ productId } = {}) => {
  const product = await Product.findByPk(productId);
  if (!product) {
    throw new HttpError(404, "Producto no encontrado");
  }
  await product.update({
    status: PRODUCT_STATUS.ARCHIVED,
    active: false,
    manualOverrides: { ...(product.manualOverrides || {}), active: true },
  });
  return product.toJSON();
};

// ---------------------------------------------------------------------------
// Corrida completa
// ---------------------------------------------------------------------------

const runCatalogSync = async ({
  supplierSlug,
  trigger = CATALOG_SYNC_TRIGGER.MANUAL,
  triggeredBy = null,
  pageSize,
  filters,
} = {}) => {
  const adapter = getSupplierAdapter(supplierSlug);

  return runs.withSyncLock(supplierSlug, async () => {
    const supplier = await runs.getSupplierRow(supplierSlug);

    if (!adapter.isConfigured()) {
      throw new HttpError(
        503,
        "Venndelo no está configurado (faltan credenciales)",
      );
    }

    const run = await runs.startRun({
      supplierId: supplier.id,
      trigger,
      triggeredBy,
    });

    try {
      // 1. Importar el catalogo original pagina a pagina.
      const imported = await importCatalog({
        supplier,
        adapter,
        pageSize,
        filters,
      });

      // 2. Aplicar a los productos ya publicados.
      const published = await sequelize.transaction((transaction) =>
        syncPublishedProducts({ supplierId: supplier.id, transaction }),
      );

      await runs.finishRun(run, {
        status:
          imported.errors > 0
            ? imported.errors >= Math.max(imported.received, 1)
              ? CATALOG_SYNC_STATUS.ERROR
              : CATALOG_SYNC_STATUS.SUCCESS
            : CATALOG_SYNC_STATUS.SUCCESS,
        pages: imported.pages,
        received: imported.received,
        created: imported.created,
        updated: imported.updated,
        unchanged: imported.unchanged,
        errors: imported.errors,
        errorSummary: imported.errorSummary,
        cursor: imported.cursor || null,
      });

      const summary = {
        supplier: supplierSlug,
        runId: run.id,
        trigger,
        received: imported.received,
        created: imported.created,
        updated: imported.updated,
        unchanged: imported.unchanged,
        errors: imported.errors,
        pages: imported.pages,
        published,
      };

      log.info("Sincronización de catálogo completada", summary);
      return summary;
    } catch (error) {
      await runs.finishRun(run, {
        status: CATALOG_SYNC_STATUS.ERROR,
        errorSummary: [{ motivo: error.message }],
      });
      throw error;
    }
  });
};

module.exports = {
  runCatalogSync,
  syncPublishedProducts,
  applyToPublished,
  publishSupplierProduct,
  unpublishProduct,
  rebuildProductImages,
};