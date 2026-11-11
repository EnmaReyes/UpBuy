// Tipos de pedido.
//
// Reflejan la respuesta de `POST /api/orders` y `GET /api/orders/:id`
// (el backend devuelve el pedido completo con `items`, `payments` e `history`).

export type OrderItem = {
  id: string;
  productId: string;
  productType: string;
  title: string;
  imageUrl: string | null;
  size: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  nameSnapshot?: string | null;
};

export type OrderAddressSnapshot = {
  recipientName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  department?: string;
  postalCode?: string | null;
  reference?: string | null;
  notes?: string | null;
};

export type Order = {
  id: string;
  orderNumber: string;
  userId: string | null;
  fulfillmentStatus: string;
  paymentState: string;
  paymentMethodCode: string | null;
  currency: string;
  subtotal: number;
  shippingCost: number;
  discountTotal: number;
  total: number;
  recipientName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  department: string | null;
  postalCode: string | null;
  notes: string | null;
  shippingZone: string | null;
  estimatedDeliveryDays: number | null;
  addressSnapshot: OrderAddressSnapshot | null;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
};

export type OrderListItem = Pick<
  Order,
  | "id"
  | "orderNumber"
  | "fulfillmentStatus"
  | "paymentState"
  | "total"
  | "currency"
  | "createdAt"
> & { items: OrderItem[] };

/** Ítem que acepta `POST /api/orders`. El precio y el stock los resuelve el
 *  backend; el cliente solo identifica producto, cantidad y talla. */
export type CreateOrderItem = {
  productId: string;
  quantity: number;
  size?: string | null;
};

export type PaymentMethodCode =
  | "wompi"
  | "cod_vendelo"
  | "cod_dropi";

export type CreateOrderInput = {
  items: CreateOrderItem[];
  /** Opcional: si se omite, el backend lo completa con el perfil y la
   *  dirección principal. Se envía solo cuando el comprador elige otra. */
  shipping?: {
    recipientName?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    department?: string;
    postalCode?: string | null;
    reference?: string | null;
  };
  notes?: string;
  /** Pasarela. El backend público hoy solo crea pedidos Wompi. */
  paymentMethodCode?: PaymentMethodCode;
};

export const FULFILLMENT_LABELS: Record<string, string> = {
  pending_payment: "Pendiente de pago",
  paid: "Pagado",
  packing: "En preparación",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export const PAYMENT_STATE_LABELS: Record<string, string> = {
  unpaid: "Sin pagar",
  pending_collection: "Pago contra entrega",
  collected: "Cobrado",
  settled: "Pagado",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  wompi: "Pago en línea (Wompi)",
  cod_vendelo: "Contra entrega",
  cod_dropi: "Contra entrega",
  vendelo: "Pago en línea (Vendelo)",
};