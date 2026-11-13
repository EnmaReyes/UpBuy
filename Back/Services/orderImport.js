// ---------------------------------------------------------------------------
// Importacion de ventas desde CSV (ADM-3).
//
// Registra ventas que NO vienen de la tienda: ventas presenciales, ventas por
// WhatsApp o pedidos de un proveedor que no tiene API.
//
// Reglas que este modulo respeta (ver AGENTS.md y ADMIN_DASHBOARD_PROMPT.md):
//
//   1. IDEMPOTENCIA. Cada pedido importado guarda `externalRef` (la columna
//      `ref_externa` del archivo). La pareja (channel, externalRef) es unica:
//      reimportar el mismo archivo NO duplica pedidos.
//
//   2. EL PRECIO LO CALCULA EL BACKEND. Si la fila apunta a un producto del
//      catalogo, el precio sale del catalogo (el total del archivo solo se usa
//      para comparar y avisar de la diferencia). Si el producto no existe en el
//      catalogo, la linea es "externa" y su precio viene del archivo: es la
//      unica fuente posible para una venta que UpBuy no publica.
//
//   3. EL ARCHIVO NO MANDA SOBRE LAS REGLAS. Un estado desconocido, una talla
//      que no existe o un metodo de pago invalido invalidan la fila, no el
//      archivo. Las filas validas se importan aunque otras fallen.
//
//   4. NUNCA SE TOCAN PEDIDOS WEB. La importacion solo crea pedidos nuevos
//      con canal "otro"; nunca modifica uno existente.
//
//   5. LAS ESTADOS SON LOS CANONICOS. `fulfillmentStatus` y `paymentState`
//      se escriben con los valores canonicos; los textos del archivo se
//      traducen con los mapas de abajo (nunca se guarda un string crudo).
// ---------------------------------------------------------------------------

const { Op } = require("sequelize");
const {
  Order,
  Product,
  FULFILLMENT_STATUS,
  FULFILLMENT_STATUS_VALUES,
  PAYMENT_STATE,
  PAYMENT_STATE_VALUES,
  PAYMENT_METHOD,
  PAYMENT_METHOD_VALUES,
  SALE_CHANNEL,
  STATUS_SOURCE,
} = require("../DataBase/models/index.js");
const { createManualOrder } = require("./orders.js");
const { buildOrderLines, MAX_QUANTITY } = require("./pricing.js");
const HttpError = require("../Utils/HttpError.js");

// Limites de la importacion (ver ADMIN_DASHBOARD_PROMPT.md, ADM-3).
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 2000;

// Canal de las ventas importadas. Nunca "web": un pedido importado es una
// venta externa y no puede chocar con los pedidos de la tienda.
const IMPORT_CHANNEL = SALE_CHANNEL.OTRO;

// ---------------------------------------------------------------------------
// Lectura del CSV
// ---------------------------------------------------------------------------

// Cabeceras aceptadas. Se normaliza el nombre (minusculas, sin tildes, sin
// signos) y se busca en esta tabla. El orden no importa.
const COLUMN_ALIASES = {
  date: ["fecha", "fecha_venta", "fecha_pedido", "date"],
  name: ["nombre", "name", "cliente", "nombre_cliente", "comprador"],
  phone: [
    "telefono",
    "phone",
    "celular",
    "movil",
    "telefono_cliente",
    "telefono_contacto",
  ],
  email: ["email", "correo", "correo_electronico"],
  address: ["direccion", "address", "direccion_envio"],
  city: ["ciudad", "city", "municipio"],
  department: ["departamento", "department"],
  sku: ["sku", "codigo", "codigo_producto", "sku_producto", "referencia_producto"],
  product: [
    "producto",
    "product",
    "nombre_producto",
    "descripcion_producto",
    "articulo",
  ],
  size: ["talla", "size", "tamano", "talla_producto"],
  quantity: ["cantidad", "qty", "quantity", "unidades", "cant"],
  total: ["total", "valor_total", "total_pedido", "monto", "valor"],
  providerCost: [
    "costo_proveedor",
    "costo",
    "costo_proveedor_total",
    "costo_del_proveedor",
  ],
  paymentMethod: [
    "metodo_pago",
    "metodo",
    "forma_pago",
    "payment_method",
    "modo_pago",
  ],
  status: ["estado", "estado_pedido", "status"],
  paymentStatus: [
    "estado_pago",
    "estado_del_pago",
    "pago",
    "payment_status",
  ],
  tracking: ["guia", "guia_envio", "numero_guia", "tracking", "tracking_number"],
  carrier: ["transportadora", "carrier", "courier"],
  notes: ["notas", "notes", "observaciones", "nota"],
  externalRef: [
    "ref_externa",
    "referencia_externa",
    "external_ref",
    "ref",
    "referencia",
  ],
};

