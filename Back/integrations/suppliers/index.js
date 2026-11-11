// Registro de integraciones de proveedores de catalogo.
//
// Contrato comun que cumple cada proveedor:
//
//   slug, name
//   isConfigured()                       -> bool (credenciales presentes)
//   auth.getAccessToken(supplier)        -> string (Bearer)
//   auth.getStatus(supplier)             -> { cached, accessTokenExpiresAt }
//   auth.invalidate(supplier)
//   client.checkAuth(supplier)           -> respuesta del proveedor
//   catalog.listPage(supplier, opts)     -> { items, nextPageToken, ... }
//   catalog.iteratePages(supplier, opts, onPage)
//   catalog.getProduct(supplier, id)     -> producto normalizado
//   assets.listAssets(product)           -> imagenes ordenadas
//   assets.assertAssetsMutable(product)  -> lanza 409 si es de proveedor
//
// Los servicios de catalogo (Services/catalog/) SOLO hablan este contrato:
// agregar Dropi manana es crear su carpeta y registrarla aqui, sin tocar la
// logica de importacion/sincronizacion.
const HttpError = require("../../Utils/HttpError.js");
const { SUPPLIER_SLUG } = require("../../DataBase/models/enums.js");
const venndeloAuth = require("./venndelo/venndelo.auth.js");
const venndeloClient = require("./venndelo/venndelo.client.js");
const venndeloCatalog = require("./venndelo/venndelo.catalog.js");
const venndeloAssets = require("./venndelo/venndelo.assets.js");

const venndelo = {
  slug: SUPPLIER_SLUG.VENNDELO,
  name: "Venndelo",
  isConfigured: venndeloAuth.isConfigured,
  auth: {
    getAccessToken: venndeloAuth.getAccessToken,
    getStatus: venndeloAuth.getStatus,
    invalidate: venndeloAuth.invalidate,
    resolveCredentials: venndeloAuth.resolveCredentials,
  },
  client: venndeloClient,
  catalog: venndeloCatalog,
  assets: venndeloAssets,
};

const ADAPTERS = {
  [SUPPLIER_SLUG.VENNDELO]: venndelo,
};

const normalizeSlug = (slug) => String(slug || "").trim().toLowerCase();

const getSupplierAdapter = (slug) => {
  const adapter = ADAPTERS[normalizeSlug(slug)];
  if (!adapter) {
    throw new HttpError(400, `Proveedor de catálogo inválido: "${slug}"`);
  }
  return adapter;
};

const listSupplierAdapters = () =>
  Object.values(ADAPTERS).map((adapter) => ({
    slug: adapter.slug,
    name: adapter.name,
    configured: adapter.isConfigured(),
  }));

module.exports = {
  ADAPTERS,
  getSupplierAdapter,
  listSupplierAdapters,
  SUPPLIER_SLUG,
};