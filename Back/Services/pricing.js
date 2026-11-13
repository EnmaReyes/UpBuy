const { Product } = require("../DataBase/models/index.js");
const HttpError = require("../Utils/HttpError.js");
const {
  resolvePrice,
  COMBO_TIPO,
  aplicarDescuento,
  buildPriceSnapshot,
  PRODUCT_TYPES,
} = require("./prices.js");

// El precio y la disponibilidad SIEMPRE se resuelven en el backend.
// Lo que envíe el cliente (cost, precio, total) se ignora por completo.

const MAX_ITEMS = 50;
const MAX_QUANTITY = 20;

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const firstImage = (value) => {
  if (Array.isArray(value)) return value[0] || null;
  if (typeof value === "string" && value.trim()) return value;
  return null;
};

const parseQuantity = (quantity) => {
  const parsed = Number(quantity);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new HttpError(400, "Cantidad inválida");
  }
  if (parsed > MAX_QUANTITY) {
    throw new HttpError(400, `Máximo ${MAX_QUANTITY} unidades por producto`);
  }
  return parsed;
};

// ----------------------------- Productos --------------------------------
// `allowUnavailable` lo usa la importacion CSV: al registrar ventas ya
// registradas (presencial, WhatsApp, cuaderno del proveedor) el producto
// puede estar archivado o sin stock, y eso NO debe impedir registrar la
// venta. El PRECIO sigue viniendo del catalogo: nunca del archivo.
const resolveProduct = async (item, transaction, { allowUnavailable = false } = {}) => {
  const quantity = parseQuantity(item.quantity);

  const product = await Product.findByPk(item.productId, {
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });

  if (!product) {
    throw new HttpError(404, "El producto ya no existe");
  }
  if (!allowUnavailable) {
    if (!product.active) {
      throw new HttpError(409, `"${product.name}" no está disponible`);
    }
    if (Number(product.stock) < quantity) {
      throw new HttpError(409, `"${product.name}" está agotado`);
    }
  }

  // La talla es una medida: solo se pide si el producto ofrece tallas.
  // Un combo (o un producto sin tallas, como un accesorio) no la pide.
  let size = null;
  const sizes = toArray(product.sizes).map((s) => String(s));

  if (!product.combo && sizes.length > 0) {
    const requested = String(item.size || "").trim();
    if (!requested) {
      throw new HttpError(400, `Selecciona una talla para "${product.name}"`);
    }
    if (!sizes.includes(requested)) {
      throw new HttpError(
        400,
        `La talla "${requested}" no está disponible para "${product.name}"`,
      );
    }
    size = requested;
  }

  const kind = product.combo ? "combo" : "unit";
  const tipo = product.combo ? COMBO_TIPO : "basico";

  const price = await resolvePrice({
    productId: product.id,
    tipo,
    kind,
    transaction,
  });

  const resultado = aplicarDescuento(price.precio, product.descuentoPorcentaje);
  const unitPrice = resultado.precioFinal;
  const snapshot = {
    ...buildPriceSnapshot(price, "product", tipo, kind),
    precioOriginal: resultado.precioOriginal,
    precioFinal: resultado.precioFinal,
    descuentoPorcentaje: resultado.descuentoPorcentaje,
    descuentoUnitario: resultado.descuentoUnitario,
  };

  return {
    line: {
      productType: PRODUCT_TYPES[0],
      productId: product.id,
      variantId: null,
      title: product.name,
      imageUrl: firstImage(product.images),
      size,
      shirtColor: null,
      shirtName: null,
      dtfSize: null,
      unitPrice,
      unitCost: Number(product.cost) || 0,
      providerSku: product.providerSku || null,
      nameSnapshot: product.name,
      quantity,
      lineTotal: unitPrice * quantity,
      productSnapshot: { ...product.toJSON() },
      priceSnapshot: snapshot,
    },
    discount: 0,
  };
};

// ---------------------------- Linea externa ------------------------------
// Una linea que NO viene del catalogo: la usa la importacion CSV para
// registrar ventas de productos que UpBuy todavia no publica (o que ya no
// estan disponibles). El precio lo pone el archivo, no el navegador.
//
// Solo se acepta si el llamador pasa `allowExternal: true`. El checkout web
// NUNCA lo hace: ahi el precio siempre se resuelve en el backend.
const resolveExternalProduct = (item) => {
  const quantity = parseQuantity(item.quantity);

  const title = String(item.title || "").trim().slice(0, 255);
  if (!title) {
    throw new HttpError(400, "El producto de la línea externa no tiene nombre");
  }

  const unitPrice = Number(item.unitPrice);
  if (!Number.isInteger(unitPrice) || unitPrice < 0) {
    throw new HttpError(400, "El precio de la línea externa no es válido");
  }

  const unitCost = Number(item.unitCost || 0);
  if (!Number.isInteger(unitCost) || unitCost < 0) {
    throw new HttpError(400, "El costo de la línea externa no es válido");
  }

  return {
    line: {
      productType: PRODUCT_TYPES[0],
      productId: null,
      variantId: null,
      title,
      imageUrl: null,
      size: item.size ? String(item.size).trim().slice(0, 50) : null,
      shirtColor: null,
      shirtName: null,
      dtfSize: null,
      unitPrice,
      unitCost,
      providerSku: null,
      nameSnapshot: title,
      quantity,
      lineTotal: unitPrice * quantity,
      productSnapshot: { source: "external", title },
      priceSnapshot: {
        source: "external",
        productType: PRODUCT_TYPES[0],
        tipo: "basico",
        kind: "unit",
        precio: unitPrice,
        precioAnterior: null,
      },
    },
    discount: 0,
  };
};

// ------------------------------ Carrito ---------------------------------
const buildOrderLines = async (items, transaction, options = {}) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, "El carrito está vacío");
  }
  if (items.length > MAX_ITEMS) {
    throw new HttpError(400, "Demasiados productos en el pedido");
  }

  const lines = [];
  let subtotal = 0;
  let discountTotal = 0;

  for (const rawItem of items) {
    const item = rawItem || {};
    const productType = String(
      item.productType || item.type || "product",
    ).toLowerCase();
    const productId = item.productId || item.id;

    // Linea externa (importacion CSV): el precio viene del archivo.
    if (!productId && item.external) {
      if (!options.allowExternal) {
        throw new HttpError(400, "Línea externa no permitida en esta operación");
      }
      const resolved = resolveExternalProduct(item);
      lines.push(resolved.line);
      subtotal += resolved.line.lineTotal;
      discountTotal += resolved.discount;
      continue;
    }

    if (!productId) {
      throw new HttpError(400, "Falta el producto en uno de los ítems");
    }

    if (!PRODUCT_TYPES.includes(productType) && productType !== "article") {
      throw new HttpError(400, "Tipo de producto inválido");
    }

    const resolved = await resolveProduct(
      { ...item, productId },
      transaction,
      options,
    );

    lines.push(resolved.line);
    subtotal += resolved.line.lineTotal;
    discountTotal += resolved.discount;
  }

  return { lines, subtotal, discountTotal };
};

module.exports = {
  buildOrderLines,
  firstImage,
  resolveProduct,
  resolveExternalProduct,
  MAX_ITEMS,
  MAX_QUANTITY,
};