const ALIAS_TO_FIELD = new Map();
for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
  for (const alias of aliases) ALIAS_TO_FIELD.set(alias, field);
}

// "Total" del archivo: estado logistico (que pasa el pedido).
const FULFILLMENT_ALIASES = {
  pendiente: FULFILLMENT_STATUS.PENDING_PAYMENT,
  pendiente_pago: FULFILLMENT_STATUS.PENDING_PAYMENT,
  pending_payment: FULFILLMENT_STATUS.PENDING_PAYMENT,
  unpaid: FULFILLMENT_STATUS.PENDING_PAYMENT,
  pagado: FULFILLMENT_STATUS.PAID,
  paid: FULFILLMENT_STATUS.PAID,
  en_preparacion: FULFILLMENT_STATUS.PACKING,
  preparacion: FULFILLMENT_STATUS.PACKING,
  packing: FULFILLMENT_STATUS.PACKING,
  enviado: FULFILLMENT_STATUS.SHIPPED,
  shipped: FULFILLMENT_STATUS.SHIPPED,
  entregado: FULFILLMENT_STATUS.DELIVERED,
  delivered: FULFILLMENT_STATUS.DELIVERED,
  cancelado: FULFILLMENT_STATUS.CANCELLED,
  cancelled: FULFILLMENT_STATUS.CANCELLED,
};

// "Estado de pago" del archivo: estado del dinero.
const PAYMENT_STATE_ALIASES = {
  pendiente: PAYMENT_STATE.UNPAID,
  unpaid: PAYMENT_STATE.UNPAID,
  por_cobrar: PAYMENT_STATE.PENDING_COLLECTION,
  pendiente_cobro: PAYMENT_STATE.PENDING_COLLECTION,
  pending_collection: PAYMENT_STATE.PENDING_COLLECTION,
  cobrado: PAYMENT_STATE.COLLECTED,
  collected: PAYMENT_STATE.COLLECTED,
  liquidado: PAYMENT_STATE.SETTLED,
  pagado: PAYMENT_STATE.SETTLED,
  settled: PAYMENT_STATE.SETTLED,
  reembolsado: PAYMENT_STATE.REFUNDED,
  refunded: PAYMENT_STATE.REFUNDED,
};

// Metodos de pago (ventas manuales).
const PAYMENT_METHOD_ALIASES = {
  efectivo: PAYMENT_METHOD.EFECTIVO,
  contado: PAYMENT_METHOD.EFECTIVO,
  efectivo_contado: PAYMENT_METHOD.EFECTIVO,
  nequi: PAYMENT_METHOD.NEQUI,
  transferencia: PAYMENT_METHOD.TRANSFERENCIA,
  consignacion: PAYMENT_METHOD.TRANSFERENCIA,
  tarjeta: PAYMENT_METHOD.TARJETA,
  credito: PAYMENT_METHOD.TARJETA,
  otro: PAYMENT_METHOD.OTRO,
};

const normalizeHeader = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const normalizeKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-_.]+/g, "_");

// Detecta el separador: coma, punto y coma o tabulador. Se mira la primera
// linea fuera de comillas (Excel en espanol suele exportar con ";").
const detectDelimiter = (text) => {
  const firstLine = String(text).split(/\r?\n/, 1)[0] || "";
  const counts = { ",": 0, ";": 0, "\t": 0 };

  let inQuotes = false;
  for (const char of firstLine) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (char in counts) counts[char] += 1;
  }

  const [best, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return count > 0 ? best : ",";
};

// Parser CSV: comillas dobles, comillas escapadas (""), saltos de linea
// dentro del campo y BOM inicial.
const parseCsv = (text) => {
  const clean = String(text || "").replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(clean);

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];

    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (char === "\r") continue;

    field += char;
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter(
    (line) => line.some((cell) => String(cell || "").trim() !== ""),
  );
};

