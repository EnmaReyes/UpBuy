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
//   - Si el producto deja de estar disponible se OCULTA; no se borra.
//   - La politica `publishPolicy` decide si lo nuevo se publica solo.
//   - Un producto con pedidos jamas se elimina.
//   - Nunca se sobrescribe un campo que el admin haya marcado en
//     `manualOverrides`.
//   - Todo queda registrado en `catalog_sync_runs`.
const {
  sequelize,
  Product,
  ProductImage,
  Category,
  Supplier,
  SupplierProduct,
  SupplierProductVariation,
  SupplierProductAsset,
} = require("../../DataBase/models/index.js");
const { Op, literal } = require("sequelize");
const {
  CATALOG_SYNC_STATUS,
  CATALOG_SYNC_TRIGGER,
  PRODUCT_STATUS,
  PUBLISH_POLICY,
  DEFAULT_CATEGORY_SLUG,
  DEFAULT_CATEGORY_NAME,
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
const {
  resolvePublishPolicy,
  resolvePublishVisibility,
} = require("./visibility.service.js");

const log = createLogger("catalog.sync");

// Helpers de nombres (SKU/slug/tallas) con respaldo en Venndelo. Cada
// adaptador puede exponer los suyos en `catalog`; si no, se usa el
// comportamiento historico para no cambiar los SKU ya publicados.
const FALLBACK_HELPERS = { productSizes, buildProductSku, buildProductSlug };

const helpersForSlug = (slug) => {
  try {
    const adapter = getSupplierAdapter(slug);
    return {
      productSizes: adapter.catalog?.productSizes || FALLBACK_HELPERS.productSizes,
      buildProductSku:
        adapter.catalog?.buildProductSku || FALLBACK_HELPERS.buildProductSku,
      buildProductSlug:
        adapter.catalog?.buildProductSlug || FALLBACK_HELPERS.buildProductSlug,
    };
  } catch {
    return FALLBACK_HELPERS;
  }
};

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

const applyToPublished = async (
  product,
  supplierProduct,
  transaction,
  helpers = FALLBACK_HELPERS,
) => {
  const overrides = product.manualOverrides || {};
  const updates = {};
  let changed = false;
  // Un producto que el proveedor deja de ofrecer se oculta (no se borra).
  let hidden = false;

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
  const sizes = helpers.productSizes(variations);
  const jsonSizes = JSON.stringify(product.sizes || []);
  if (jsonSizes !== JSON.stringify(sizes)) {
    updates.sizes = sizes;
    changed = true;
  }

  const firstSku = variations.find((v) => v.sku)?.sku || null;
  if (firstSku && !overrides.name) setIf("providerSku", firstSku);

  // Imagenes: solo si el admin no las personalizo. Se reescriben unicamente
  // cuando cambian: si no, la corrida contaria como "actualizado" infinidad de
  // veces el mismo producto.
  if (!overrides.images) {
    const assets = await SupplierProductAsset.findAll({
      where: { supplierProductId: supplierProduct.id },
      transaction,
    });
    const ordered = [...assets].sort((a, b) => a.position - b.position);
    const urls = ordered.map((asset) => asset.url);
    const current = await ProductImage.findAll({
      where: { productId: product.id },
      order: [["position", "ASC"]],
      transaction,
    });
    const sameRows =
      current.length === ordered.length &&
      ordered.every((asset, index) => {
        const row = current[index];
        return (
          row.url === asset.url &&
          row.position === asset.position &&
          row.externalAssetId === asset.externalAssetId
        );
      });
    const sameCache =
      JSON.stringify(product.images || []) === JSON.stringify(urls);

    if (!sameRows || !sameCache) {
      await rebuildProductImages(product, assets, transaction);
      updates.images = urls;
      changed = true;
    }
  }

  // Disponibilidad -> visibilidad. `active` es el interruptor de la tienda.
  // Un producto sin stock sigue visible como agotado; solo se oculta cuando el
  // proveedor deja de ofrecerlo.
  if (!overrides.active) {
    const shouldBeActive =
      product.status === PRODUCT_STATUS.ACTIVE &&
      Boolean(supplierProduct.availability);
    if (Boolean(product.active) !== shouldBeActive) {
      updates.active = shouldBeActive;
      changed = true;
      if (!shouldBeActive) hidden = true;
    }
  }

  if (changed) {
    await product.update(updates, { transaction });
  }

  return { changed, hidden };
};

// Sincroniza todos los productos publicados de un proveedor.
const syncPublishedProducts = async ({
  supplierId,
  transaction,
  helpers = FALLBACK_HELPERS,
}) => {
  const products = await Product.findAll({
    where: { supplierId },
    transaction,
  });

  let updated = 0;
  let unchanged = 0;
  let hidden = 0;

  for (const product of products) {
    if (!product.supplierProductId) continue;

    const supplierProduct = await SupplierProduct.findByPk(
      product.supplierProductId,
      { transaction },
    );
    if (!supplierProduct) continue;

    const outcome = await applyToPublished(
      product,
      supplierProduct,
      transaction,
      helpers,
    );
    if (outcome.changed) updated += 1;
    else unchanged += 1;
    if (outcome.hidden) hidden += 1;
  }

  return { candidates: products.length, updated, unchanged, hidden };
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

// Categoria que se asigna cuando el producto no trae una: la del proveedor o,
// si no existe, la categoria de respaldo "Sin clasificar".
const resolveDefaultCategoryIds = async (supplier, transaction) => {
  if (supplier?.defaultCategoryId) {
    const preferred = await Category.findByPk(supplier.defaultCategoryId, {
      attributes: ["id"],
      transaction,
    });
    if (preferred) return [preferred.id];
  }

  const fallback = await Category.findOne({
    where: { slug: DEFAULT_CATEGORY_SLUG },
    attributes: ["id"],
    transaction,
  });
  if (fallback) return [fallback.id];

  // Defensa: una base sin la semilla igual puede publicar; la categoria se
  // crea aqui de forma idempotente.
  const created = await Category.create(
    {
      name: DEFAULT_CATEGORY_NAME,
      slug: DEFAULT_CATEGORY_SLUG,
      description: "Productos que aun no tienen categoria asignada.",
      sortOrder: 999,
    },
    { transaction },
  );
  return [created.id];
};

// Publica (o actualiza) un producto del proveedor en la tienda.
const publishSupplierProduct = async ({
  supplierProductId,
  categoryIds = [],
  price,
  markup,
  visibility,
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

    // Nombres (SKU/slug/tallas) segun el proveedor: cada adaptador define los
    // suyos y si no, se mantiene el historico de Venndelo.
    const helpers = helpersForSlug(supplier.slug);

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

    // Visibilidad: por defecto todo nace en borrador salvo que el proveedor
    // tenga `auto_visible` o el llamador pida `visibility: "visible"`.
    const explicitVisibility = visibility === "visible" || visibility === "draft";
    const policy = resolvePublishPolicy(supplier);
    const wantVisible =
      resolvePublishVisibility({ visibility, policy }) === "visible";

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
      status: wantVisible ? PRODUCT_STATUS.ACTIVE : PRODUCT_STATUS.DRAFT,
      active: wantVisible ? Boolean(supplierProduct.availability) : false,
      providerSku: variations.find((v) => v.sku)?.sku || null,
      sizes: helpers.productSizes(variations),
    };
    if (!product) {
      const sku = helpers.buildProductSku(supplierProduct.externalId);
      const slug = helpers.buildProductSlug(
        supplierProduct.name,
        supplierProduct.externalId,
      );
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
          // `publishedAt` es la primera publicacion real: un borrador no la
          // tiene hasta que se hace visible (se fija en la visibilidad).
          publishedAt: wantVisible ? new Date() : null,
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
        providerSku: base.providerSku,
        sizes: base.sizes,
      };
      // El estado y la visibilidad del producto ya publicado son decisiones
      // del administrador: re-publicar no debe resucitar un producto oculto o
      // archivado. Solo se tocan si el llamador pide una visibilidad explicita
      // y el admin no fijo `active` en manualOverrides.
      if (explicitVisibility) {
        updates.status = base.status;
        if (!overrides.active) updates.active = base.active;
      }
      if (!overrides.name) updates.name = base.name;
      if (!overrides.description) updates.description = base.description;
      if (!overrides.stock) updates.stock = base.stock;

      // Primera publicacion desde el proveedor: si el producto deja de estar
      // en borrador y pasa a visible, se marca la fecha. Nunca se pisa una
      // fecha ya existente.
      const nextStatus = updates.status ?? product.status;
      const nextActive = overrides.active
        ? product.active
        : updates.active ?? product.active;
      if (
        !product.publishedAt &&
        nextStatus === PRODUCT_STATUS.ACTIVE &&
        nextActive === true
      ) {
        updates.publishedAt = new Date();
      }

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

    // Imagenes: si el admin personalizo la galeria, se respeta.
    if (!(product.manualOverrides || {}).images) {
      const urls = await rebuildProductImages(product, assets, transaction);
      await product.update({ images: urls }, { transaction });
    }

    // Categorias: las elegidas mandan. Si no hay ninguna y el producto aun no
    // tiene categoria, se asigna la del proveedor o "Sin clasificar".
    let finalCategoryIds = ids;
    if (finalCategoryIds.length === 0) {
      const current = await product.getCategories({
        attributes: ["id"],
        transaction,
      });
      if (!current || current.length === 0) {
        finalCategoryIds = await resolveDefaultCategoryIds(supplier, transaction);
      }
    }
    if (finalCategoryIds.length > 0) {
      await product.setCategories(finalCategoryIds, { transaction });
    }

    return product;
  });

  return result.toJSON();
};

