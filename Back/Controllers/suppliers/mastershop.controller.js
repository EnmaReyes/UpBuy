// Capa HTTP de la integracion MasterShop. Solo valida y delega.
const {
  createCatalogSupplierController,
} = require("./catalogSupplier.controller.js");
const service = require("../../Services/suppliers/mastershop.service.js");

module.exports = createCatalogSupplierController({
  service,
  providerName: "MasterShop",
});
