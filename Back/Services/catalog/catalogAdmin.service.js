// Acciones administrativas del catalogo UPBUY: visibilidad, lotes e imagenes.
//
// La logica de decision vive en visibility.service (puro). Este servicio solo
// resuelve filas, valida entradas y aplica el plan en la base.
const {
  sequelize,
  Product,
  Category,
  ProductImage,
  Supplier,
  SupplierProduct,
  SupplierProductAsset,
  AuditLog,
} = require("../../DataBase/models/index.js");
const {
  PRODUCT_STATUS,
  PRODUCT_STATUS_VALUES,
  PRODUCT_BULK_ACTION,
  PRODUCT_PROVIDER_VALUES,
} = require("../../DataBase/models/enums.js");
const { buildBulkPlan } = require("./visibility.service.js");
const { rebuildProductImages } = require("./catalogSync.service.js");
const catalogQuery = require("./catalogQuery.service.js");
const HttpError = require("../../Utils/HttpError.js");
const { createLogger } = require("../../Utils/logger.js");
const { normalizeProductSlug } = require("./productIdentity.service.js");
const { RESTORE_FIELDS } = require("./productOwnership.service.js");

const log = createLogger("catalogAdmin");

const MAX_IMAGES = 8;

// Alias local: alta y edicion comparten la misma definicion canonica de slug.
const normalizeSlug = normalizeProductSlug;

