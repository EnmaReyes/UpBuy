// Capa HTTP de la integracion Venndelo. Solo valida y delega.
const {
  createCatalogSupplierController,
} = require("./catalogSupplier.controller.js");
const service = require("../../Services/suppliers/venndelo.service.js");

module.exports = createCatalogSupplierController({
  service,
  providerName: "Venndelo",
});
