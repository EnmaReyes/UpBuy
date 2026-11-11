// Punto de entrada de las integraciones externas.
//
//   integrations/suppliers/  -> catalogo de proveedores de dropshipping
//
// Las integraciones NO conocen Express ni las rutas: exponen funciones que los
// servicios de `Services/` orquestan. Asi el transporte (HTTP, cron) queda
// separado del proveedor.
module.exports = {
  suppliers: require("./suppliers/index.js"),
};