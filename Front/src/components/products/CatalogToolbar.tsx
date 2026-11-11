import Link from "next/link";
import { Search } from "lucide-react";

type CatalogToolbarProps = {
  total: number;
  activeCategoryName: string | null;
  q: string | null;
  categorySlug: string | null;
  featured: boolean;
};

// Barra del catálogo: conteo, búsqueda y filtro de destacados.
// Es un formulario GET nativo: funciona sin JavaScript y los filtros quedan en
// la URL (compartibles e indexables). El backend solo admite `q`, `category`,
// `featured`, `limit` y `offset`; no se ofrece ordenación porque no existe.
export function CatalogToolbar({
  total,
  activeCategoryName,
  q,
  categorySlug,
  featured,
}: CatalogToolbarProps) {
  const hasFilters = Boolean(q || categorySlug || featured);

  return (
    <div className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-center lg:justify-between">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        <span className="font-semibold text-carbon [font-variant-numeric:tabular-nums]">
          {total}
        </span>{" "}
        {total === 1 ? "producto" : "productos"}
        {activeCategoryName ? ` en ${activeCategoryName}` : ""}
        {q ? ` para “${q}”` : ""}
      </p>

      <form
        action="/productos"
        method="get"
        className="flex flex-wrap items-center gap-2"
        role="search"
      >
        {categorySlug ? (
          <input type="hidden" name="categoria" value={categorySlug} />
        ) : null}

        <div className="relative">
          <label htmlFor="catalog-q" className="sr-only">
            Buscar productos
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="catalog-q"
            name="q"
            type="search"
            defaultValue={q ?? ""}
            placeholder="Buscar por nombre"
            className="h-10 w-full min-w-52 rounded-lg border border-border bg-card pr-3 pl-9 text-sm text-carbon placeholder:text-muted-foreground focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>

        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-carbon">
          <input
            type="checkbox"
            name="destacados"
            value="1"
            defaultChecked={featured}
            className="h-4 w-4 rounded border-border accent-[#A94200]"
          />
          Destacados
        </label>

        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
        >
          Filtrar
        </button>

        {hasFilters ? (
          <Link
            href="/productos"
            className="inline-flex h-10 items-center justify-center rounded-lg px-3 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-carbon hover:underline"
          >
            Limpiar
          </Link>
        ) : null}
      </form>
    </div>
  );
}