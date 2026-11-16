import Link from "next/link";
import { Search } from "lucide-react";
import type { AdminCatalogFilters } from "@/types/admin";

// Filtros del catalogo. Formulario GET nativo: la URL es compartible y
// sobrevive a una recarga sin JavaScript. La pestana viaja en `tab`.

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-carbon focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const labelClass =
  "text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase";

export function CatalogFilters({ filters }: { filters: AdminCatalogFilters }) {
  return (
    <form
      method="get"
      action="/admin/catalogo"
      aria-label="Filtros del catálogo"
      className="rounded-xl border border-border bg-card p-4"
    >
      <input type="hidden" name="tab" value="catalogo" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor="catalog-q" className={labelClass}>
            Buscar
          </label>
          <div className="relative mt-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="catalog-q"
              name="q"
              type="search"
              defaultValue={filters.q}
              placeholder="Nombre, SKU o SKU del proveedor"
              className={`${fieldClass} pl-9`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="catalog-visibility" className={labelClass}>
            Visibilidad
          </label>
          <select
            id="catalog-visibility"
            name="visibility"
            defaultValue={filters.visibility}
            className={`${fieldClass} mt-1`}
          >
            <option value="">Todas</option>
            <option value="visible">Visible en la tienda</option>
            <option value="hidden">Oculto o sin publicar</option>
          </select>
        </div>

        <div>
          <label htmlFor="catalog-status" className={labelClass}>
            Estado editorial
          </label>
          <select
            id="catalog-status"
            name="status"
            defaultValue={filters.status}
            className={`${fieldClass} mt-1`}
          >
            <option value="">Todos</option>
            <option value="draft">Borrador</option>
            <option value="active">Activo</option>
            <option value="archived">Archivado</option>
          </select>
        </div>

        <div>
          <label htmlFor="catalog-stock" className={labelClass}>
            Stock
          </label>
          <select
            id="catalog-stock"
            name="stock"
            defaultValue={filters.stock}
            className={`${fieldClass} mt-1`}
          >
            <option value="">Todo</option>
            <option value="in">Con stock</option>
            <option value="out">Agotado</option>
          </select>
        </div>

        <div>
          <label htmlFor="catalog-category" className={labelClass}>
            Categoría
          </label>
          <select
            id="catalog-category"
            name="hasCategory"
            defaultValue={filters.hasCategory}
            className={`${fieldClass} mt-1`}
          >
            <option value="">Todas</option>
            <option value="true">Con categoría</option>
            <option value="false">Sin categoría</option>
          </select>
        </div>

        <div>
          <label htmlFor="catalog-origin" className={labelClass}>
            Origen
          </label>
          <select
            id="catalog-origin"
            name="published"
            defaultValue={filters.published}
            className={`${fieldClass} mt-1`}
          >
            <option value="">Todo el catálogo</option>
            <option value="1">Publicado desde proveedor</option>
            <option value="0">Solo borradores</option>
          </select>
        </div>

        <div>
          <label htmlFor="catalog-provider" className={labelClass}>
            Proveedor
          </label>
          <select
            id="catalog-provider"
            name="provider"
            defaultValue={filters.provider}
            className={`${fieldClass} mt-1`}
          >
            <option value="">Todos</option>
            <option value="venndelo">Venndelo</option>
            <option value="mastershop">MasterShop</option>
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Aplicar filtros
        </button>
        <Link
          href="/admin/catalogo?tab=catalogo"
          className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Limpiar
        </Link>
      </div>
    </form>
  );
}
