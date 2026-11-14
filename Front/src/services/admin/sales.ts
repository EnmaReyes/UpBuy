import { apiGet } from "@/services/api/client";
import type { AccountingFull, DashboardSales } from "@/types/admin";

// Lecturas de ventas y contabilidad del panel (ADM-6).
//
// Se hacen desde el cliente: el selector de periodo y los filtros de fecha
// actualizan la vista sin recargar la página. Las cookies viajan con
// `credentials: "include"` (apiGet) y el backend revalida la sesión y el
// permiso `orders.read` en cada petición.

export type SalesPeriodo = "dia" | "semana" | "mes" | "anio";

export type SalesAccountingQuery = {
  from?: string;
  to?: string;
  provider?: string;
};

/** Serie de ventas liquidadas (`GET /api/admin/orders/ventas`). */
export async function getSales(periodo: SalesPeriodo): Promise<DashboardSales> {
  return apiGet<DashboardSales>("/api/admin/orders/ventas", {
    query: { periodo },
  });
}

/** Contabilidad del rango (`GET /api/admin/orders/accounting`). */
export async function getSalesAccounting(
  query: SalesAccountingQuery = {},
): Promise<AccountingFull> {
  return apiGet<AccountingFull>("/api/admin/orders/accounting", { query });
}

/**
 * Rango por defecto de la contabilidad: el mes en curso en Bogotá, igual que
 * el resumen del dashboard (`monthRangeBogota` del backend). Se calcula aquí
 * porque la vista es de cliente y no hay rango fijo del servidor.
 */
export function defaultAccountingRange(): { from: string; to: string } {
  const BOGOTA_MS = 5 * 60 * 60 * 1000;
  const bogota = new Date(Date.now() - BOGOTA_MS);
  const year = bogota.getUTCFullYear();
  const month = String(bogota.getUTCMonth() + 1).padStart(2, "0");
  const day = String(bogota.getUTCDate()).padStart(2, "0");
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${day}` };
}
