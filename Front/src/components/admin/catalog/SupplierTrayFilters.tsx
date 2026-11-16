import Link from "next/link";
import { Search } from "lucide-react";
import type { AdminSupplierTrayFilters } from "@/types/admin";

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-carbon focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const labelClass =
  "text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase";

export function SupplierTrayFilters({
  filters,
}: {
  filters: AdminSupplierTrayFilters;
}) {
  return (
    <form
      method="get"
      action="/admin/catalogo"
      aria-label="Filtros de productos sin publicar"
      className="rounded-xl border border-border bg-card p-4"
    >
      <input type="hidden" name="tab" value="bandeja" />

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_200px]">
        <div>
          <label htmlFor="tray-q" className={labelClass}>
            Buscar en el proveedor
          </label>
          <div className="relative mt-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="tray-q"
              name="q"
              type="search"
              defaultValue={filters.q}
              placeholder="Nombre o ID externo"
              className={`${fieldClass} pl-9`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="tray-provider" className={labelClass}>
            Proveedor
          </label>
          <select
            id="tray-provider"
            name="provider"
            defaultValue={filters.provider}
            className={`${fieldClass} mt-1`}
          >
            <option value="">Todos</option>
            <option value="venndelo">Venndelo Pro</option>
            <option value="mastershop">MasterShop</option>
          </select>
        </div>

        <div>
          <label htmlFor="tray-availability" className={labelClass}>
            Disponibilidad
          </label>
          <select
            id="tray-availability"
            name="availability"
            defaultValue={filters.availability}
            className={`${fieldClass} mt-1`}
          >
            <option value="">Todas</option>
            <option value="true">Con stock</option>
            <option value="false">Sin stock</option>
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Buscar
        </button>
        <Link
          href="/admin/catalogo?tab=bandeja"
          className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Limpiar
        </Link>
      </div>
    </form>
  );
}
