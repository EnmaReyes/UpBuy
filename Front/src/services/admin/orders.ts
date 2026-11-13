import { serverFetch } from "@/services/api/server";
import type {
  AdminOrder,
  AdminOrderListResult,
  AdminSyncLog,
} from "@/types/admin";

// Lecturas del panel de pedidos en el servidor. Reenvían la cookie y no se
// cachean: el operador necesita el estado real en cada carga.

export type AdminOrderListQuery = {
  q?: string;
  status?: string;
  paymentStatus?: string;
  channel?: string;
  paymentMethod?: string;
  paymentMethodCode?: string;
  provider?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export async function listAdminOrders(
  query: AdminOrderListQuery = {},
): Promise<AdminOrderListResult> {
  return serverFetch<AdminOrderListResult>("/api/admin/orders", { query });
}

export async function getAdminOrder(id: string): Promise<AdminOrder> {
  return serverFetch<AdminOrder>(
    `/api/admin/orders/${encodeURIComponent(id)}`,
  );
}

export async function getAdminOrderSyncHistory(
  id: string,
): Promise<AdminSyncLog[]> {
  const data = await serverFetch<{ logs: AdminSyncLog[] }>(
    `/api/admin/orders/${encodeURIComponent(id)}/sync-history`,
  );
  return data.logs ?? [];
}