// Convierte las filas en objetos con los nombres canonicos.
const readRecords = (rows) => {
  if (rows.length === 0) {
    throw new HttpError(400, "El archivo CSV está vacío");
  }

  const headers = rows[0].map(normalizeHeader);
  const fields = headers.map((header) => ALIAS_TO_FIELD.get(header) || null);

  const known = fields.filter(Boolean);
  if (known.length === 0) {
    throw new HttpError(
      400,
      "El archivo no tiene columnas reconocibles (revisa la plantilla)",
    );
  }

  const records = [];
  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i];
    const record = { row: i + 1, values: {} };

    fields.forEach((field, index) => {
      if (!field) return;
      const value = String(cells[index] ?? "").trim();
      if (value !== "") record.values[field] = value;
    });

    records.push(record);
  }

  return records;
};

// ---------------------------------------------------------------------------
// Normalizacion de valores
// ---------------------------------------------------------------------------

// Monto entero en pesos. Acepta "35.000", "$35.000" y "35000". Rechaza
// decimales: en COP no existen y un decimal indica un archivo mal preparado.
const parseMoney = (value, field, errors) => {
  const raw = String(value ?? "").trim();
  if (raw === "") return null;

  const negative = raw.includes("-");
  const onlyDigits = raw.replace(/[^\d]/g, "");

  if (onlyDigits === "") {
    errors.push({ field, message: `El valor de "${field}" no es un número` });
    return null;
  }

  if (/[.,]\d{1,2}\s*$/.test(raw) && !/^\d{1,3}([.,]\d{3})+$/.test(raw)) {
    errors.push({
      field,
      message: `"${field}" debe ser un monto entero en pesos`,
    });
    return null;
  }

  const amount = Number(onlyDigits);
  if (!Number.isSafeInteger(amount)) {
    errors.push({ field, message: `El valor de "${field}" es demasiado grande` });
    return null;
  }

  return negative ? -amount : amount;
};

const parseQuantity = (value, errors) => {
  const raw = String(value ?? "").trim();
  if (raw === "") return 1;

  const parsed = Number(raw.replace(/[^\d]/g, ""));
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_QUANTITY) {
    errors.push({
      field: "cantidad",
      message: `La cantidad debe estar entre 1 y ${MAX_QUANTITY}`,
    });
    return null;
  }

  return parsed;
};

// Fecha en ISO (YYYY-MM-DD). Acepta "2026-11-01" y "01/11/2026".
const parseDate = (value, errors) => {
  const raw = String(value ?? "").trim();
  if (raw === "") return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) {
    const date = new Date(`${raw}T12:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      errors.push({ field: "fecha", message: "La fecha no es válida" });
      return null;
    }
    return date;
  }

  const latam = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (latam) {
    const [, day, month, year] = latam;
    const isoDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const date = new Date(`${isoDate}T12:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      errors.push({ field: "fecha", message: "La fecha no es válida" });
      return null;
    }
    return date;
  }

  errors.push({
    field: "fecha",
    message: 'La fecha debe estar en formato "AAAA-MM-DD" o "DD/MM/AAAA"',
  });
  return null;
};

// ---------------------------------------------------------------------------
// Resolucion del producto
// ---------------------------------------------------------------------------

// Busca el producto del catalogo por SKU (propio o del proveedor). Si no
// existe, la venta se registra como linea externa.
const findCatalogProduct = async (sku) => {
  if (!sku) return null;

  const exact = await Product.findOne({
    where: { [Op.or]: [{ sku }, { providerSku: sku }] },
  });
  if (exact) return exact;

  return Product.findOne({
    where: {
      [Op.or]: [{ sku: { [Op.iLike]: sku } }, { providerSku: { [Op.iLike]: sku } }],
    },
  });
};

// ---------------------------------------------------------------------------
// Analisis de una fila
// ---------------------------------------------------------------------------

