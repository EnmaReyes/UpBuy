// Catalogo de MasterShop: lectura de productos.
//
// Endpoints confirmados (documentacion oficial):
//   GET /api/products?page=&limit=&category=&search=
//   GET /api/products/{id}?includeAllVariations=false
//
// Paginacion: `page` es un INDICE de pagina que empieza en 1 (a diferencia del
// marketplace, donde `page` es un desplazamiento en filas). `limit` por defecto
// 20 y se recorta en silencio a 50. La respuesta trae
// `{ results: [...], resultsCount: { totalProducts } }`.
//
// El fin de los datos se detecta por: pagina vacia, menos elementos que el
// `limit` pedido, o haber alcanzado `totalProducts`.
const {
  MASTERSHOP_SYNC_PAGE_SIZE,
} = require("../../../config.js");
const HttpError = require("../../../Utils/HttpError.js");
const { requestJson } = require("./mastershop.client.js");
const {
  normalizeProduct,
  normalizePage,
  productSizes,
  buildProductSku,
  buildProductSlug,
} = require("./mastershop.normalize.js");

// Tope documentado: el servicio recorta `limit` a 50 aunque se pida mas.
const MAX_PAGE_SIZE = 50;

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.trunc(parsed);
};

const buildFilters = (filters = {}) => ({
  category: String(filters.category || "").trim() || undefined,
  search: String(filters.search || "").trim() || undefined,
});

const pageSizeOf = (pageSize) =>
  Math.min(toPositiveInt(pageSize, MASTERSHOP_SYNC_PAGE_SIZE), MAX_PAGE_SIZE);

// Una pagina del catalogo (items SIN normalizar).
const listPage = async (supplier, { page = 1, pageSize, filters } = {}) => {
  const safePage = toPositiveInt(page, 1);
  const safeLimit = pageSizeOf(pageSize);

  const data = await requestJson("GET", "/api/products", {
    params: {
      page: safePage,
      limit: safeLimit,
      ...buildFilters(filters),
    },
  });

  const normalized = normalizePage(data);
  const received = normalized.items.length;

  // Hay mas paginas si la pagina vino completa y no se alcanzo el total.
  const reachedTotal =
    normalized.total !== null && safePage * safeLimit >= normalized.total;
  const hasMore = received > 0 && received >= safeLimit && !reachedTotal;

  return {
    items: normalized.items,
    page: safePage,
    limit: safeLimit,
    total: normalized.total,
    nextPageToken: hasMore ? String(safePage + 1) : "",
  };
};

// Producto individual (normalizado). La documentacion responde 404 cuando el
// id no pertenece al negocio; se valida tambien la lista vacia.
//
// `includeAllVariations` se manda siempre explicito (por defecto true): el
// listado ya trae `variation[]` completo, pero el detalle con `false` recorta
// las variaciones de los productos de variante unica. Antes de crear pedidos
// se necesita el catalogo COMPLETO de variantes.
const getProduct = async (
  supplier,
  externalId,
  { includeAllVariations = true } = {},
) => {
  const id = String(externalId ?? "").trim();
  if (!/^\d+$/.test(id) || Number(id) <= 0) {
    throw new HttpError(400, "El id del producto de MasterShop no es válido");
  }

  const data = await requestJson(
    "GET",
    `/api/products/${encodeURIComponent(id)}`,
    { params: { includeAllVariations: includeAllVariations ? "true" : "false" } },
  );
  const { items } = normalizePage(data);

  if (items.length === 0) {
    throw new HttpError(404, "Producto no encontrado en MasterShop");
  }

  return normalizeProduct(items[0]);
};

// Recorre el catalogo pagina a pagina.
//
// `onPage(page, index)` se llama por cada pagina y puede persistir el lote.
// Devuelve un resumen: paginas recorridas, productos vistos y la ultima pagina
// consultada (se guarda en `catalog_sync_runs.cursor` como referencia).
const iteratePages = async (
  supplier,
  { pageSize, pageToken = "", filters, maxPages = 1000 } = {},
  onPage,
) => {
  let page = toPositiveInt(pageToken, 1);
  let pages = 0;
  let received = 0;

  while (pages < maxPages) {
    const chunk = await listPage(supplier, { page, pageSize, filters });
    pages += 1;
    received += chunk.items.length;

    if (typeof onPage === "function") {
      await onPage(chunk, pages);
    }

    if (!chunk.nextPageToken) break;
    if (Number(chunk.nextPageToken) === page) break;
    page = Number(chunk.nextPageToken);
  }

  return { pages, received, cursor: String(page) };
};

// Trae hasta `limit` productos normalizados (consultas puntuales).
const listProducts = async (supplier, { limit = 100, filters } = {}) => {
  const items = [];
  let page = 1;
  let guard = 0;

  while (items.length < limit && guard < 100) {
    const chunk = await listPage(supplier, { page, filters });
    guard += 1;
    for (const raw of chunk.items) {
      if (items.length >= limit) break;
      items.push(normalizeProduct(raw));
    }
    if (!chunk.nextPageToken) break;
    page = Number(chunk.nextPageToken);
  }

  return items;
};

module.exports = {
  MAX_PAGE_SIZE,
  listPage,
  listProducts,
  getProduct,
  iteratePages,
  buildFilters,
  // Hooks del contrato comun usados por Services/catalog.
  normalizeProduct,
  productSizes,
  buildProductSku,
  buildProductSlug,
};
