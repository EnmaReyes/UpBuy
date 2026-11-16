import type {
  AdminCatalogFilters,
  AdminSupplierTrayFilters,
} from "@/types/admin";

// Construccion de URLs del catalogo. Se usa en el servidor (paginacion) y en
// los componentes cliente (cambiar de pestana sin perder los filtros).

export const CATALOG_PAGE_SIZE = 20;

const trimmed = (value: string) => value.trim();

export function buildCatalogHref(
  filters: AdminCatalogFilters,
  page = 1,
): string {
  const params = new URLSearchParams({ tab: "catalogo" });
  const q = trimmed(filters.q);
  if (q) params.set("q", q);
  if (filters.status) params.set("status", filters.status);
  if (filters.visibility) params.set("visibility", filters.visibility);
  if (filters.stock) params.set("stock", filters.stock);
  if (filters.hasCategory) params.set("hasCategory", filters.hasCategory);
  if (filters.published) params.set("published", filters.published);
  if (filters.provider) params.set("provider", filters.provider);
  if (page > 1) params.set("page", String(page));
  return `/admin/catalogo?${params.toString()}`;
}

export function buildTrayHref(
  filters: AdminSupplierTrayFilters,
  page = 1,
): string {
  const params = new URLSearchParams({ tab: "bandeja" });
  const q = trimmed(filters.q);
  if (q) params.set("q", q);
  if (filters.availability) params.set("availability", filters.availability);
  if (filters.provider) params.set("provider", filters.provider);
  if (page > 1) params.set("trayPage", String(page));
  return `/admin/catalogo?${params.toString()}`;
}