// Analiza una fila del archivo. Devuelve:
//   { row, errors, warnings, plan }
// `plan` es null si la fila no se puede importar.
const analyzeRow = async (record) => {
  const errors = [];
  const warnings = [];
  const values = record.values;

  const name = values.name || "";
  const phone = values.phone || "";
  const sku = values.sku || "";
  const productName = values.product || "";

  if (!name) {
    errors.push({ field: "nombre", message: "Falta el nombre del comprador" });
  }
  if (!phone) {
    errors.push({ field: "telefono", message: "Falta el teléfono del comprador" });
  } else if (phone.replace(/\D/g, "").length < 7) {
    errors.push({ field: "telefono", message: "El teléfono no es válido" });
  }
  if (emailInvalid(values.email)) {
    errors.push({ field: "email", message: "El correo no es válido" });
  }
  if (!sku && !productName) {
    errors.push({
      field: "sku",
      message: 'Falta el SKU o el nombre del producto ("sku" o "producto")',
    });
  }

  const date = parseDate(values.date, errors);
  const quantity = parseQuantity(values.quantity, errors);
  const total = parseMoney(values.total, "total", errors);
  const providerCost = parseMoney(values.providerCost, "costo_proveedor", errors);

  // Estado logistico (por defecto: el cumplimiento esta liberado).
  let fulfillmentStatus = FULFILLMENT_STATUS.PAID;
  if (values.status) {
    const key = normalizeKey(values.status);
    fulfillmentStatus = FULFILLMENT_ALIASES[key];
    if (!fulfillmentStatus) {
      errors.push({
        field: "estado",
        message: `El estado "${values.status}" no es un estado válido`,
      });
    }
  }

  // Estado del dinero.
  let paymentState = null;
  if (values.paymentStatus) {
    const key = normalizeKey(values.paymentStatus);
    paymentState = PAYMENT_STATE_ALIASES[key];
    if (!paymentState) {
      errors.push({
        field: "estado_pago",
        message: `El estado de pago "${values.paymentStatus}" no es válido`,
      });
    }
  } else if (fulfillmentStatus) {
    // Sin columna explicita: una venta entregada o despachada ya tiene el
    // dinero; una pendiente de pago no.
    if (fulfillmentStatus === FULFILLMENT_STATUS.PENDING_PAYMENT) {
      paymentState = PAYMENT_STATE.UNPAID;
    } else if (fulfillmentStatus === FULFILLMENT_STATUS.CANCELLED) {
      paymentState = PAYMENT_STATE.REFUNDED;
    } else {
      paymentState = PAYMENT_STATE.SETTLED;
    }
  }

  // Metodo de pago.
  let paymentMethod = null;
  if (values.paymentMethod) {
    const key = normalizeKey(values.paymentMethod);
    paymentMethod = PAYMENT_METHOD_ALIASES[key];
    if (!paymentMethod) {
      errors.push({
        field: "metodo_pago",
        message: `El método de pago "${values.paymentMethod}" no es válido`,
      });
    }
  }

  const trackingNumber = values.tracking || null;
  const trackingCarrier = values.carrier || null;

  // Sin guia no se puede marcar como enviado: es la misma regla del panel.
  if (fulfillmentStatus === FULFILLMENT_STATUS.SHIPPED && !trackingNumber) {
    errors.push({
      field: "guia",
      message: 'No se puede registrar como "enviado" sin número de guía',
    });
  }

  // El envio necesita la direccion completa. Si el archivo no trae direccion,
  // la venta se registra como entrega en mano (pickup).
  const tieneDireccion = Boolean(values.address || values.city || values.department);
  if (tieneDireccion) {
    for (const [field, label] of [
      ["address", "dirección"],
      ["city", "ciudad"],
      ["department", "departamento"],
    ]) {
      if (!values[field]) {
        errors.push({
          field,
          message: `Falta la ${label} del envío`,
        });
      }
    }
  }

  // Resolucion del producto y del precio.
  let items = null;
  let computedTotal = null;
  let computedProviderCost = null;

  const product = sku ? await findCatalogProduct(sku) : null;

  if (product && quantity) {
    try {
      // Se resuelve el precio del catalogo por adelantado (para poder avisar
      // de diferencias con el archivo). La linea que se guarda vuelve a
      // resolverse en el backend al crear el pedido: el precio SIEMPRE sale
      // del catalogo, nunca del CSV.
      const built = await buildOrderLines(
        [{ productId: product.id, size: values.size || null, quantity }],
        undefined,
        { allowUnavailable: true },
      );
      items = [
        {
          productId: product.id,
          size: values.size || null,
          quantity,
        },
      ];
      computedTotal = built.subtotal;
      computedProviderCost = built.lines.reduce(
        (sum, line) => sum + Number(line.unitCost || 0) * line.quantity,
        0,
      );
    } catch (error) {
      errors.push({
        field: values.size ? "talla" : "sku",
        message: error.message,
      });
    }
  } else if (!product && quantity) {
    // Producto fuera del catalogo: el precio sale del archivo.
    const title = productName || sku;
    if (total === null) {
      errors.push({
        field: "total",
        message:
          'El producto no está en el catálogo, así que "total" es obligatorio',
      });
    } else if (total < 0) {
      errors.push({ field: "total", message: "El total no puede ser negativo" });
    } else {
      const unitPrice = Math.round(total / quantity);
      items = [
        {
          external: true,
          title,
          unitPrice,
          unitCost:
            providerCost === null ? 0 : Math.round(providerCost / quantity),
          quantity,
          size: values.size || null,
        },
      ];
      computedTotal = unitPrice * quantity;
      computedProviderCost = providerCost ?? 0;

      if (computedTotal !== total) {
        warnings.push({
          field: "total",
          message: `El total se ajustó a ${computedTotal} por la cantidad`,
        });
      }
    }
  }

  // El total del archivo nunca es la verdad contable cuando hay catalogo: se
  // compara y se avisa.
  if (
    product &&
    total !== null &&
    computedTotal !== null &&
    computedTotal !== total
  ) {
    warnings.push({
      field: "total",
      message: `El archivo dice ${total} y el catálogo suma ${computedTotal}; se usó el del catálogo`,
    });
  }

  if (
    product &&
    providerCost !== null &&
    computedProviderCost !== null &&
    computedProviderCost !== providerCost
  ) {
    warnings.push({
      field: "costo_proveedor",
      message: `El archivo dice ${providerCost} y el catálogo suma ${computedProviderCost}`,
    });
  }

  const cost = providerCost ?? computedProviderCost ?? 0;

  if (errors.length > 0) {
    return { row: record.row, errors, warnings, plan: null };
  }

  const plan = {
    row: record.row,
    name,
    phone,
    email: values.email || null,
    address: values.address || null,
    city: values.city || null,
    department: values.department || null,
    notes: values.notes || null,
    items,
    total: computedTotal ?? total ?? 0,
    providerCost: cost,
    paymentMethod,
    paymentState,
    fulfillmentStatus,
    trackingNumber,
    trackingCarrier,
    date,
    externalRef: values.externalRef || null,
    sku: sku || null,
  };

  return { row: record.row, errors, warnings, plan };
};

