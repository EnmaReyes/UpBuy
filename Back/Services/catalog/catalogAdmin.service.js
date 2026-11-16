// Acciones administrativas del catalogo UPBUY: visibilidad, lotes e imagenes.
//
// La logica de decision vive en visibility.service (puro). Este servicio solo
// resuelve filas, valida entradas y aplica el plan en la base.
const {
  sequelize,
  Product,
  Category,
  ProductImage,
  SupplierProduct,
  SupplierProductAsset,
} = require("../../DataBase/models/index.js");
const {
  PRODUCT_STATUS,
  PRODUCT_BULK_ACTION,
} = require("../../DataBase/models/enums.js");
const { buildBulkPlan } = require("./visibility.service.js");
const { rebuildProductImages } = require("./catalogSync.service.js");
const catalogQuery = require("./catalogQuery.service.js");
const HttpError = require("../../Utils/HttpError.js");

const MAX_IMAGES = 8;

// POST /api/admin/products/:id/visibility
const setVisibility = async ({ productId, visible } = {}) => {
  if (typeof visible !== "boolean") {
    throw new HttpError(400, "visible debe ser true o false");
  }

  const product = await Product.findByPk(productId);
  if (!product) throw new HttpError(404, "Producto no encontrado");

  const overrides = { ...(product.manualOverrides || {}), active: true };
  await product.update({
    // Ocultar no cambia el estado editorial; hacer visible reactiva el estado.
    ...(visible ? { status: PRODUCT_STATUS.ACTIVE } : {}),
    active: visible,
    manualOverrides: overrides,
  });

  return catalogQuery.getAdmin(product.id);
};

const uniqueIds = (ids) => {
  const seen = new Set();
  const result = [];
  for (const value of ids) {
    const id = String(value || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
};

// POST /api/admin/products/bulk
const bulk = async ({ ids, action, payload = {} } = {}) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new HttpError(400, "ids debe ser un arreglo con al menos un producto");
  }

  const requestedIds = uniqueIds(ids);

  // Para categorias se valida primero que existan: un id invalido no debe
  // dejar medio lote aplicado.
  let categoryIds = null;
  if (action === PRODUCT_BULK_ACTION.SET_CATEGORIES) {
    if (!Array.isArray(payload?.categoryIds)) {
      throw new HttpError(400, "categoryIds debe ser un arreglo");
    }
    const validCategoryIds = uniqueIds(payload.categoryIds);
    if (validCategoryIds.length > 0) {
      const found = await Category.findAll({
        where: { id: validCategoryIds },
        attributes: ["id"],
      });
      if (found.length !== validCategoryIds.length) {
        throw new HttpError(400, "Alguna de las categorías no existe");
      }
    }
    categoryIds = validCategoryIds;
  }

  const products = await Product.findAll({
    where: { id: requestedIds },
    include: [{ model: Category, as: "categories", attributes: ["id"], through: { attributes: [] } }],
  });
  const productsById = new Map(
    products.map((product) => [product.id, product]),
  );

  const missing = requestedIds
    .filter((id) => !productsById.has(id))
    .map((id) => ({ id, motivo: "Producto no encontrado" }));

  const plan = buildBulkPlan({
    products,
    action,
    payload: categoryIds ? { ...payload, categoryIds } : payload,
  });

  const skipped = [...missing, ...plan.skipped];
  let updated = 0;

  await sequelize.transaction(async (transaction) => {
    for (const item of plan.updates) {
      const product = productsById.get(item.id);
      if (!product) {
        skipped.push({ id: item.id, motivo: "Producto no encontrado" });
        continue;
      }

      await product.update(item.values || {}, { transaction });

      if (item.categoryIds) {
        const current = (product.categories || []).map((category) => category.id);
        const next =
          item.categoryMode === "add"
            ? uniqueIds([...current, ...item.categoryIds])
            : uniqueIds(item.categoryIds);
        await product.setCategories(next, { transaction });
      }

      updated += 1;
    }
  });

  return { requested: requestedIds.length, updated, skipped };
};

const normalizeImages = (images) => {
  if (!Array.isArray(images)) {
    throw new HttpError(400, "images debe ser un arreglo");
  }
  if (images.length > MAX_IMAGES) {
    throw new HttpError(400, `Máximo ${MAX_IMAGES} imágenes por producto`);
  }

  const seen = new Set();
  const result = [];

  for (const entry of images) {
    const raw = typeof entry === "string" ? entry : entry?.url;
    const url = String(raw || "").trim();
    if (!url) throw new HttpError(400, "Cada imagen necesita una URL");

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new HttpError(400, "La URL de la imagen no es válida");
    }
    if (parsed.protocol !== "https:") {
      throw new HttpError(400, "Las imágenes deben usar https");
    }
    if (seen.has(url)) continue;
    seen.add(url);
    result.push({ url });
  }

  return result;
};

// PUT /api/admin/products/:id/images
const setImages = async ({ productId, images } = {}) => {
  const normalized = normalizeImages(images);

  await sequelize.transaction(async (transaction) => {
    const product = await Product.findByPk(productId, { transaction });
    if (!product) throw new HttpError(404, "Producto no encontrado");

    await ProductImage.destroy({
      where: { productId: product.id },
      transaction,
    });

    if (normalized.length > 0) {
      await ProductImage.bulkCreate(
        normalized.map((image, index) => ({
          productId: product.id,
          externalAssetId: null,
          url: image.url,
          position: index + 1,
          isPrimary: index === 0,
        })),
        { transaction },
      );
    }

    await product.update(
      {
        images: normalized.map((image) => image.url),
        manualOverrides: { ...(product.manualOverrides || {}), images: true },
      },
      { transaction },
    );
  });

  return catalogQuery.getAdmin(productId);
};

// POST /api/admin/products/:id/images/restore
const restoreImages = async ({ productId } = {}) => {
  const product = await Product.findByPk(productId);
  if (!product) throw new HttpError(404, "Producto no encontrado");
  if (!product.supplierProductId) {
    throw new HttpError(
      409,
      "El producto no viene de un proveedor: no hay imágenes para restaurar",
    );
  }

  const supplierProduct = await SupplierProduct.findByPk(
    product.supplierProductId,
  );
  if (!supplierProduct) {
    throw new HttpError(
      409,
      "El producto del proveedor ya no existe: no hay imágenes para restaurar",
    );
  }

  await sequelize.transaction(async (transaction) => {
    const fresh = await Product.findByPk(productId, { transaction });
    if (!fresh) throw new HttpError(404, "Producto no encontrado");

    const assets = await SupplierProductAsset.findAll({
      where: { supplierProductId: product.supplierProductId },
      transaction,
    });
    const urls = await rebuildProductImages(fresh, assets, transaction);

    const overrides = { ...(fresh.manualOverrides || {}) };
    delete overrides.images;

    await fresh.update(
      { images: urls, manualOverrides: overrides },
      { transaction },
    );
  });

  return catalogQuery.getAdmin(productId);
};

module.exports = {
  setVisibility,
  bulk,
  setImages,
  restoreImages,
  MAX_IMAGES,
};
