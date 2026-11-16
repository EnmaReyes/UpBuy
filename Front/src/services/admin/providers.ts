import { serverFetch } from "@/services/api/server";
import type {
  AdminCatalogSupplierStatus,
  AdminProvidersOverview,
  AdminSupplierCatalogProductList,
  AdminVenndeloOrder,
  AdminVenndeloStatus,
  AdminVenndeloSyncHistory,
  AdminVenndeloWalletBalance,
} from "@/types/admin";

// Lecturas server-side del panel de proveedores (ADM-4). Reenvían la cookie
// del admin y nunca se cachean: el operador necesita el estado real.
//
// Las lecturas de catálogo son genéricas por slug: Venndelo y MasterShop
// comparten el mismo contrato del backend. Pedidos y wallet son solo de
// Venndelo (MasterShop no los implementa).

export type CatalogSupplierSlug = "venndelo" | "mastershop";

export async function getProvidersOverview(): Promise<AdminProvidersOverview> {
  return serverFetch<AdminProvidersOverview>("/api/admin/suppliers/overview");
}

export async function getCatalogSupplierStatus(
  slug: CatalogSupplierSlug,
): Promise<AdminCatalogSupplierStatus> {
  return serverFetch<AdminCatalogSupplierStatus>(
    `/api/admin/suppliers/${slug}/status`,
  );
}

export async function listCatalogSupplierProducts(
  slug: CatalogSupplierSlug,
  query: {
    q?: string;
    availability?: string;
    page?: number;
    limit?: number;
  },
): Promise<AdminSupplierCatalogProductList> {
  return serverFetch<AdminSupplierCatalogProductList>(
    `/api/admin/suppliers/${slug}/products`,
    { query },
  );
}

export async function getCatalogSupplierSyncHistory(
  slug: CatalogSupplierSlug,
  query: { limit?: number; offset?: number },
): Promise<AdminVenndeloSyncHistory> {
  return serverFetch<AdminVenndeloSyncHistory>(
    `/api/admin/suppliers/${slug}/sync-history`,
    { query },
  );
}

// --- Compatibilidad: Venndelo Pro ------------------------------------------

export async function getVenndeloStatus(): Promise<AdminVenndeloStatus> {
  return getCatalogSupplierStatus("venndelo");
}

export async function listVenndeloProducts(query: {
  q?: string;
  availability?: string;
  page?: number;
  limit?: number;
}): Promise<AdminSupplierCatalogProductList> {
  return listCatalogSupplierProducts("venndelo", query);
}

export async function getVenndeloSyncHistory(query: {
  limit?: number;
  offset?: number;
}): Promise<AdminVenndeloSyncHistory> {
  return getCatalogSupplierSyncHistory("venndelo", query);
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
