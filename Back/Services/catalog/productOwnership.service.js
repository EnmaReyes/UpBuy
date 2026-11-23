// Propiedad de los campos de un producto segun su origen.
//
// `products` es la fuente de verdad, pero parte de sus campos son copia del
// proveedor y otros son decision comercial de UPBUY. Este mapa hace explicito
// quien manda en cada campo y que overrides puede devolver el admin al
// proveedor desde el panel.
const FIELD_OWNERS = {
  manual: {
    sku: "upbuy",
    slug: "upbuy",
    name: "upbuy",
    description: "upbuy",
    cost: "upbuy",
    price: "upbuy",
    stock: "upbuy",
    images: "upbuy",
    sizes: "upbuy",
    active: "upbuy",
    status: "upbuy",
  },
  supplier: {
    sku: "supplier",
    slug: "supplier",
    name: "supplier",
    description: "supplier",
    cost: "supplier",
    price: "upbuy",
    stock: "supplier",
    images: "supplier",
    sizes: "supplier",
    providerSku: "supplier",
    active: "supplier",
    status: "upbuy",
  },
};

// Campos que la sincronizacion respeta cuando el admin los personalizo.
// Se guardan como llaves en `manualOverrides`.
const RESTORE_FIELDS = [
  "name",
  "description",
  "cost",
  "stock",
  "images",
  "sizes",
  "active",
  "price",
  "providerSku",
  "category",
];

const ownerFor = (provider, field) => {
  const isSupplier = provider && provider !== "manual";
  return (isSupplier ? FIELD_OWNERS.supplier : FIELD_OWNERS.manual)[field] || "upbuy";
};

module.exports = {
  FIELD_OWNERS,
  RESTORE_FIELDS,
  ownerFor,
  isSupplierOwned: (provider, field) => ownerFor(provider, field) === "supplier",
};
