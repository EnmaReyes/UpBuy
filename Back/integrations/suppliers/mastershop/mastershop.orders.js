// Cliente de creacion de pedidos en MasterShop.
//
// Dos piezas:
//   - `buildOrderPayload(input)` : PURA, sin I/O. Valida y arma el cuerpo
//     exacto que exige `POST /api/orders`. Devuelve `{ payload, errors }`.
//   - `createOrder(payload, options)` : llama a la API, traduce los errores
//     segun el Anexo A y distingue reintentable de no reintentable.
//
// Montos: todo en centavos enteros. MasterShop valida que
//   total = Σ(price × quantity) + Σ(additional_charge.value)
// con aritmetica decimal. Como los precios de UpBuy son enteros en COP, se
// trabaja en centavos (enteros) y se convierte a pesos al final sin pasar por
// parseFloat. Nunca se usa Number/parseFloat sobre los montos de entrada.
const { requestJson, isConfigured, assertConfigured } = require("./mastershop.client.js");
const HttpError = require("../../../Utils/HttpError.js");
const { createLogger } = require("../../../Utils/logger.js");

const log = createLogger("mastershop.orders");

// Llaves obligatorias de cada direccion (pueden ser null, no ausentes).
const ADDRESS_KEYS = [
  "zip", "country", "city", "address1", "address2", "full_name",
  "first_name", "last_name", "phone", "company", "state", "district",
];

// Monedas legales por pais (Anexo A: COP + CO).
const CURRENCY_BY_COUNTRY = { CO: "COP" };

const isPositiveInt = (value) =>
  Number.isInteger(value) && value > 0;

const isNonNegativeInt = (value) =>
  Number.isInteger(value) && value >= 0;

const toCents = (value) => {
  // value viene ya en pesos enteros (int). Se pasa a centavos sin float.
  if (!Number.isInteger(value) || value < 0) return null;
  return value * 100;
};

const cleanText = (value, max) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return max ? text.slice(0, max) : text;
};

const ensureAddressKeys = (address, label, errors) => {
  if (!address || typeof address !== "object" || Array.isArray(address)) {
    errors.push(`${label} debe ser un objeto`);
    return null;
  }
  const result = {};
  for (const key of ADDRESS_KEYS) {
    // Ausente -> null (permitido). Presente con valor -> se conserva tal cual
    // (incluido null), para no inventar datos.
    result[key] = Object.prototype.hasOwnProperty.call(address, key)
      ? address[key]
      : null;
  }
  // Llaves sobrantes no se copian: el contrato es exactamente esas 11.
  return result;
};