const emailInvalid = (value) => {
  const raw = String(value ?? "").trim();
  if (raw === "") return false;
  return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
};

// ---------------------------------------------------------------------------
// Idempotencia
// ---------------------------------------------------------------------------

// Referencia deterministica para las filas sin "ref_externa": el hash del
// contenido. Dos filas identicas del mismo archivo comparten referencia (la
// segunda se marca como duplicada) y reimportar el archivo no duplica nada.
const hashRow = (plan) => {
  const crypto = require("crypto");
  const base = [
    plan.name,
    plan.phone,
    plan.email || "",
    plan.sku || "",
    (plan.items || [])
      .map((item) => `${item.title}|${item.size || ""}|${item.quantity}`)
      .join(";"),
    plan.total,
    plan.date ? plan.date.toISOString().slice(0, 10) : "",
    plan.externalRef || "",
  ].join("~");

  return crypto.createHash("sha1").update(base).digest("hex").slice(0, 32);
};

// ---------------------------------------------------------------------------
// Importacion
// ---------------------------------------------------------------------------

const MAX_ERRORS_REPORTED = 100;

// Analiza el archivo sin escribir nada (dry run).
const analyzeCsv = async (text) => {
  const rows = parseCsv(text);
  const records = readRecords(rows);

  if (records.length > MAX_ROWS) {
    throw new HttpError(
      413,
      `El archivo tiene ${records.length} filas y el máximo es ${MAX_ROWS}`,
    );
  }

  const analyzed = [];
  for (const record of records) {
    analyzed.push(await analyzeRow(record));
  }

  // Referencias duplicadas dentro del mismo archivo. Se detectan ANTES de
  // recoger los errores: la fila repetida se invalida aqui.
  const seen = new Map();
  for (const item of analyzed) {
    if (!item.plan) continue;
    const ref = item.plan.externalRef || hashRow(item.plan);
    item.plan.externalRef = ref;
    if (seen.has(ref)) {
      item.errors.push({
        field: "ref_externa",
        message: `La referencia "${ref}" ya se usó en la fila ${seen.get(ref)}`,
      });
      item.plan = null;
    } else {
      seen.set(ref, item.row);
    }
  }

  const errors = [];
  const warnings = [];
  for (const item of analyzed) {
    for (const error of item.errors) {
      errors.push({ row: item.row, field: error.field, message: error.message });
    }
    for (const warning of item.warnings) {
      warnings.push({ row: item.row, field: warning.field, message: warning.message });
    }
  }

  const valid = analyzed.filter((item) => item.plan);
  const invalid = analyzed.length - valid.length;

  return {
    analyzed,
    summary: {
      totalRows: analyzed.length,
      valid: valid.length,
      invalid,
      warnings: warnings.length,
    },
    errors,
    warnings,
  };
};

