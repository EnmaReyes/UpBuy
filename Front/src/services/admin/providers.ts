import { serverFetch } from "@/services/api/server";
import type {
  AdminProvidersOverview,
  AdminVenndeloOrder,
  AdminVenndeloProductList,
  AdminVenndeloStatus,
  AdminVenndeloSyncHistory,
  AdminVenndeloWalletBalance,
} from "@/types/admin";

// Lecturas server-side del panel de proveedores (ADM-4). Reenvían la cookie
// del admin y nunca se cachean: el operador necesita el estado real.

export async function getProvidersOverview(): Promise<AdminProvidersOverview> {
  return serverFetch<AdminProvidersOverview>("/api/admin/suppliers/overview");
}

export async function getVenndeloStatus(): Promise<AdminVenndeloStatus> {
  return serverFetch<AdminVenndeloStatus>("/api/admin/suppliers/venndelo/status");
}

export async function listVenndeloProducts(query: {
  q?: string;
  availability?: string;
  page?: number;
  limit?: number;
}): Promise<AdminVenndeloProductList> {
  return serverFetch<AdminVenndeloProductList>(
    "/api/admin/suppliers/venndelo/products",
    { query },
  );
}

export async function listVenndeloOrders(query: {
  status?: string;
  page_token?: string;
  page_size?: number;
  created_min?: string;
  created_max?: string;
}): Promise<AdminVenndeloOrder[]> {
  return serverFetch<AdminVenndeloOrder[]>(
    "/api/admin/suppliers/venndelo/orders",
    { query },
  );
}

export async function getVenndeloWalletBalance(): Promise<AdminVenndeloWalletBalance> {
  return serverFetch<AdminVenndeloWalletBalance>(
    "/api/admin/suppliers/venndelo/wallet/balance",
  );
}

export async function getVenndeloSyncHistory(query: {
  limit?: number;
  offset?: number;
}): Promise<AdminVenndeloSyncHistory> {
  return serverFetch<AdminVenndeloSyncHistory>(
    "/api/admin/suppliers/venndelo/sync-history",
    { query },
  );
}
