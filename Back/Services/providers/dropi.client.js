// Adaptador de Dropi.
//
// Dropi no tiene una API publica confirmada para dropshipping. Por eso el
// adaptador funciona en DOS modos:
//
//   1. MANUAL (default): DROPI_API_URL o DROPI_TOKEN vacios.
//      - createOrder NO crea nada en Dropi: deja el pedido listo para
//        cargarlo a mano en el panel y lo registra en sync_logs (direction
//        'out', ok true). No es un error: es el flujo esperado.
//      - exportOrderForDropiCsv() devuelve la fila lista para pegar en la
//        plantilla de carga masiva de Dropi.
//
//   2. API (opcional): si algun dia Dropi habilita API y se configuran las
//      variables, el mismo adaptador la usa con las rutas de abajo.
//
// Rutas: igual que Vendelo, ninguna esta confirmada. Se leen de
// DROPI_PATH_* y los valores por defecto son una suposicion REST. Antes de
// activar el modo API hay que confirmarlas con la documentacion de Dropi.
//
// Tokens: SIEMPRE desde el entorno. Nunca en el codigo.

const { getJson, postJson, request } = require("../../Utils/httpClient.js");
const { DROPI_API_URL, DROPI_TOKEN } = require("../../config.js");
const { buildOrderPayload, normalizePhone } = require("./payload.js");
const HttpError = require("../../Utils/HttpError.js");
const { mapProviderToCanonical } = require("../statusMachine.js");
const {
  PROVIDER,
  SYNC_DIRECTION,
} = require("../../DataBase/models/enums.js");
const { SyncLog } = require("../../DataBase/models/index.js");
const { createLogger } = require("../../Utils/logger.js");

const log = createLogger("dropi.client");

const NAME = PROVIDER.DROPI;

const PATHS = {
  products: process.env.DROPI_PATH_PRODUCTS || "/products",
  orders: process.env.DROPI_PATH_ORDERS || "/orders",
  orderDetail: process.env.DROPI_PATH_ORDER_DETAIL || "/orders/{id}",
  orderStatus: process.env.DROPI_PATH_ORDER_STATUS || "/orders/{id}/status",
};

const isConfigured = () => Boolean(DROPI_API_URL && DROPI_TOKEN);

const baseUrl = () => String(DROPI_API_URL).replace(/\/+$/, "");

const buildUrl = (path, params = {}) => {
  const url = `${baseUrl()}${path}`;
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&");
  return query ? `${url}?${query}` : url;
};

const withId = (path, id) => path.replace("{id}", encodeURIComponent(id));

const headers = () => ({
  Authorization: `Bearer ${DROPI_TOKEN}`,
  Accept: "application/json",
});

const unwrapList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

const pick = (data, keys) => {
  for (const key of keys) {
    const value = key.split(".").reduce((acc, part) => acc?.[part], data);
    if (value !== undefined && value !== null) return value;
  }
  return null;
};

const extractOrderId = (data) =>
  pick(data, ["id", "orderId", "order_id", "data.id", "data.orderId"]);

const extractStatus = (data) =>
  pick(data, [
    "status",
    "orderStatus",
    "order_status",
    "state",
    "data.status",
    "data.orderStatus",
    "data.state",
  ]);

// ---------------------------------------------------------------------------
// Exportacion manual (modo default)
// ---------------------------------------------------------------------------

// Columnas de la plantilla de carga de Dropi. Los nombres son los que usa
// hoy el panel; si Dropi cambia su plantilla, se ajusta SOLO aqui.
const CSV_COLUMNS = [
  "numero_pedido",
  "fecha",
  "nombre",
  "telefono",
  "direccion",
  "ciudad",
  "departamento",
  "producto",
  "cantidad",
  "precio_unitario",
  "total",
  "metodo_pago",
  "notas",
];

// Devuelve un objeto plano, una fila por item del pedido. Es lo que se pega
// en la plantilla de Dropi (o se convierte a CSV con toCsv).
const exportOrderForDropiCsv = ({ order, items = [] } = {}) => {
  if (!order) {
    throw new HttpError(400, "Falta el pedido a exportar");
  }

  const snapshot = order.addressSnapshot || {};
  const lineas = (items.length ? items : order.items || []).map((item) => ({
    numero_pedido: order.orderNumber,
    fecha: order.createdAt
      ? new Date(order.createdAt).toISOString().slice(0, 10)
      : "",
    nombre: snapshot.recipientName || order.recipientName || "",
    telefono: normalizePhone(snapshot.phone || order.phone),
    direccion: snapshot.address || order.address || "",
    ciudad: snapshot.city || order.city || "",
    departamento: snapshot.department || order.department || "",
    producto: item.name || item.title || "",
    cantidad: Number(item.quantity) || 1,
    precio_unitario: Number(item.unitPrice) || 0,
    total: Number(order.total) || 0,
    metodo_pago: order.paymentMethodCode || "",
    notas: order.notes || "",
  }));

  // Un pedido sin items igual necesita su fila (venta manual minimalista).
  if (!lineas.length) {
    lineas.push({
      numero_pedido: order.orderNumber,
      fecha: order.createdAt
        ? new Date(order.createdAt).toISOString().slice(0, 10)
        : "",
      nombre: snapshot.recipientName || order.recipientName || "",
      telefono: normalizePhone(snapshot.phone || order.phone),
      direccion: snapshot.address || order.address || "",
      ciudad: snapshot.city || order.city || "",
      departamento: snapshot.department || order.department || "",
      producto: "",
      cantidad: 1,
      precio_unitario: Number(order.subtotal) || 0,
      total: Number(order.total) || 0,
      metodo_pago: order.paymentMethodCode || "",
      notas: order.notes || "",
    });
  }

  return { columns: CSV_COLUMNS, rows: lineas };
};

