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

/** Cubo de dinero por estado (pedidos y monto). */
export type AccountingBucket = { orders: number; amount: number };

/** Desglose de ventas por proveedor (contabilidad, ADM-6). */
export type AccountingByProvider = {
  /** `vendelo` | `dropi` | `sin_proveedor`. */
  provider: string;
  orders: number;
  gross: number;
  providerCost: number;
  netProfit: number;
};

/** Desglose por método de pago (contabilidad, ADM-6). */
export type AccountingByMethod = {
  /** `wompi` | `vendelo` | `cod_dropi` | `cod_vendelo` | `sin_metodo`. */
  method: string;
  orders: number;
  amount: number;
  gatewayFee: number;
};

/** Contabilidad completa de `GET /api/admin/orders/accounting` (ADM-6). */
export type AccountingFull = DashboardAccounting & {
  cash: {
    settled: AccountingBucket;
    collected: AccountingBucket;
    pendingCollection: AccountingBucket;
    unpaid: AccountingBucket;
    payouts: { count: number; amount: number };
  };
  /** Desglose COD por estado de pago. */
  cod: Record<string, AccountingBucket>;
  byProvider: AccountingByProvider[];
  byPaymentMethodCode: AccountingByMethod[];
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
  accounting: AccountingFull;
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

/** Pedido web nuevo para los avisos de compra en vivo (ADM-5). */
export type AdminRecentOrder = {
  id: string;
  orderNumber: string;
  channel: string;
  total: number;
  recipientName: string | null;
  createdAt: string;
  user?: AdminOrderBuyer | null;
};

export type AdminRecentOrdersResult = {
  orders: AdminRecentOrder[];
  count: number;
  serverTime: string;
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

// ---------------------------------------------------------------------------
// Proveedores y control operativo (ADM-4)
// ---------------------------------------------------------------------------

/** Corrida de catálogo (Venndelo Pro, MasterShop). */
export type AdminCatalogRun = {
  id: string;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  received: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
  /** Nuevos publicados por la política automática del proveedor. */
  publishedCreated: number;
  /** Ya publicados que cambiaron al sincronizar. */
  publishedUpdated: number;
  /** Ocultados porque el proveedor dejó de ofrecerlos. */
  hidden: number;
  /** No publicados (sin disponibilidad o error). */
  skipped: number;
  errorSummary: { motivo?: string; [key: string]: unknown }[];
};

export type AdminCatalogProviderHealth = {
  id: string;
  slug: string;
  name: string;
  label: string;
  isActive: boolean;
  configured: boolean;
  supplierProducts: number;
  publishedProducts: number;
  lastActivityAt: string | null;
  lastRun: AdminCatalogRun | null;
};

export type AdminOrderProviderHealth = {
  name: string;
  label: string;
  configured: boolean;
  modes: string[];
  mode: "api" | "manual";
  totalOrders: number;
  outOfSyncOrders: number;
  lastActivityAt: string | null;
  lastSyncOk: boolean | null;
  lastSyncError: string | null;
};

export type AdminProviderHealthUpdate = {
  time: string;
  label: string;
  note?: string;
};

export type AdminProviderHealthIncident = {
  title: string;
  status: "degraded" | "down";
  minutes: number;
  updates: AdminProviderHealthUpdate[];
};

export type AdminProviderHealthService = {
  name: string;
  label: string;
  incidents: Record<number, AdminProviderHealthIncident>;
  missing: number;
  days: number;
  totalEvents: number;
  failures: number;
};

export type AdminProviderHealth = {
  days: number;
  endDate: string;
  services: AdminProviderHealthService[];
};

export type AdminProvidersOverview = {
  generatedAt: string;
  catalogProviders: AdminCatalogProviderHealth[];
  orderProviders: AdminOrderProviderHealth[];
  outOfSync: number;
  health: AdminProviderHealth;
};

/** Política de publicación configurada en el proveedor de catálogo. */
export type AdminPublishPolicy = "manual" | "auto_draft" | "auto_visible";

/** Estado de un proveedor de catálogo (sin secretos). */
export type AdminCatalogSupplierStatus = {
  supplier: {
    slug: string;
    name: string;
    isActive: boolean;
    baseUrl: string;
    publishPolicy: AdminPublishPolicy;
    defaultCategoryId: string | null;
  };
  configured: boolean;
  token: { cached: boolean; expiresAt: string | null };
  /** Solo los proveedores con credenciales rotables (Venndelo) lo devuelven. */
  credentials?: {
    persisted: boolean;
    refreshTokenRotatedAt: string | null;
    refreshTokenExpiresAt: string | null;
    encryptionConfigured: boolean;
  } | null;
  catalog: { supplierProducts: number; publishedProducts: number };
  lastRun: AdminCatalogRun | null;
};

/** Alias histórico: el panel de Venndelo usa la misma forma genérica. */
export type AdminVenndeloStatus = AdminCatalogSupplierStatus;

export type AdminVenndeloVariation = {
  id: string;
  externalId: string | null;
  sku: string | null;
  attributes?: Record<string, unknown>;
  quantity: number;
  supplierPrice: string | number | null;
  originalPrice: string | number | null;
};

/** Producto del proveedor con el estado de su publicación en UPBUY. */
export type AdminSupplierCatalogProduct = {
  id: string;
  externalId: string;
  name: string;
  availability: boolean;
  totalQuantity: number;
  originalPrice: string | number | null;
  currency: string;
  lastSyncedAt: string | null;
  variations?: AdminVenndeloVariation[];
  published: {
    id: string;
    sku: string;
    slug: string;
    price: string | number;
    status: string;
    active: boolean;
  } | null;
};

export type AdminSupplierCatalogProductList = {
  products: AdminSupplierCatalogProduct[];
  total: number;
  page: number;
  limit: number;
};

/** Alias histórico del catálogo de Venndelo. */
export type AdminVenndeloProduct = AdminSupplierCatalogProduct;
export type AdminVenndeloProductList = AdminSupplierCatalogProductList;

export type AdminVenndeloSyncHistory = {
  runs: AdminCatalogRun[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminVenndeloWalletDetail = {
  description?: string;
  amount?: number;
  [key: string]: unknown;
};

export type AdminVenndeloWalletBalance = {
  balance: number | null;
  detail: AdminVenndeloWalletDetail[];
};

export type AdminVenndeloOrder = {
  id?: string;
  order_id?: string;
  external_order_id?: string;
  status?: string;
  confirmation_status?: string;
  created_at?: string;
  total?: number;
  currency?: string;
  customer?: Record<string, unknown>;
  [key: string]: unknown;
};

export const ADMIN_VENNDELO_ORDER_STATUS_LABELS: Record<string, string> = {
  ANY: "Todos",
  PENDING: "Pendiente",
  READY: "Listo",
  PREPARING: "En preparación",
  SHIPPED: "Enviado",
  INCIDENT: "Incidencia",
  DELIVERED: "Entregado",
  RETURNED: "Devuelto",
  CANCELLED: "Cancelado",
};

export const ADMIN_VENNDELO_CONFIRMATION_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmado",
  REJECTED: "Rechazado",
  PENDING: "Sin confirmar",
};

export const ADMIN_CATALOG_RUN_STATUS_LABELS: Record<string, string> = {
  running: "En curso",
  success: "Correcta",
  error: "Con errores",
};

export const ADMIN_CATALOG_TRIGGER_LABELS: Record<string, string> = {
  manual: "Manual",
  cron: "Automática",
};

export type AdminProviderOrdersFilters = {
  provider: string;
  outOfSync: boolean;
  from: string;
  to: string;
};

// ---------------------------------------------------------------------------
// Seguridad del administrador (ADM-S2 / ADM-S3)
// ---------------------------------------------------------------------------

/** Estado personal de seguridad (`GET /api/admin/admins/security`). */
export type AdminSecurityOverview = {
  mfa: {
    enabled: boolean;
    enrolledAt: string | null;
  };
  backupCodes: {
    /** Códigos generados en total (incluye los ya usados). */
    total: number;
    /** Códigos que todavía sirven una vez. */
    remaining: number;
  };
  sessions: {
    active: number;
    currentSessionId: string | null;
  };
  policy: {
    idleMinutes: number;
    maxHours: number;
    stepUpMinutes: number;
  };
};

/** Una sesión administrativa viva (`GET /api/admin/admins/sessions`). */
export type AdminSessionInfo = {
  id: string;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  mfaAt: string | null;
  ip: string | null;
  userAgent: string | null;
  /** La sesión desde la que se está viendo la página. */
  current: boolean;
};



// ---------------------------------------------------------------------------
// Difusión por email (ADM-7)
// ---------------------------------------------------------------------------

export type GmailStatus = {
  /** OAuth + clave de cifrado presentes en el backend. */
  configured: boolean;
  /** El admin ya autorizó Gmail (hay refresh token cifrado). */
  connected: boolean;
  from: string;
  dailyLimit: number;
  sentToday: number;
  /** Redirect URI que hay que registrar en Google Cloud Console. */
  redirectPath: string | null;
};

export type CampaignSegment = "todos" | "compradores" | "sin_compras";

export const CAMPAIGN_SEGMENT_LABELS: Record<CampaignSegment, string> = {
  todos: "Todos con consentimiento",
  compradores: "Solo compradores",
  sin_compras: "Registrados sin pedidos",
};

export type AudiencePreview = {
  segment: CampaignSegment;
  label: string;
  count: number;
  sample: {
    id: string;
    email: string;
    name: string;
    optedInAt: string | null;
  }[];
};

export type CampaignStatus = "draft" | "sending" | "sent" | "failed";

export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  sending: "Enviando",
  sent: "Enviada",
  failed: "Con fallos",
};

export type CampaignBatchResult = {
  sent?: number;
  failed?: number;
  excludedByConsent?: number;
  dailyLimitReached?: boolean;
  at?: string;
};

export type AdminCampaign = {
  id: string;
  subject: string;
  segment: string;
  channel: string;
  status: CampaignStatus;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  sentAt: string | null;
  lastBatchResult: CampaignBatchResult | null;
};

export type CampaignListResponse = {
  campaigns: AdminCampaign[];
  total: number;
  limit: number;
  offset: number;
};

export type CampaignRecipientRow = {
  id: string;
  userId: string;
  email: string;
  status: "pending" | "claimed" | "sent" | "failed" | "excluded";
  error: string | null;
  sentAt: string | null;
  createdAt: string;
  user?: { name: string | null; lastName: string | null } | null;
};

export type CampaignDetail = {
  campaign: AdminCampaign;
  recipients: CampaignRecipientRow[];
};

export type SendBatchResult = {
  sent: number;
  failed: number;
  remaining: number;
  errors: { userId: string; email?: string; phone?: string; error: string }[];
  dailyLimitReached?: boolean;
  done?: boolean;
};

// ---------------------------------------------------------------------------
// Difusión por WhatsApp (ADM-8)
// ---------------------------------------------------------------------------

export type WhatsappStatus = {
  configured: boolean;
  apiVersion: string;
  templateMarketing: string | null;
  templateLang: string;
  dailyLimit: number;
  sentToday: number;
};

export type WhatsappAudiencePreview = {
  channel: "whatsapp";
  segment: CampaignSegment;
  label: string;
  /** Destinatarios con teléfono E.164 válido y consentimiento vigente. */
  count: number;
  /** Excluidos por teléfono no normalizable. */
  invalidCount: number;
  invalidPhoneIds: string[];
  sample: { id: string; phone: string }[];
};

export type WhatsappSendBatchResult = {
  sent: number;
  failed: number;
  remaining: number;
  errors: { userId: string; phone: string; error: string }[];
  dailyLimitReached?: boolean;
  done?: boolean;
};

export type WhatsappManualRow = {
  recipientId: string;
  userId: string;
  name: string;
  phone: string | null;
  status: string;
  error: string | null;
  /** Mensaje renderizado con las variables resueltas. */
  message: string;
  /** Enlace wa.me con el texto precargado. */
  waMeLink: string | null;
};

export type WhatsappManualListResponse = {
  campaignId: string;
  rows: WhatsappManualRow[];
};

// ---------------------------------------------------------------------------
// Clientes / usuarios (ADM-9)
// ---------------------------------------------------------------------------

export type AdminClientListItem = {
  id: string;
  username: string | null;
  email: string;
  name: string | null;
  lastName: string | null;
  phone: string | null;
  address: string | null;
  image: string | null;
  role: string;
  disabled: boolean;
  tokenVersion?: number;
  profileComplete: boolean;
  marketingOptIn: boolean;
  marketingOptInAt: string | null;
  unsubscribedAt: string | null;
  emailBouncedAt: string | null;
  whatsappOptIn: boolean;
  whatsappOptInAt: string | null;
  whatsappUnsubscribedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  /** Solo en el listado: resumen calculado por el backend. */
  ordersCount?: number;
  totalSpent?: number;
};

export type AdminClientListResult = {
  users: AdminClientListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminClientFilters = {
  q: string;
  segment: "" | "con_compras" | "sin_compras";
  consent: "" | "email" | "whatsapp" | "ninguno";
  registeredFrom: string;
  registeredTo: string;
};

export type AdminClientAddress = {
  id: string;
  address: string;
  department: string | null;
  city: string | null;
  reference: string | null;
  isDefault: boolean;
};

export type AdminClientDetail = {
  user: AdminClientListItem;
  addresses: AdminClientAddress[];
  summary: {
    ordersCount: number;
    totalSpent: number;
    lastOrderAt: string | null;
  };
};

export type AdminClientOrdersResult = {
  orders: {
    id: string;
    orderNumber: string;
    total: number;
    fulfillmentStatus: string;
    paymentState: string;
    city: string | null;
    createdAt: string;
  }[];
  total: number;
  limit: number;
  offset: number;
};

export type UpdateClientResult = {
  user: AdminClientListItem;
  missing: string[];
};

// ---------------------------------------------------------------------------
// Catalogo UPBUY (curaduria)
// ---------------------------------------------------------------------------

/** Estado editorial del producto en la tienda. */
export type AdminProductStatus = "draft" | "active" | "archived";

export const ADMIN_PRODUCT_STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  active: "Activo",
  archived: "Archivado",
};

/** Categoria interna (N:M con productos). */
export type AdminProductCategory = {
  id: string;
  name: string;
  slug: string;
};

/** Imagen de la galeria del producto. */
export type AdminProductImage = {
  id: string;
  url: string;
  position: number;
  isPrimary: boolean;
  externalAssetId?: string | null;
};

/** Producto tal como lo devuelve `GET /api/admin/products`. */
export type AdminProduct = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  /** Precio final con el descuento del producto. */
  precio: number;
  precioOriginal: number;
  descuentoPorcentaje: number | null;
  destacadas: boolean;
  stock: number;
  /** Costo del proveedor (solo lectura). */
  cost: number | null;
  /** Multiplicador aplicado al costo. */
  markup: number | null;
  currency: string;
  status: AdminProductStatus | string;
  active: boolean;
  available: boolean;
  images: string[];
  gallery: AdminProductImage[];
  categories: AdminProductCategory[];
  sizes?: string[];
  provider: string | null;
  providerSku: string | null;
  supplierId: string | null;
  supplierProductId: string | null;
  manualOverrides: Record<string, boolean> | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminProductListResult = {
  products: AdminProduct[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminCatalogFilters = {
  q: string;
  status: "" | AdminProductStatus;
  visibility: "" | "visible" | "hidden";
  stock: "" | "in" | "out";
  hasCategory: "" | "true" | "false";
  published: "" | "1" | "0";
  provider: string;
};

export type AdminProductBulkAction =
  | "make_visible"
  | "hide"
  | "archive"
  | "restore_draft"
  | "apply_markup"
  | "set_categories"
  | "feature";

export type AdminProductBulkResult = {
  requested: number;
  updated: number;
  skipped: { id: string; motivo: string }[];
};

/** Categoria del panel; incluye inactivas y el conteo de productos. */
export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
};

export type AdminCategoryList = {
  categories: AdminCategory[];
};

// ---------------------------------------------------------------------------
// Curaduria de la portada
// ---------------------------------------------------------------------------

/** Clave canonica de una seccion de la Home (la que acepta el backend). */
export type AdminHomeSectionKey = "seleccion" | "novedades" | "favoritos";

/** Ranura curada dentro de una seccion de la portada. */
export type AdminHomeSlot = {
  productId: string;
  name: string;
  sku: string;
  /** Posicion 1..4 dentro de la seccion. */
  position: number;
  /** Unidades vendidas en los ultimos 90 dias (0 si no hay ventas). */
  unitsSold: number;
  image?: string | null;
};

/** Respuesta de `GET /api/admin/products/home-sections`. */
export type AdminHomeSections = {
  featured: AdminHomeSlot[];
  newArrivals: AdminHomeSlot[];
  communityFavorites: AdminHomeSlot[];
  /** Top 20 de favoritos por unidades vendidas (relleno automatico). */
  ranking: AdminHomeSlot[];
};

/** Producto original del proveedor en la bandeja (aun sin publicar). */
export type AdminSupplierTrayItem = {
  id: string;
  externalId: string;
  name: string;
  description: string | null;
  availability: boolean;
  totalQuantity: number;
  originalPrice: string | number | null;
  currency: string;
  /** Proveedor del que vino: la bandeja es global. */
  supplier: { id: string; slug: string; name: string };
  assets: {
    id: string;
    url: string;
    position: number;
    externalAssetId?: string | null;
  }[];
  variations?: {
    id: string;
    sku: string | null;
    quantity: number;
    supplierPrice: string | number | null;
  }[];
  lastSyncedAt: string | null;
  updatedAt: string;
  published: {
    id: string;
    sku: string;
    slug: string;
    price: string | number;
    status: string;
    active: boolean;
  } | null;
};

export type AdminSupplierTrayResult = {
  products: AdminSupplierTrayItem[];
  total: number;
  page: number;
  limit: number;
};

export type AdminSupplierTrayFilters = {
  q: string;
  availability: "" | "true" | "false";
  /** Slug del proveedor; vacio = todos los conectados. */
  provider: string;
};

export type AdminSupplierTraySettings = {
  slug: string;
  publishPolicy: "manual" | "auto_draft" | "auto_visible";
  defaultCategoryId: string | null;
};

export const ADMIN_PUBLISH_POLICY_LABELS: Record<string, string> = {
  manual: "Manual: tú publicas desde la bandeja",
  auto_draft: "Automática en borrador",
  auto_visible: "Automática y visible",
};
