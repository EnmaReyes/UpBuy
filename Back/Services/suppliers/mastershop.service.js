// Fachada de la integracion MasterShop para el panel de administracion.
//
// MasterShop autentica con una llave estatica (`ms-api-key`) que vive solo en
// el entorno: no hay refresh token ni credenciales persistidas, por eso el
// panel no muestra el bloque de credenciales rotables.
const { SUPPLIER_SLUG } = require("../../integrations/suppliers/index.js");
const {
  createCatalogSupplierService,
} = require("./catalogSupplier.service.js");

const SLUG = SUPPLIER_SLUG.MASTERSHOP;

module.exports = createCatalogSupplierService({
  slug: SLUG,
  providerName: "MasterShop",
  trackCredentials: false,
  notConfiguredMessage:
    "MasterShop no está configurado (falta MASTERSHOP_API_KEY)",
  connectionMessage: "Conexión con MasterShop correcta",
});
