// Tipos del panel administrativo (ADM-1).
//
// Reflejan `GET /api/admin/me` y `GET /api/admin/dashboard/summary`. El front
// NO deduce permisos: los recibe del backend y solo los usa para ocultar
// secciones. La autorización real la vuelve a hacer la API en cada petición.

import type { OrderAddressSnapshot, OrderItem } from "@/types/order";

export type AdminRole = "support" | "admin" | "superadmin";

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  support: "Soporte",
  admin: "Administrador",
  superadmin: "Superadministrador",
};

export type AdminPermission =
  | "orders.read"
  | "orders.write"
  | "orders.refund"
  | "catalog.write"
  | "users.read"
  | "users.write"
  | "campaigns.read"
  | "campaigns.send"
  | "providers.manage"
  | "admins.manage"
  | "audit.read";

export type AdminProfile = {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  lastName: string | null;
  phone: string | null;
  image: string | null;
  role: AdminRole;
  permissions: AdminPermission[];
  mfaEnabled: boolean;
  session: {
    expiresAt: string | null;
    mfaAt: string | null;
  } | null;
};

export type DashboardStatusBucket = {
  count: number;
  total: number;
  profit?: number;
};

export type DashboardStats = {
  totalOrders: number;
  ordersToday: number;
  byStatus: Record<string, DashboardStatusBucket>;
  byPaymentStatus: Record<string, DashboardStatusBucket>;
  approvedRevenue: number;
  earnedProfit: number;
  cashIn: number;
  pendingCash: number;
};

export type DashboardSalesPoint = {
  label: string;
  total: number;
  count: number;
  fecha: string;
};

export type DashboardSales = {
  periodo: string;
  actual: DashboardSalesPoint;
  anterior: DashboardSalesPoint;
  serie: DashboardSalesPoint[];
  total: number;
  count: number;
};

export type DashboardAccounting = {
  range: { from: string | null; to: string | null; provider: string | null };
  orders: {
    total: number;
    cancelled: number;
    delivered: number;
    inTransit: number;
  };
  revenue: {
    subtotal: number;
    shipping: number;
    discounts: number;
    gross: number;
  };
  costs: {
    providerCost: number;
    gatewayFee: number;
    providerFee: number;
    total: number;
  };
  profit: {
    net: number;
    marginPercent: number;
  };
  earnedProfit: number;
};

export type DashboardRecentOrder = {
  id: string;
  orderNumber: string;
  createdAt: string;
  recipientName: string | null;
  email: string | null;
  total: number;
  currency: string;
  fulfillmentStatus: string;
  paymentState: string;
  items?: { id: string; quantity: number }[];
};

export type DashboardProvider = {
  name: string;
  configured: boolean;
  modes: string[];
};

export type DashboardSummary = {
  generatedAt: string;
  period: {
    sales: string;
    accounting: { from: string; to: string };
  };
  stats: DashboardStats;
  sales: DashboardSales;
  accounting: DashboardAccounting;
  recentOrders: DashboardRecentOrder[];
  providers: DashboardProvider[];
};

// ---------------------------------------------------------------------------
// Pedidos del panel (ADM-2)
// ---------------------------------------------------------------------------

export type AdminOrderItem = OrderItem;

export type AdminOrderBuyer = {
  id: string;
  username: string | null;
  email: string;
  name: string | null;
  lastName: string | null;
  image: string | null;
};