// ---------------------------------------------------------------------------
// Publicacion automatica (politica del proveedor)
// ---------------------------------------------------------------------------

// Productos del proveedor que aun no tienen fila en `products`.
const notPublishedLiteral = () =>
  literal(`NOT EXISTS (
    SELECT 1 FROM products p
     WHERE p."supplierProductId" = "SupplierProduct"."id"
  )`);

// Aplica la politica del proveedor a los productos nuevos:
//   - manual: no publica nada (el admin decide desde la bandeja).
//   - auto_draft: publica en borrador para revisar la ficha.
//   - auto_visible: publica y activa (si el proveedor lo tiene disponible).
//
// Nunca resucita lo archivado ni pisa overrides: solo mira productos sin
// publicar. Un producto sin disponibilidad no se publica; queda pendiente para
// cuando el proveedor lo reponga.
const autoPublishNewProducts = async ({
  supplier,
  policy,
  actorUserId = null,
} = {}) => {
  const resolvedPolicy = policy || resolvePublishPolicy(supplier);
  const result = {
    policy: resolvedPolicy,
    created: 0,
    skipped: 0,
    skippedDetails: [],
  };

  if (resolvedPolicy === PUBLISH_POLICY.MANUAL) return result;

  const visibility = resolvePublishVisibility({ policy: resolvedPolicy });
  const pending = await SupplierProduct.findAll({
    where: {
      supplierId: supplier.id,
      availability: true,
      [Op.and]: [notPublishedLiteral()],
    },
    order: [["updatedAt", "ASC"]],
  });

  for (const candidate of pending) {
    try {
      await publishSupplierProduct({
        supplierProductId: candidate.id,
        visibility,
        actorUserId,
      });
      result.created += 1;
    } catch (error) {
      result.skipped += 1;
      if (result.skippedDetails.length < 20) {
        result.skippedDetails.push({
          externalId: candidate.externalId,
          motivo: error.message,
        });
      }
      log.warn("No se pudo publicar un producto nuevo", {
        externalId: candidate.externalId,
        error: error.message,
      });
    }
  }

  const unavailable = await SupplierProduct.count({
    where: {
      supplierId: supplier.id,
      availability: false,
      [Op.and]: [notPublishedLiteral()],
    },
  });

  if (unavailable > 0) {
    result.skipped += unavailable;
    if (result.skippedDetails.length < 20) {
      result.skippedDetails.push({
        externalId: null,
        motivo: `${unavailable} producto(s) sin disponibilidad; se publican cuando vuelvan a tener stock`,
      });
    }
  }

  return result;
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
        `${adapter.name} no está configurado (faltan credenciales)`,
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

      // 2. Aplicar a los productos ya publicados (stock, costo, precio de
      //    sugerencia y visibilidad si el proveedor dejo de ofrecerlo).
      const helpers = helpersForSlug(supplierSlug);
      const published = await sequelize.transaction((transaction) =>
        syncPublishedProducts({ supplierId: supplier.id, transaction, helpers }),
      );

      // 3. Publicar automaticamente los productos nuevos segun la politica del
      //    proveedor. `manual` no hace nada: la bandeja decide.
      const autoPublish = await autoPublishNewProducts({
        supplier,
        policy: resolvePublishPolicy(supplier),
        actorUserId: triggeredBy,
      });

      const counters = {
        publishedCreated: autoPublish.created,
        publishedUpdated: published.updated,
        hidden: published.hidden,
        skipped: autoPublish.skipped,
      };

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
        ...counters,
      });

      if (autoPublish.skippedDetails.length > 0) {
        log.info("Auto-publicación dejó productos pendientes", {
          supplier: supplierSlug,
          policy: autoPublish.policy,
          skipped: autoPublish.skipped,
          details: autoPublish.skippedDetails,
        });
      }

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
        publishPolicy: autoPublish.policy,
        publishedCreated: counters.publishedCreated,
        publishedUpdated: counters.publishedUpdated,
        hidden: counters.hidden,
        skipped: counters.skipped,
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
  autoPublishNewProducts,
  publishSupplierProduct,
  unpublishProduct,
  rebuildProductImages,
};