// ---------------------------------------------------------------------------
// buildOrderPayload (pura)
// ---------------------------------------------------------------------------
const buildOrderPayload = (input) => {
  const errors = [];
  const data = input && typeof input === "object" ? input : {};

  // --- id_order ---
  const idOrder = cleanText(data.idOrder, 120);
  if (!idOrder) errors.push("idOrder es obligatorio");

  // --- direcciones ---
  const shippingAddress = ensureAddressKeys(
    data.shippingAddress,
    "shipping_address",
    errors,
  );
  const billingAddress = ensureAddressKeys(
    data.billingAddress,
    "billing_address",
    errors,
  );

  // --- order_transaction ---
  const tx = data.orderTransaction;
  if (!tx || typeof tx !== "object" || Array.isArray(tx)) {
    errors.push("order_transaction es obligatorio");
  }
  const paymentMethod = tx ? cleanText(tx.payment_method, 60) : null;
  const paymentGateway = tx ? cleanText(tx.payment_gateway, 60) : null;
  if (tx && !paymentMethod) errors.push("order_transaction.payment_method es obligatorio");
  if (tx && !paymentGateway) errors.push("order_transaction.payment_gateway es obligatorio");

  const country = shippingAddress ? shippingAddress.country : null;
  const expectedCurrency = country ? CURRENCY_BY_COUNTRY[country] : null;
  const currency = tx ? cleanText(tx.currency, 3) : null;
  if (tx && !currency) errors.push("order_transaction.currency es obligatorio");
  if (expectedCurrency && currency && currency !== expectedCurrency) {
    errors.push(
      `currency ${currency} no es legal para el pais ${country} (esperado ${expectedCurrency})`,
    );
  }

  // --- customer ---
  const customer = data.customer;
  if (!customer || typeof customer !== "object" || Array.isArray(customer)) {
    errors.push("customer es obligatorio");
  }
  const fullName = customer ? cleanText(customer.full_name, 255) : null;
  const firstName = customer ? cleanText(customer.first_name, 120) : null;
  const lastName = customer ? cleanText(customer.last_name, 120) : null;
  const phone = customer ? cleanText(customer.phone, 40) : null;
  const email = customer ? cleanText(customer.email, 255) : null;
  const documentType = customer ? cleanText(customer.documentType, 40) : null;
  const documentNumber = customer ? cleanText(customer.documentNumber, 60) : null;
  const tags = Array.isArray(customer?.tags)
    ? customer.tags.map((tag) => cleanText(tag, 60)).filter(Boolean)
    : [];

  if (customer) {
    if (!fullName) errors.push("customer.full_name es obligatorio");
    if (!phone) errors.push("customer.phone es obligatorio");
    // documentType y documentNumber: ambos o ninguno.
    if ((documentType && !documentNumber) || (!documentType && documentNumber)) {
      errors.push("documentType y documentNumber deben venir ambos o ninguno");
    }
  }

  // --- order_items ---
  const rawItems = Array.isArray(data.orderItems) ? data.orderItems : null;
  if (!rawItems) errors.push("order_items debe ser un array");
  if (rawItems && rawItems.length === 0) errors.push("order_items no puede estar vacio");

  const items = [];
  const seen = new Set();
  let itemsTotalCents = 0;

  if (rawItems) {
    rawItems.forEach((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push(`order_items[${index}] debe ser un objeto`);
        return;
      }

      const idProduct = item.id_product;
      if (!isPositiveInt(idProduct)) {
        errors.push(`order_items[${index}].id_product debe ser entero positivo`);
      }

      const hasVariants = Boolean(item.hasVariants);
      const idVariant = item.id_variant;
      if (hasVariants) {
        if (!isPositiveInt(idVariant)) {
          errors.push(
            `order_items[${index}].id_variant es obligatorio porque el producto tiene variantes`,
          );
        }
      } else if (idVariant !== undefined && idVariant !== null) {
        if (!isPositiveInt(idVariant)) {
          errors.push(`order_items[${index}].id_variant invalido`);
        }
      }

      const quantity = item.quantity;
      if (!isPositiveInt(quantity)) {
        errors.push(`order_items[${index}].quantity debe ser entero mayor a 0`);
      }

      const price = item.price;
      if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
        errors.push(`order_items[${index}].price debe ser numero no negativo`);
      }

      const name = cleanText(item.name, 255);
      if (!name) errors.push(`order_items[${index}].name es obligatorio`);

      const sku = cleanText(item.sku, 255);
      const weight = item.weight;
      if (weight !== undefined && weight !== null && (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0)) {
        errors.push(`order_items[${index}].weight invalido`);
      }

      // Duplicados sin consolidar.
      const key = `${idProduct}|${idVariant ?? ""}`;
      if (seen.has(key)) {
        errors.push(`order_items tiene duplicado sin consolidar: ${key}`);
      }
      seen.add(key);

      // Suma en centavos (enteros): nunca float.
      if (isPositiveInt(quantity) && typeof price === "number" && Number.isFinite(price) && price >= 0) {
        const priceCents = Math.round(price * 100);
        itemsTotalCents += priceCents * quantity;
      }

      items.push({
        id_product: idProduct,
        ...(hasVariants || idVariant !== undefined && idVariant !== null
          ? { id_variant: idVariant }
          : {}),
        quantity,
        sku: sku || null,
        name,
        weight: weight === undefined || weight === null ? 0 : weight,
        price,
      });
    });
  }

  // --- additional_charge ---
  const rawCharges = Array.isArray(data.additionalCharge)
    ? data.additionalCharge
    : Array.isArray(data.additional_charge)
      ? data.additional_charge
      : [];
  const additionalCharge = [];
  let chargesTotalCents = 0;
  rawCharges.forEach((charge, index) => {
    if (!charge || typeof charge !== "object" || Array.isArray(charge)) {
      errors.push(`additional_charge[${index}] debe ser un objeto`);
      return;
    }
    const typeCharge = cleanText(charge.type_charge || charge.type, 60);
    const value = charge.value;
    if (!typeCharge) errors.push(`additional_charge[${index}].type_charge es obligatorio`);
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      errors.push(`additional_charge[${index}].value debe ser numero no negativo`);
    }
    const valueCents = typeof value === "number" && Number.isFinite(value) && value >= 0
      ? Math.round(value * 100)
      : 0;
    chargesTotalCents += valueCents;
    additionalCharge.push({
      type_charge: typeCharge,
      value,
    });
  });

  // --- total ---
  const expectedTotalCents = itemsTotalCents + chargesTotalCents;
  const declaredTotal = tx && tx.total;
  if (tx) {
    if (typeof declaredTotal !== "number" || !Number.isFinite(declaredTotal) || declaredTotal < 0) {
      errors.push("order_transaction.total debe ser numero no negativo");
    } else {
      const declaredCents = Math.round(declaredTotal * 100);
      if (declaredCents !== expectedTotalCents) {
        errors.push(
          `total no coincide: declarado ${declaredTotal}, esperado ${(expectedTotalCents / 100).toFixed(2)}`,
        );
      }
    }
  }

  // --- notes ---
  const notes = Array.isArray(data.notes)
    ? data.notes.map((note) => cleanText(note, 500)).filter(Boolean)
    : [];

  // Si hubo errores, no se arma payload (evita enviar basura).
  if (errors.length > 0) {
    return { payload: null, errors };
  }

  const payload = {
    id_order: idOrder,
    shipping_address: shippingAddress,
    billing_address: billingAddress,
    order_transaction: {
      total: Number((expectedTotalCents / 100).toFixed(2)),
      currency,
      payment_method: paymentMethod,
      payment_gateway: paymentGateway,
    },
    customer: {
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      phone,
      email,
      documentType,
      documentNumber,
      tags,
    },
    order_items: items.map((item) => ({
      id_product: item.id_product,
      ...(item.id_variant !== undefined ? { id_variant: item.id_variant } : {}),
      quantity: item.quantity,
      sku: item.sku,
      name: item.name,
      weight: item.weight,
      price: item.price,
    })),
    additional_charge: additionalCharge,
    notes,
    tags: Array.isArray(data.tags)
      ? data.tags.map((tag) => cleanText(tag, 60)).filter(Boolean)
      : [],
  };

  return { payload, errors: [] };
};