// Importa de verdad. Cada pedido se crea en su propia transaccion: un fallo en
// una fila no revierte las que ya se escribieron.
const importCsv = async ({ text, adminId }) => {
  const analysis = await analyzeCsv(text);

  const created = [];
  const duplicates = [];
  const runtimeErrors = [];

  for (const item of analysis.analyzed) {
    if (!item.plan) continue;

    const plan = item.plan;

    // ¿Ya existe un pedido con esa referencia?
    const existing = await Order.findOne({
      where: { channel: IMPORT_CHANNEL, externalRef: plan.externalRef },
    });
    if (existing) {
      duplicates.push({
        row: plan.row,
        externalRef: plan.externalRef,
        orderId: existing.id,
        orderNumber: existing.orderNumber,
      });
      continue;
    }

    try {
      const order = await createManualOrder({
        adminId,
        items: plan.items,
        shipping: {
          recipientName: plan.name,
          phone: plan.phone,
          email: plan.email,
          address: plan.address,
          city: plan.city,
          department: plan.department,
        },
        notes: plan.notes,
        channel: IMPORT_CHANNEL,
        paymentMethod: plan.paymentMethod,
        deliveryType: plan.address ? "envio" : "pickup",
        externalRef: plan.externalRef,
        providerCost: plan.providerCost,
        initialFulfillmentStatus: plan.fulfillmentStatus,
        initialPaymentState: plan.paymentState,
        trackingNumber: plan.trackingNumber,
        trackingCarrier: plan.trackingCarrier,
        createdAt: plan.date,
        historyNote: `Importado desde CSV (fila ${plan.row}).`,
        skipStockReservation: true,
        pricingOptions: { allowExternal: true, allowUnavailable: true },
      });

      created.push({
        row: plan.row,
        id: order.id,
        orderNumber: order.orderNumber,
        externalRef: plan.externalRef,
        total: order.total,
      });
    } catch (error) {
      runtimeErrors.push({
        row: plan.row,
        field: "creacion",
        message: error.message,
      });
    }
  }

  const errors = [...analysis.errors, ...runtimeErrors];

  return {
    summary: {
      totalRows: analysis.summary.totalRows,
      valid: analysis.summary.valid,
      invalid: analysis.summary.invalid,
      created: created.length,
      duplicates: duplicates.length,
      failed: runtimeErrors.length,
      warnings: analysis.summary.warnings,
    },
    created,
    duplicates,
    errors: errors.slice(0, MAX_ERRORS_REPORTED),
    warnings: analysis.warnings.slice(0, MAX_ERRORS_REPORTED),
  };
};

// Comprobacion de peso: el limite lo aplica express, pero se revisa tambien
// aqui para no depender del middleware.
const assertSize = (text) => {
  const bytes = Buffer.byteLength(String(text || ""), "utf8");
  if (bytes > MAX_BYTES) {
    throw new HttpError(
      413,
      `El archivo pesa ${bytes} bytes y el máximo es ${MAX_BYTES}`,
    );
  }
  return bytes;
};

module.exports = {
  analyzeCsv,
  importCsv,
  assertSize,
  parseCsv,
  readRecords,
  analyzeRow,
  hashRow,
  parseMoney,
  parseDate,
  parseQuantity,
  normalizeHeader,
  normalizeKey,
  IMPORT_CHANNEL,
  MAX_BYTES,
  MAX_ROWS,
  FULFILLMENT_STATUS_VALUES,
  PAYMENT_STATE_VALUES,
  PAYMENT_METHOD_VALUES,
  STATUS_SOURCE,
};