// Normaliza la lista de imagenes del alta. Acepta strings o `{ url }`.
const normalizeCreateImages = (images) => {
  if (images === undefined || images === null) return [];
  if (!Array.isArray(images)) {
    throw new HttpError(400, "images debe ser un arreglo");
  }
  if (images.length > MAX_IMAGES) {
    throw new HttpError(400, `Maximo ${MAX_IMAGES} imagenes por producto`);
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
      throw new HttpError(400, "La URL de la imagen no es valida");
    }
    if (parsed.protocol !== "https:") {
      throw new HttpError(400, "Las imagenes deben usar https");
    }
    if (seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
};

const toInt = (value, fallback = 0) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Moneda ISO de 3 letras. Si llega algo invalido se usa COP: nunca se guarda
// un codigo a medias en la columna CHAR(3).
const CURRENCY_CODE = /^[A-Z]{3}$/;
const normalizeCurrency = (value) => {
  const code = String(value || "COP").trim().toUpperCase();
  return CURRENCY_CODE.test(code) ? code : "COP";
};

// Tallas: lista corta, sin vacios ni repetidos, cada una acotada al ancho util
// de la ficha publica.
const MAX_SIZES = 50;
const normalizeSizes = (sizes) => {
  if (sizes === undefined || sizes === null) return [];
  if (!Array.isArray(sizes)) {
    throw new HttpError(400, "sizes debe ser un arreglo");
  }
  const seen = new Set();
  const result = [];
  for (const raw of sizes) {
    const size = String(raw ?? "").trim();
    if (!size || seen.has(size)) continue;
    seen.add(size);
    result.push(size.slice(0, 40));
    if (result.length >= MAX_SIZES) break;
  }
  return result;
};

// POST /api/admin/products  (alta manual)
const createProduct = async ({ patch = {}, uid = null, ip = null } = {}) => {
  const sku = String(patch.sku || "").trim();
  const name = String(patch.name || "").trim().slice(0, 255);
  const price = Math.max(0, Math.round(Number(patch.price)));
  const cost = Math.max(0, Math.round(Number(patch.cost) || 0));
  // Markup derivado del costo y el precio final: el admin fija los montos y el
  // backend mantiene el porcentaje coherente. Sin costo no hay base de calculo.
  const markup =
    cost > 0
      ? Math.min(1000, Math.max(0, Math.round(((price - cost) / cost) * 100)))
      : 0;

  if (!sku) throw new HttpError(400, "El SKU es obligatorio");
  if (sku.length > 100) {
    throw new HttpError(400, "El SKU no puede superar 100 caracteres");
  }
  if (!name) throw new HttpError(400, "El nombre es obligatorio");
  if (patch.price === undefined || patch.price === null || patch.price === "") {
    throw new HttpError(400, "El precio es obligatorio");
  }
  if (!Number.isFinite(price)) {
    throw new HttpError(400, "El precio debe ser un numero valido");
  }

  // SKU unico: es el identificador canonico de la tienda.
  const skuTaken = await Product.findOne({
    where: { sku },
    attributes: ["id"],
  });
  if (skuTaken) throw new HttpError(409, "Ya existe un producto con ese SKU");

  // Slug unico (solo si se envia).
  let slug = null;
  if (patch.slug !== undefined && patch.slug !== null && String(patch.slug).trim() !== "") {
    slug = normalizeSlug(patch.slug);
    const slugTaken = await Product.findOne({
      where: { slug },
      attributes: ["id"],
    });
    if (slugTaken) throw new HttpError(409, "Ya existe un producto con ese slug");
  }

  // Proveedor de origen: `manual` por defecto, un slug conocido o uno nuevo
  // escrito desde el panel (por ejemplo un proveedor propio todavia no
  // registrado). Solo aceptamos slugs simples para no ensuciar la columna.
  const providerInput = String(patch.provider || "").trim().toLowerCase();
  const provider =
    PRODUCT_PROVIDER_VALUES.includes(providerInput) ||
    /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(providerInput)
      ? providerInput.slice(0, 60)
      : "manual";

  // Proveedor asignado (opcional): debe existir y estar activo.
  let supplierId = null;
  if (patch.supplierId) {
    const supplier = await Supplier.findByPk(String(patch.supplierId), {
      attributes: ["id", "isActive"],
    });
    if (!supplier) throw new HttpError(400, "El proveedor asignado no existe");
    if (!supplier.isActive) {
      throw new HttpError(400, "El proveedor asignado esta inactivo");
    }
    supplierId = supplier.id;
  }

  const status = PRODUCT_STATUS_VALUES.includes(String(patch.status))
    ? String(patch.status)
    : PRODUCT_STATUS.DRAFT;
  const active = patch.active === undefined ? true : Boolean(patch.active);

  let descuentoPorcentaje = null;
  if (
    patch.descuentoPorcentaje !== undefined &&
    patch.descuentoPorcentaje !== null &&
    patch.descuentoPorcentaje !== ""
  ) {
    const parsed = Math.trunc(Number(patch.descuentoPorcentaje));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      throw new HttpError(400, "El descuento debe estar entre 0 y 100");
    }
    descuentoPorcentaje = parsed;
  }

  let compareAtPrice = null;
  if (
    patch.compareAtPrice !== undefined &&
    patch.compareAtPrice !== null &&
    patch.compareAtPrice !== ""
  ) {
    compareAtPrice = Math.max(0, Math.round(Number(patch.compareAtPrice)));
  }

  const images = normalizeCreateImages(patch.images);
  const sizes = normalizeSizes(patch.sizes);
  const currency = normalizeCurrency(patch.currency);
  const categoryIds = Array.isArray(patch.categoryIds) ? patch.categoryIds : [];

  // Las categorias se validan antes de abrir la transaccion: un id invalido no
  // debe dejar el producto a medio crear.
  let categories = [];
  if (categoryIds.length > 0) {
    categories = await Category.findAll({
      where: { id: categoryIds },
      attributes: ["id"],
    });
    if (categories.length !== categoryIds.length) {
      throw new HttpError(400, "Alguna de las categorias no existe");
    }
  }

  const overrides =
    patch.manualOverrides && typeof patch.manualOverrides === "object"
      ? { ...patch.manualOverrides }
      : {};

  const publishedAt =
    status === PRODUCT_STATUS.ACTIVE && active ? new Date() : null;

  let product;
  await sequelize.transaction(async (transaction) => {
    try {
      product = await Product.create(
        {
          sku,
          slug,
          name,
          description: patch.description
            ? String(patch.description).trim()
            : null,
          images,
          cost,
          markup,
          price,
          compareAtPrice,
          currency,
          stock: Math.max(0, toInt(patch.stock, 0)),
          active,
          status,
          provider,
          providerSku: patch.providerSku
            ? String(patch.providerSku).trim().slice(0, 100)
            : null,
          sizes,
          destacadas: Boolean(patch.destacadas),
          combo: Boolean(patch.combo),
          descuentoPorcentaje,
          manualOverrides: overrides,
          publishedAt,
          supplierId,
          uid,
        },
        { transaction },
      );
    } catch (error) {
      // Condicion de carrera: otra peticion pudo insertar el mismo SKU/slug
      // entre la comprobacion previa y este insert. Se traduce al mismo 409.
      if (error?.name === "SequelizeUniqueConstraintError") {
        const field = String(error?.errors?.[0]?.path || "");
        if (field.includes("slug")) {
          throw new HttpError(409, "Ya existe un producto con ese slug");
        }
        throw new HttpError(409, "Ya existe un producto con ese SKU");
      }
      throw error;
    }

    // Galeria normalizada (misma forma que usa la edicion de imagenes).
    if (images.length > 0) {
      await ProductImage.bulkCreate(
        images.map((url, index) => ({
          productId: product.id,
          externalAssetId: null,
          url,
          position: index + 1,
          isPrimary: index === 0,
        })),
        { transaction },
      );
    }

    if (categories.length > 0) {
      await product.setCategories(
        categories.map((row) => row.id),
        { transaction },
      );
    }

    // Auditoria: el alta es una accion sensible del panel. Igual que en los
    // pedidos, un fallo al auditar no revierte la creacion.
    try {
      await AuditLog.create(
        {
          userId: uid || null,
          entity: "product",
          entityId: product.id,
          action: "create",
          before: null,
          after: {
            sku: product.sku,
            name: product.name,
            status: product.status,
            active: product.active,
            provider: product.provider,
            supplierId: product.supplierId,
          },
          ip: ip || null,
        },
        { transaction },
      );
    } catch (error) {
      log.error("No se pudo auditar la creacion del producto", {
        productId: product.id,
        error: error.message,
      });
    }
  });

  log.info("Producto creado manualmente", {
    productId: product.id,
    sku: product.sku,
    provider: product.provider,
    supplierId: product.supplierId,
  });

  return catalogQuery.getAdmin(product.id);
};

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
    // Primera publicacion: la ventana de "Novedades" empieza a contar aqui.
    ...(visible && !product.publishedAt ? { publishedAt: new Date() } : {}),
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

      // Publicar en lote tambien fija la primera fecha de publicacion.
      const values = item.values || {};
      if (
        values.status === PRODUCT_STATUS.ACTIVE &&
        values.active === true &&
        !product.publishedAt
      ) {
        await product.update({ publishedAt: new Date() }, { transaction });
      }

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