// ---------------------------------------------------------------------------
// createOrder (HTTP)
// ---------------------------------------------------------------------------
const isDuplicateMessage = (text) =>
  typeof text === "string" && text.includes("Código 409 - La orden ya existe");

const createOrder = async (payload, options = {}) => {
  assertConfigured();

  const correlationId = options.correlationId || null;
  const reference = options.reference || null;
  const startedAt = Date.now();

  let response;
  try {
    response = await requestJson("POST", "/api/orders", { body: payload });
  } catch (error) {
    const status = error.upstreamStatus || error.status || 0;
    const body = error.upstreamBody || null;
    const message = (body && (body.error || body.message)) || error.message || "";
    const latencyMs = Date.now() - startedAt;

    // 400: error de validacion del esquema, no reintentar.
    if (status === 400) {
      const validationErrors = Array.isArray(body?.data)
        ? body.data.map((entry) => ({
            path: Array.isArray(entry?.path) ? entry.path : [entry?.path],
            message: entry?.message || "invalido",
          }))
        : [];
      log.warn("createOrder rechazado por validacion", {
        correlationId,
        reference,
        status,
        latencyMs,
        errors: validationErrors,
      });
      return {
        ok: false,
        idOrder: null,
        status: "rejected",
        raw: body,
        retryable: false,
        configError: false,
        validationErrors,
      };
    }

    // 401/403: configuracion, no reintentar, alertar.
    if (status === 401 || status === 403) {
      log.error("createOrder error de configuracion (llave)", {
        correlationId,
        reference,
        status,
        latencyMs,
      });
      return {
        ok: false,
        idOrder: null,
        status: "config_error",
        raw: body,
        retryable: false,
        configError: true,
      };
    }

    // 429: respetar RateLimit-Reset.
    if (status === 429) {
      log.warn("createOrder rate limit", {
        correlationId,
        reference,
        status,
        latencyMs,
        retryAfterSeconds: error.retryAfterSeconds || null,
      });
      return {
        ok: false,
        idOrder: null,
        status: "rate_limited",
        raw: body,
        retryable: true,
        retryAfterSeconds: error.retryAfterSeconds || null,
      };
    }

    // 500 con duplicado: tratar como exito idempotente.
    if (status >= 500 && isDuplicateMessage(message)) {
      log.info("createOrder duplicado (idempotente)", {
        correlationId,
        reference,
        status,
        latencyMs,
      });
      return {
        ok: true,
        idOrder: null,
        status: "duplicate",
        raw: body,
        retryable: false,
        idempotent: true,
      };
    }

    // Otros 5xx: reintentar.
    if (status >= 500) {
      log.warn("createOrder error de proveedor (reintentable)", {
        correlationId,
        reference,
        status,
        latencyMs,
      });
      return {
        ok: false,
        idOrder: null,
        status: "server_error",
        raw: body,
        retryable: true,
      };
    }

    // Timeout / red / otros: reintentable por defecto.
    log.warn("createOrder fallo (reintentable)", {
      correlationId,
      reference,
      status,
      latencyMs,
      error: error.message,
    });
    return {
      ok: false,
      idOrder: null,
      status: "network_error",
      raw: body,
      retryable: true,
    };
  }

  const latencyMs = Date.now() - startedAt;
  const data = response || {};
  log.info("createOrder ok", {
    correlationId,
    reference,
    status: data.status || null,
    idOrder: data.idOrder || null,
    latencyMs,
  });

  return {
    ok: true,
    idOrder: data.idOrder || null,
    status: data.status || null,
    raw: data,
    retryable: false,
  };
};