const escapeCsv = (value) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",;\n\r]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
};

const toCsv = (exported) => {
  const { columns, rows } = exported;
  const header = columns.join(",");
  const body = rows.map((row) => columns.map((col) => escapeCsv(row[col])).join(","));
  return [header, ...body].join("\r\n");
};

// Registra en sync_logs que el pedido esta listo para cargar a mano.
const registrarCargaManual = async ({ order, items } = {}, { transaction } = {}) => {
  const exported = exportOrderForDropiCsv({ order, items });

  try {
    await SyncLog.create(
      {
        orderId: order?.id || null,
        provider: NAME,
        direction: SYNC_DIRECTION.OUT,
        attempt: 1,
        ok: true,
        request: {
          mode: "manual",
          orderNumber: order?.orderNumber || null,
        },
        response: exported,
      },
      { transaction },
    );
  } catch (error) {
    // La bitacora no debe tumbar el alta del pedido.
    log.error("No se pudo registrar la carga manual en sync_logs", {
      error: error.message,
      orderId: order?.id,
    });
  }

  return exported;
};

// ---------------------------------------------------------------------------
// Contrato comun
// ---------------------------------------------------------------------------

const listProducts = async (page = 1, { limit = 50 } = {}) => {
  if (!isConfigured()) {
    throw new HttpError(
      503,
      "Dropi está en modo manual: configura DROPI_API_URL y DROPI_TOKEN para listar su catálogo",
    );
  }

  const data = await getJson(
    buildUrl(PATHS.products, { page, limit }),
    { headers: headers() },
  );

  return {
    provider: NAME,
    page: Number(page) || 1,
    items: unwrapList(data),
    raw: data,
  };
};

const createOrder = async ({ order, items } = {}, { transaction } = {}) => {
  // Modo manual: no se llama a ningun proveedor.
  if (!isConfigured()) {
    const exported = await registrarCargaManual({ order, items }, { transaction });
    return {
      provider: NAME,
      providerOrderId: null,
      manual: true,
      status: null,
      export: exported,
    };
  }

  const payload = buildOrderPayload({ order, items });
  const data = await postJson(buildUrl(PATHS.orders), payload, {
    headers: headers(),
    allowRetryOnNonIdempotent: true,
  });

  const providerOrderId = extractOrderId(data);
  if (!providerOrderId) {
    throw new HttpError(
      502,
      "Dropi no devolvió el id del pedido creado",
      { code: "PROVIDER_BAD_RESPONSE", body: data },
    );
  }

  return {
    provider: NAME,
    providerOrderId: String(providerOrderId),
    manual: false,
    status: extractStatus(data),
    raw: data,
  };
};

const getOrderStatus = async (providerOrderId) => {
  // Sin API no hay estado remoto: se devuelve vacio para que el cron no
  // confunda "no configurado" con "sin cambios".
  if (!isConfigured()) {
    return {
      provider: NAME,
      providerOrderId: providerOrderId ? String(providerOrderId) : null,
      providerStatus: null,
      canonical: {},
      manual: true,
    };
  }

  if (!providerOrderId) {
    throw new HttpError(400, "Falta el id del pedido en Dropi");
  }

  const data = await getJson(
    buildUrl(withId(PATHS.orderDetail, providerOrderId)),
    { headers: headers() },
  );

  const providerStatus = extractStatus(data);

  return {
    provider: NAME,
    providerOrderId: String(providerOrderId),
    providerStatus: providerStatus === null ? null : String(providerStatus),
    canonical: mapProviderToCanonical(NAME, providerStatus),
    manual: false,
    raw: data,
  };
};

const updateOrderStatus = async (providerOrderId, canonicalStatus) => {
  if (!isConfigured()) {
    throw new HttpError(
      409,
      "Dropi está en modo manual: actualiza el estado en su panel o exporta el pedido",
      { code: "PROVIDER_MANUAL_MODE" },
    );
  }
  if (!providerOrderId) {
    throw new HttpError(400, "Falta el id del pedido en Dropi");
  }
  if (!canonicalStatus) {
    throw new HttpError(400, "Falta el estado a empujar");
  }

  const response = await request(
    buildUrl(withId(PATHS.orderStatus, providerOrderId)),
    {
      method: "PATCH",
      headers: {
        ...headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: canonicalStatus }),
    },
  );

  if (!response.ok) {
    throw new HttpError(
      502,
      `Dropi rechazó el cambio de estado (HTTP ${response.status})`,
      { code: "PROVIDER_ERROR", status: response.status, body: response.data },
    );
  }

  return {
    provider: NAME,
    providerOrderId: String(providerOrderId),
    canonicalStatus,
    raw: response.data,
  };
};

module.exports = {
  name: NAME,
  isConfigured,
  listProducts,
  createOrder,
  getOrderStatus,
  updateOrderStatus,
  // modo manual
  exportOrderForDropiCsv,
  toCsv,
  CSV_COLUMNS,
  // para pruebas
  PATHS,
};