export type AdminPayment = {
  id: string;
  orderId: string;
  provider: string;
  reference: string;
  providerTransactionId: string | null;
  status: string;
  amountInCents: number;
  currency: string;
  paymentMethodType: string | null;
  statusMessage: string | null;
  failureCode: string | null;
  processedAt: string | null;
  collectedAt: string | null;
  settledAt: string | null;
  payoutAmount: number | null;
  payoutDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminOrderHistoryEntry = {
  id: string;
  kind: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  changedByUserId: string | null;
  changedBy?: {
    id: string;
    username: string | null;
    email: string;
  } | null;
  createdAt: string;
};

export type AdminProviderSync = {
  provider: string | null;
  providerOrderId: string | null;
  outOfSync: boolean;
  manualOverride: boolean;
  lastSyncAt: string | null;
  lastSyncOk: boolean | null;
  lastSyncDirection: string | null;
  lastSyncError: string | null;
  fulfillmentStatus: string | null;
  fulfillmentLabel: string | null;
  paymentState: string | null;
  paymentLabel: string | null;
};

export type AdminAllowedTransition = {
  value: string;
  label: string;
  requiresTracking: boolean;
  requiresStepUp: boolean;
};

export type AdminOrder = {
  id: string;
  orderNumber: string;
  userId: string | null;
  channel: string;
  paymentMethod: string | null;
  paymentMethodCode: string | null;
  fulfillmentStatus: string;
  paymentState: string;
  currency: string;
  subtotal: number;
  shippingCost: number;
  discountTotal: number;
  total: number;
  providerCost: number;
  gatewayFee: number;
  providerFee: number;
  netProfit: number;
  recipientName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  department: string | null;
  postalCode: string | null;
  notes: string | null;
  addressSnapshot: OrderAddressSnapshot | null;
  trackingCarrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  paymentApprovedAt: string | null;
  provider: string | null;
  providerOrderId: string | null;
  providerOutOfSync: boolean;
  manualOverride: boolean;
  createdAt: string;
  updatedAt: string;
  items: AdminOrderItem[];
  payments?: AdminPayment[];
  history?: AdminOrderHistoryEntry[];
  user?: AdminOrderBuyer | null;
  providerSync: AdminProviderSync;
  lastSyncAt: string | null;
  lastSyncOk: boolean | null;
  allowedTransitions: AdminAllowedTransition[];
  providerPush?: Record<string, unknown> | null;
};

export type AdminOrderListItem = Omit<
  AdminOrder,
  "providerSync" | "allowedTransitions" | "lastSyncAt" | "lastSyncOk"
> & {
  items?: AdminOrderItem[];
};

export type AdminOrderListResult = {
  orders: AdminOrderListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminSyncLog = {
  id: string;
  provider: string;
  direction: string;
  attempt: number;
  ok: boolean;
  error: string | null;
  createdAt: string;
};

export type AdminOrderFilters = {
  q: string;
  status: string;
  paymentStatus: string;
  channel: string;
  paymentMethodCode: string;
  provider: string;
  from: string;
  to: string;
};

export const ADMIN_CHANNEL_LABELS: Record<string, string> = {
  web: "Tienda web",
  presencial: "Presencial",
  whatsapp: "WhatsApp",
  otro: "Otro",
};

export const ADMIN_PROVIDER_LABELS: Record<string, string> = {
  vendelo: "Vendelo",
  dropi: "Dropi",
};

export const ADMIN_PAYMENT_METHOD_CODE_LABELS: Record<string, string> = {
  wompi: "Wompi",
  vendelo: "Vendelo",
  cod_dropi: "Contra entrega (Dropi)",
  cod_vendelo: "Contra entrega (Vendelo)",
};

export const ADMIN_MANUAL_PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  nequi: "Nequi",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

export const ADMIN_PAYMENT_STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  anulado: "Anulado",
  reembolsado: "Reembolsado",
  en_revision: "En revisión",
  error: "Error",
};

export const ADMIN_SYNC_DIRECTION_LABELS: Record<string, string> = {
  in: "Lectura del proveedor",
  out: "Envío al proveedor",
};

// ---------------------------------------------------------------------------
// Ventas manuales e importación CSV (ADM-3)
// ---------------------------------------------------------------------------

/** Producto del catálogo que el panel puede usar en una venta manual. */
export type AdminCatalogProduct = {
  id: string;
  sku: string;
  name: string;
  /** Precio base del producto. */
  price: number;
  /** Precio final (con el descuento del producto): el que se cobra. */
  precio: number;
  stock: number;
  sizes: string[];
  active: boolean;
  available: boolean;
};

export type AdminCatalogSearch = {
  products: AdminCatalogProduct[];
  total: number;
  limit: number;
  offset: number;
};

/** Totales que calcula el backend (nunca el navegador). */
export type AdminOrderPreview = {
  lines: {
    productId: string | null;
    title: string;
    size: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  subtotal: number;
  shippingCost: number;
  discountTotal: number;
  total: number;
  currency: string;
  pickup: boolean;
};

export type AdminManualOrderPayload = {
  items: {
    productId: string;
    size?: string | null;
    quantity: number;
  }[];
  shipping: {
    recipientName: string;
    phone: string;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    department?: string | null;
  };
  notes?: string | null;
  channel: string;
  paymentMethod?: string | null;
  paymentStatus: string;
  deliveryType: "envio" | "pickup";
  discount?: number;
};

export type AdminImportRowError = {
  row: number;
  field: string;
  message: string;
};

export type AdminImportSummary = {
  totalRows: number;
  valid: number;
  invalid: number;
  created: number;
  duplicates: number;
  failed: number;
  warnings: number;
};

export type AdminImportDryRun = {
  dryRun: true;
  summary: AdminImportSummary;
  errors: AdminImportRowError[];
  warnings: AdminImportRowError[];
};

export type AdminImportResult = {
  dryRun: false;
  summary: AdminImportSummary;
  created: {
    row: number;
    id: string;
    orderNumber: string;
    externalRef: string | null;
    total: number;
  }[];
  duplicates: {
    row: number;
    externalRef: string | null;
    orderId: string;
    orderNumber: string;
  }[];
  errors: AdminImportRowError[];
  warnings: AdminImportRowError[];
};

export const ADMIN_MANUAL_CHANNEL_LABELS: Record<string, string> = {
  presencial: "Presencial",
  whatsapp: "WhatsApp",
  otro: "Otro",
};

export const ADMIN_IMPORT_STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente de pago",
  pagado: "Pagado",
  en_preparacion: "En preparación",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};
