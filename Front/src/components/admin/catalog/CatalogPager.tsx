import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Paginacion compartida por las dos pestanas del catalogo. Recibe las URLs ya
// construidas para no repetir los filtros en el cliente.

export function CatalogPager({
  page,
  totalPages,
  previousHref,
  nextHref,
  label,
}: {
  page: number;
  totalPages: number;
  previousHref: string;
  nextHref: string;
  label: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3"
    >
      <p className="text-xs text-coffee-deep">
        Página <span className="font-semibold text-carbon">{page}</span> de{" "}
        {totalPages}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={previousHref}
            rel="prev"
            className="inline-flex h-10 items-center gap-1 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            Anterior
          </Link>
        ) : (
          <span className="inline-flex h-10 cursor-not-allowed items-center gap-1 rounded-lg border border-border bg-muted px-3 text-sm font-semibold text-muted-foreground">
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            Anterior
          </span>
        )}

        {page < totalPages ? (
          <Link
            href={nextHref}
            rel="next"
            className="inline-flex h-10 items-center gap-1 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Siguiente
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        ) : (
          <span className="inline-flex h-10 cursor-not-allowed items-center gap-1 rounded-lg border border-border bg-muted px-3 text-sm font-semibold text-muted-foreground">
            Siguiente
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </span>
        )}
      </div>
    </nav>
  );
}
