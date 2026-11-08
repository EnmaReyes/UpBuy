// Adaptador de Vendelo.
//
// Aisla TODO lo que sabe de Vendelo: autenticacion, rutas y forma de las
// respuestas. El resto del backend solo habla el contrato comun (ver
// index.js), asi que cambiar de proveedor no se propaga por el codigo.
//
// IMPORTANTE — rutas:
//   La documentacion de Vendelo no vive en este repo. Por eso NINGUNA ruta
//   esta hardcodeada: se leen de las variables VENDELO_PATH_* y, si no
//   estan, se usan los valores de abajo. Esos valores son una suposicion
//   razonable basada en APIs REST comunes, NO estan confirmados. Antes de
//   conectar produccion hay que:
//
//     1. Abrir la doc/panel de Vendelo.
//     2. Ajustar PATHS (o las VENDELO_PATH_* en .env).
//     3. Confirmar con una llamada real a listProducts().
//
//   El adaptador no falla en silencio: si el proveedor no esta configurado,
//   lanza 503 y el flujo manual sigue funcionando.
//
// Tokens: SIEMPRE desde el entorno (config.js). Nunca en el codigo.

const { getJson, postJson, request } = require("../../Utils/httpClient.js");
const { VENDELO_API_URL, VENDELO_TOKEN } = require("../../config.js");
const { buildOrderPayload } = require("./payload.js");
const HttpError = require("../../Utils/HttpError.js");
const { mapProviderToCanonical } = require("../statusMachine.js");
const { PROVIDER } = require("../../DataBase/models/enums.js");

const NAME = PROVIDER.VENDELO;

// Rutas relativas a VENDELO_API_URL. {id} se reemplaza por el id del pedido.
const PATHS = {
  products: process.env.VENDELO_PATH_PRODUCTS || "/products",
  orders: process.env.VENDELO_PATH_ORDERS || "/orders",
  orderDetail: process.env.VENDELO_PATH_ORDER_DETAIL || "/orders/{id}",
  orderStatus: process.env.VENDELO_PATH_ORDER_STATUS || "/orders/{id}/status",
};

const isConfigured = () => Boolean(VENDELO_API_URL && VENDELO_TOKEN);

const assertConfigured = () => {
  if (!isConfigured()) {
    throw new HttpError(
      503,
      "Vendelo no está configurado (faltan VENDELO_API_URL / VENDELO_TOKEN)",
    );
  }
};

const baseUrl = () => String(VENDELO_API_URL).replace(/\/+$/, "");

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
  Authorization: `Bearer ${VENDELO_TOKEN}`,
  Accept: "application/json",
});

// Las APIs suelen envolver el resultado: { data: [...] }, { results: [...] }
// o la lista pelada. Se aceptan las tres sin romper.
const unwrapList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

// Extrae un campo sin asumir la forma exacta de la respuesta.
const pick = (data, keys) => {
  for (const key of keys) {
    const value = key.split(".").reduce((acc, part) => acc?.[part], data);
    if (value !== undefined && value !== null) return value;
  }
  return null;
};

const extractOrderId = (data) =>
  pick(data, [
    "id",
    "orderId",
    "order_id",
    "data.id",
    "data.orderId",
    "data.order_id",
    "order.id",
  ]);

const extractStatus = (data) =>
  pick(data, [
    "status",
    "orderStatus",
    "order_status",
    "state",
    "data.status",
    "data.orderStatus",
    "data.order_status",
    "data.state",
    "order.status",
  ]);

// ---------------------------------------------------------------------------
// Contrato comun
// ---------------------------------------------------------------------------

// Lista el catalogo del proveedor (para importarlo o compararlo).
const listProducts = async (page = 1, { limit = 50 } = {}) => {
  assertConfigured();
  const data = await getJson(
    buildUrl(PATHS.products, { page, limit, per_page: limit }),
    { headers: headers() },
  );

  return {
    provider: NAME,
    page: Number(page) || 1,
    items: unwrapList(data),
    raw: data,
  };
};

// Crea el pedido en Vendelo. Devuelve el id que asigna el proveedor.
const createOrder = async ({ order, items } = {}) => {
  assertConfigured();

  const payload = buildOrderPayload({ order, items });
  const data = await postJson(buildUrl(PATHS.orders), payload, {
    headers: headers(),
    // Crear un pedido con la misma referencia externa es seguro de repetir:
    // el proveedor debe rechazar el duplicado.
    allowRetryOnNonIdempotent: true,
  });

  const providerOrderId = extractOrderId(data);
  if (!providerOrderId) {
    throw new HttpError(
      502,
      "Vendelo no devolvió el id del pedido creado",
      { code: "PROVIDER_BAD_RESPONSE", body: data },
    );
  }

  return {
    provider: NAME,
    providerOrderId: String(providerOrderId),
    status: extractStatus(data),
    raw: data,
  };
};

// Consulta el estado actual del pedido en Vendelo.
const getOrderStatus = async (providerOrderId) => {
  assertConfigured();
  if (!providerOrderId) {
    throw new HttpError(400, "Falta el id del pedido en Vendelo");
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
    raw: data,
  };
};

// Empuja un cambio de estado desde Upbuy hacia Vendelo.
//
// El estado canonico no significa nada para el proveedor: cada uno tiene su
// vocabulario. Se manda tal cual y se deja constancia de la respuesta; el
// mapa inverso se completa cuando se confirme la documentacion.
const updateOrderStatus = async (providerOrderId, canonicalStatus) => {
  assertConfigured();
  if (!providerOrderId) {
    throw new HttpError(400, "Falta el id del pedido en Vendelo");
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
      `Vendelo rechazó el cambio de estado (HTTP ${response.status})`,
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
  assertConfigured,
  listProducts,
  createOrder,
  getOrderStatus,
  updateOrderStatus,
  // para pruebas
  PATHS,
};
