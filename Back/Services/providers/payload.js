// Payload comun para crear un pedido en un proveedor de dropshipping.
//
// Cada adaptador tiene su propio formato, pero todos parten de los mismos
// datos: el pedido de Upbuy (ya con su snapshot de direccion) y sus items.
// Centralizarlo evita que un adaptador mande un campo que el otro olvido.

// Los proveedores manejan telephone con indicativo. En Colombia es +57.
const normalizePhone = (phone) => {
  const raw = String(phone || "").replace(/[^\d+]/g, "");
  if (!raw) return "";
  if (raw.startsWith("+")) return raw;
  if (raw.startsWith("57")) return `+${raw}`;
  return `+57${raw}`;
};

// Direccion de entrega: se prefiere el snapshot congelado del pedido (lo que
// el cliente eligio al comprar), con el pedido como respaldo.
const buildShippingAddress = (order = {}) => {
  const snapshot = order.addressSnapshot || {};
  return {
    name: snapshot.recipientName || order.recipientName || "",
    phone: normalizePhone(snapshot.phone || order.phone),
    email: snapshot.email || order.email || "",
    address: snapshot.address || order.address || "",
    city: snapshot.city || order.city || "",
    state: snapshot.department || order.department || "",
    postalCode: snapshot.postalCode || order.postalCode || "",
    reference: snapshot.reference || null,
    notes: snapshot.notes || order.notes || null,
  };
};

const buildOrderPayload = ({ order, items = [] } = {}) => ({
  // Referencia externa: el proveedor la guarda y permite casar el pedido
  // cuando el webhook o el sync lo devuelvan.
  externalId: order.orderNumber,
  externalReference: order.id,
  createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : null,
  currency: order.currency || "COP",
  paymentMethod: order.paymentMethodCode || null,
  notes: order.notes || null,
  shippingAddress: buildShippingAddress(order),
  items: items.map((item) => ({
    sku: item.sku || item.productId || null,
    name: item.name || item.title || null,
    quantity: Number(item.quantity) || 1,
    unitPrice: Number(item.unitPrice) || 0,
    total: (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0),
  })),
  totals: {
    subtotal: Number(order.subtotal) || 0,
    shipping: Number(order.shippingCost) || 0,
    discount: Number(order.discountTotal) || 0,
    total: Number(order.total) || 0,
  },
});

module.exports = {
  buildOrderPayload,
  buildShippingAddress,
  normalizePhone,
};
