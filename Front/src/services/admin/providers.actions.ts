import { apiDownload, apiGet, apiSend, type Query } from "@/services/api/client";
import type { CatalogSupplierSlug } from "@/services/admin/providers";
import type {
  AdminProduct,
  AdminVenndeloOrder,
  AdminVenndeloWalletBalance,
} from "@/types/admin";

// Mutaciones y descargas del panel de proveedores (ADM-4). Todas pasan por el
// cliente centralizado, que añade cookie y la cabecera CSRF.
//
// Conexión y catálogo son genéricos por slug: Venndelo y MasterShop comparten
// los mismos endpoints. Pedidos y wallet solo existen para Venndelo.

export type CatalogSupplierTestResult = {
  ok: boolean;
  latencyMs: number;
  message: string;
  /** Solo los proveedores con OAuth lo devuelven (Venndelo). */
  tokenExpiresAt?: string | null;
  /** Cuántos productos ve la llave (MasterShop). */
  totalProducts?: number;
  /** Cabeceras de límite de uso que reporte el proveedor (MasterShop). */
  rateLimit?: Record<string, unknown> | null;
};

export type CatalogSupplierSyncResult = {
  runId?: string;
  status?: string;
  received?: number;
  created?: number;
  updated?: number;
  unchanged?: number;
  errors?: number;
  /** Politica aplicada en esta corrida. */
  publishPolicy?: "manual" | "auto_draft" | "auto_visible";
  /** Nuevos publicados por la politica automatica. */
  publishedCreated?: number;
  /** Ya publicados que cambiaron. */
  publishedUpdated?: number;
  /** Ocultados por falta de disponibilidad. */
  hidden?: number;
  /** No publicados (sin stock o error). */
  skipped?: number;
};

/** Alias histórico. */
export type VenndeloTestResult = CatalogSupplierTestResult;
export type VenndeloSyncResult = CatalogSupplierSyncResult;

export async function testCatalogSupplierConnection(
  slug: CatalogSupplierSlug,
): Promise<CatalogSupplierTestResult> {
  return apiSend<CatalogSupplierTestResult>(
    `/api/admin/suppliers/${slug}/test-connection`,
  );
}

export async function syncCatalogSupplier(
  slug: CatalogSupplierSlug,
  pageSize?: number,
): Promise<CatalogSupplierSyncResult> {
  return apiSend<CatalogSupplierSyncResult>(
    `/api/admin/suppliers/${slug}/sync`,
    { body: pageSize ? { pageSize } : {} },
  );
}

export async function publishCatalogSupplierProduct(
  slug: CatalogSupplierSlug,
  id: string,
  options: {
    visibility?: "draft" | "visible";
    markup?: number;
    price?: number;
    categoryIds?: string[];
  } = {},
): Promise<AdminProduct> {
  return apiSend<AdminProduct>(
    `/api/admin/suppliers/${slug}/products/${encodeURIComponent(id)}/publish`,
    { body: options },
  );
}

export async function unpublishCatalogSupplierProduct(
  slug: CatalogSupplierSlug,
  id: string,
): Promise<AdminProduct> {
  return apiSend<AdminProduct>(
    `/api/admin/suppliers/${slug}/products/${encodeURIComponent(id)}/unpublish`,
  );
}

export async function publishCatalogSupplierBulk(
  slug: CatalogSupplierSlug,
  payload: {
    productIds?: string[];
    filters?: Record<string, unknown>;
    markup?: number;
    visibility?: "draft" | "visible";
  },
): Promise<{ requested: number; updated: number; skipped: unknown[] }> {
  return apiSend(`/api/admin/suppliers/${slug}/products/publish-bulk`, {
    body: payload,
  });
}

// --- Compatibilidad: Venndelo Pro ------------------------------------------

export async function testVenndeloConnection(): Promise<VenndeloTestResult> {
  return testCatalogSupplierConnection("venndelo");
}

export async function syncVenndeloCatalog(
  pageSize?: number,
): Promise<VenndeloSyncResult> {
  return syncCatalogSupplier("venndelo", pageSize);
}

export async function publishVenndeloProduct(
  id: string,
  options: { visibility?: "draft" | "visible"; markup?: number } = {},
): Promise<AdminProduct> {
  return publishCatalogSupplierProduct("venndelo", id, options);
}

export async function unpublishVenndeloProduct(
  id: string,
): Promise<AdminProduct> {
  return unpublishCatalogSupplierProduct("venndelo", id);
}

export async function topupVenndeloWallet(amount: number): Promise<string> {
  const result = await apiSend<{ payment_url: string }>(
    "/api/admin/suppliers/venndelo/wallet/topup",
    { body: { amount } },
  );
  return result.payment_url;
}

export async function getVenndeloWallet(): Promise<AdminVenndeloWalletBalance> {
  return apiGet<AdminVenndeloWalletBalance>(
    "/api/admin/suppliers/venndelo/wallet/balance",
  );
}

export async function getVenndeloOrder(id: string): Promise<AdminVenndeloOrder> {
  return apiGet<AdminVenndeloOrder>(
    `/api/admin/suppliers/venndelo/orders/${encodeURIComponent(id)}`,
  );
}

export async function cancelVenndeloOrder(id: string): Promise<unknown> {
  return apiSend<unknown>(
    `/api/admin/suppliers/venndelo/orders/${encodeURIComponent(id)}/cancel`,
  );
}

export async function confirmVenndeloOrder(
  id: string,
  confirmationStatus: "CONFIRMED" | "REJECTED",
): Promise<AdminVenndeloOrder> {
  return apiSend<AdminVenndeloOrder>(
    `/api/admin/suppliers/venndelo/orders/${encodeURIComponent(id)}/confirmation`,
    { body: { confirmation_status: confirmationStatus } },
  );
}

export async function quoteVenndeloOrder(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return apiSend<Record<string, unknown>>(
    "/api/admin/suppliers/venndelo/orders/quotation",
    { body: payload },
  );
}

export async function createVenndeloOrder(
  payload: Record<string, unknown>,
): Promise<AdminVenndeloOrder> {
  return apiSend<AdminVenndeloOrder>(
    "/api/admin/suppliers/venndelo/orders",
    { body: payload },
  );
}

/** Descarga la lista filtrada de pedidos como CSV (estados ya traducidos). */
export async function downloadProviderOrdersCsv(
  query: Query,
): Promise<void> {
  const blob = await apiDownload("/api/admin/orders/export.csv", { query });
  const stamp = new Date().toISOString().slice(0, 10);
  const provider = typeof query.provider === "string" ? `-${query.provider}` : "";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `upbuy-pedidos${provider}-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
