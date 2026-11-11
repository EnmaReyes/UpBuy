// Catalogo de Venndelo Pro: lectura de productos.
//
// Endpoints confirmados:
//   GET /products                (paginacion por cursor)
//   GET /products/{product_id}
//
// La paginacion NO es page/limit: se usa `page_token` (vacio = primera pagina)
// y `page_size` (maximo 500). El fin de los datos se detecta cuando
// `next_page_token` viene vacio (la documentacion lo dice explicitamente; NO
// se debe usar `page_item_count` para eso).
const {
  CATALOG_SYNC_PAGE_SIZE,
  CATALOG_SYNC_SUPPLY_MODEL,
} = require("../../../config.js");
const { adminJson } = require("./venndelo.client.js");
const { normalizeProduct, normalizePage } = require("./venndelo.normalize.js");

const ALLOWED_SUPPLY_MODELS = ["ANY", "OWN_STOCK", "DROPSHIP"];

const buildFilters = (filters = {}) => {
  const supplyModel = String(
    filters.supplyModel || CATALOG_SYNC_SUPPLY_MODEL || "ANY",
  ).toUpperCase();

  return {
    supply_model: ALLOWED_SUPPLY_MODELS.includes(supplyModel)
      ? supplyModel
      : "ANY",
    sku: filters.sku,
    created_min: filters.createdMin,
    created_max: filters.createdMax,
  };
};

// Una pagina del catalogo (sin normalizar los productos).
const listPage = async (supplier, { pageToken = "", pageSize, filters } = {}) => {
  const data = await adminJson(supplier, "GET", "/products", {
    params: {
      page_token: pageToken || "",
      page_size: pageSize || CATALOG_SYNC_PAGE_SIZE,
      ...buildFilters(filters),
    },
  });
  return normalizePage(data);
};

// Producto individual (normalizado).
const getProduct = async (supplier, externalId) => {
  const data = await adminJson(
    supplier,
    "GET",
    `/products/${encodeURIComponent(externalId)}`,
  );
  return normalizeProduct(data);
};

// Recorre el catalogo pagina a pagina.
//
// `onPage(page, index)` se llama por cada pagina y puede persistir el lote.
// Devuelve un resumen: paginas recorridas, productos vistos y el cursor final.
// Si una pagina falla, el error sube al llamador (la importacion lo registra).
const iteratePages = async (
  supplier,
  { pageSize, pageToken = "", filters, maxPages = 1000 } = {},
  onPage,
) => {
  let token = pageToken || "";
  let pages = 0;
  let received = 0;

  while (pages < maxPages) {
    const page = await listPage(supplier, { pageToken: token, pageSize, filters });
    pages += 1;
    received += page.items.length;

    if (typeof onPage === "function") {
      await onPage(page, pages);
    }

    if (!page.nextPageToken) break;
    // Proteccion contra un cursor repetido (evita un bucle infinito).
    if (page.nextPageToken === token) break;
    token = page.nextPageToken;
  }

  return { pages, received, cursor: token };
};

// Trae hasta `limit` productos normalizados (util para consultas puntuales).
const listProducts = async (supplier, { limit = 100, filters } = {}) => {
  const items = [];
  let token = "";
  let guard = 0;

  while (items.length < limit && guard < 100) {
    const page = await listPage(supplier, { pageToken: token, filters });
    guard += 1;
    for (const raw of page.items) {
      if (items.length >= limit) break;
      items.push(normalizeProduct(raw));
    }
    if (!page.nextPageToken || page.nextPageToken === token) break;
    token = page.nextPageToken;
  }

  return items;
};

module.exports = {
  listPage,
  listProducts,
  getProduct,
  iteratePages,
  buildFilters,
};