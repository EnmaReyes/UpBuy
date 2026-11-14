import { apiDownload, apiGet, apiSend, type Query } from "@/services/api/client";
import type {
  AdminVenndeloOrder,
  AdminVenndeloProduct,
  AdminVenndeloWalletBalance,
} from "@/types/admin";

// Mutaciones y descargas del panel de proveedores (ADM-4). Todas pasan por el
// cliente centralizado, que añade cookie y la cabecera CSRF.

export type VenndeloTestResult = {
  ok: boolean;
  latencyMs: number;
  message: string;
  tokenExpiresAt: string | null;
};

export type VenndeloSyncResult = {
  runId?: string;
  status?: string;
  received?: number;
  created?: number;
  updated?: number;
  unchanged?: number;
  errors?: number;
};

export async function testVenndeloConnection(): Promise<VenndeloTestResult> {
  return apiSend<VenndeloTestResult>(
    "/api/admin/suppliers/venndelo/test-connection",
  );
}

export async function syncVenndeloCatalog(
  pageSize?: number,
): Promise<VenndeloSyncResult> {
  return apiSend<VenndeloSyncResult>("/api/admin/suppliers/venndelo/sync", {
    body: pageSize ? { pageSize } : {},
  });
}

export async function publishVenndeloProduct(
  id: string,
): Promise<AdminVenndeloProduct> {
  return apiSend<AdminVenndeloProduct>(
    `/api/admin/suppliers/venndelo/products/${encodeURIComponent(id)}/publish`,
    { body: {} },
  );
}

export async function unpublishVenndeloProduct(
  id: string,
): Promise<AdminVenndeloProduct> {
  return apiSend<AdminVenndeloProduct>(
    `/api/admin/suppliers/venndelo/products/${encodeURIComponent(id)}/unpublish`,
  );
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
