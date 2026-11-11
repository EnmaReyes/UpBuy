import { serverFetch } from "@/services/api/server";
import type { Order, OrderListItem } from "@/types/order";

// Lecturas de pedidos en el servidor (reenvían la cookie de la petición).

export async function getOrder(id: string): Promise<Order> {
  return serverFetch<Order>(`/api/orders/${encodeURIComponent(id)}`);
}

export async function listOrders(
  params: { limit?: number; offset?: number } = {},
): Promise<{
  orders: OrderListItem[];
  total: number;
  limit: number;
  offset: number;
}> {
  return serverFetch("/api/orders", { query: params });
}