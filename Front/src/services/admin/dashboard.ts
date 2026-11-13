import { serverFetch } from "@/services/api/server";
import type { DashboardSummary } from "@/types/admin";

// Resumen del tablero en una sola llamada: stats, ventas, contabilidad,
// últimas compras y estado de proveedores.
export async function getDashboardSummary(): Promise<DashboardSummary> {
  return serverFetch<DashboardSummary>("/api/admin/dashboard/summary");
}