// Consulta un pedido existente (por idOrder o externalOrderId).
const getOrder = async ({ idOrder, externalOrderId } = {}) => {
  const params = {};
  if (idOrder !== undefined && idOrder !== null && idOrder !== "") params.idOrder = idOrder;
  if (externalOrderId) params.externalOrderId = externalOrderId;
  if (!Object.keys(params).length) {
    throw new HttpError(400, "Falta idOrder o externalOrderId");
  }
  const data = await requestJson("GET", "/api/orders", { params });
  // La API devuelve un objeto o un array segun el endpoint.
  if (Array.isArray(data)) return data.length ? data[0] : null;
  if (data && Array.isArray(data.results)) return data.results.length ? data.results[0] : null;
  return data || null;
};

// Lista pedidos de MasterShop en un rango de fechas (para conciliacion).
// Anexo A: POST /api/orders/list?page=1&limit=20 con startDate/finalDate.
// Sin filtros solo devuelve los ultimos 7 días.
const listOrders = async ({ page = 1, limit = 20, startDate, finalDate } = {}) => {
  const params = { page, limit };
  const body = {};
  if (startDate) body.startDate = startDate;
  if (finalDate) body.finalDate = finalDate;
  return requestJson("POST", "/api/orders/list", { params, body });
};

module.exports = {
  ADDRESS_KEYS,
  CURRENCY_BY_COUNTRY,
  buildOrderPayload,
  createOrder,
  getOrder,
  listOrders,
  isDuplicateMessage,
};
