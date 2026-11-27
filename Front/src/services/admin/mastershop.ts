import { serverFetch } from "@/services/api/server";
import type { AdminMastershopAttentionResult } from "@/types/admin";

// Lecturas server-side de los pedidos de MasterShop que necesitan atencion.
// Reenvian la cookie del admin y no se cachean: el operador necesita el estado
// real en cada carga.

export type MastershopAttentionQuery = {
  issue?: "all" | "sync" | "cancel";
  q?: string;
  limit?: number;
  offset?: number;
};

export async function listMastershopAttentionOrders(
  query: MastershopAttentionQuery = {},
): Promise<AdminMastershopAttentionResult> {
  return serverFetch<AdminMastershopAttentionResult>(
    "/api/admin/orders/mastershop/attention",
    { query },
  );
}