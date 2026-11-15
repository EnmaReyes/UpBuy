// Fachada de la integracion Venndelo para el panel de administracion.
//
// Toda la logica vive en la fabrica compartida con los demas proveedores de
// catalogo (`catalogSupplier.service.js`). Este archivo solo declara lo propio
// de Venndelo: su slug y los textos de configuracion.
const { SUPPLIER_SLUG } = require("../../integrations/suppliers/index.js");
const {
  createCatalogSupplierService,
} = require("./catalogSupplier.service.js");

const SLUG = SUPPLIER_SLUG.VENNDELO;

module.exports = createCatalogSupplierService({
  slug: SLUG,
  providerName: "Venndelo",
  // Venndelo rota un refresh token: el panel muestra su estado de persistencia.
  trackCredentials: true,
  notConfiguredMessage:
    "Venndelo no está configurado (faltan VENNDELO_CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN)",
  connectionMessage: "Autenticación correcta",
});
