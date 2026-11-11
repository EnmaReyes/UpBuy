// Seguimiento público de un pedido.
//
// Lo devuelve `GET /api/orders/:id/tracking?phone=|email=`. El backend no
// incluye dirección, correo ni teléfono: solo el estado, la guía y las fechas.
// El comprador debe demostrar que conoce el teléfono o el correo del pedido.

export type PublicTracking = {
  id: string;
  orderNumber: string;
  fulfillmentStatus: string;
  paymentState: string;
  fulfillmentLabel: string | null;
  paymentLabel: string | null;
  /** Mensaje listo para mostrar, redactado por el backend. */
  message: string | null;
  tracking: {
    carrier: string | null;
    number: string | null;
    url: string | null;
  };
  estimatedDeliveryDays: number | null;
  dates: {
    createdAt: string;
    shippedAt: string | null;
    deliveredAt: string | null;
    cancelledAt: string | null;
  };
};