// Devuelve al proveedor el control de los campos que el admin habia
// personalizado. `fields` vacio u omitido restaura todos los overrides.
const restoreSync = async ({ productId, fields, uid = null } = {}) => {
  const product = await Product.findByPk(productId);
  if (!product) throw new HttpError(404, "Producto no encontrado");

  let requested = RESTORE_FIELDS;
  if (fields !== undefined && fields !== null) {
    if (!Array.isArray(fields)) {
      throw new HttpError(400, "fields debe ser un arreglo");
    }
    requested = [...new Set(fields.map(String))];
    const invalid = requested.filter((field) => !RESTORE_FIELDS.includes(field));
    if (invalid.length > 0) {
      throw new HttpError(400, `Campos no restaurables: ${invalid.join(", ")}`);
    }
  }

  const before = { ...(product.manualOverrides || {}) };
  const after = { ...before };
  for (const field of requested) delete after[field];

  await sequelize.transaction(async (transaction) => {
    await product.update({ manualOverrides: after }, { transaction });
    try {
      await AuditLog.create(
        {
          userId: uid || null,
          entity: "product",
          entityId: product.id,
          action: "restore_sync",
          before,
          after,
          ip: null,
        },
        { transaction },
      );
    } catch (error) {
      log.error("No se pudo auditar la restauracion de sincronizacion", {
        productId: product.id,
        error: error.message,
      });
    }
  });

  log.info("Sincronizacion restaurada", {
    productId: product.id,
    fields: requested,
    uid,
  });

  return catalogQuery.getAdmin(product.id);
};

module.exports = {
  createProduct,
  setVisibility,
  bulk,
  setImages,
  restoreImages,
  restoreSync,
  MAX_IMAGES,
};
