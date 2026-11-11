import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type CatalogPaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  /** Filtros activos, sin `pagina`. */
  query: Record<string, string | undefined>;
};

// Paginación por offset, tal como la expone el backend (`limit`/`offset`).
// Enlaces reales para que el catálogo sea rastreable sin JavaScript.
export function CatalogPagination({
  page,
  pageSize,
  total,
  query,
}: CatalogPaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  const hrefFor = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value);
    }
    if (target > 1) params.set("pagina", String(target));
    const search = params.toString();
    return search ? `/productos?${search}` : "/productos";
  };

  const pages = buildPageList(page, pageCount);

  return (
    <nav
      aria-label="Paginación del catálogo"
      className="mt-12 flex flex-wrap items-center justify-center gap-2"
    >
      <PageLink
        href={page > 1 ? hrefFor(page - 1) : null}
        label="Página anterior"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </PageLink>

      {pages.map((item, index) =>
        item === "gap" ? (
          <span
            key={`gap-${index}`}
            aria-hidden="true"
            className="px-1 text-sm text-muted-foreground"
          >
            …
          </span>
        ) : (
          <Link
            key={item}
            href={hrefFor(item)}
            aria-current={item === page ? "page" : undefined}
            className={cn(
              "flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors [font-variant-numeric:tabular-nums]",
              item === page
                ? "border-carbon bg-carbon text-cream"
                : "border-border bg-card text-carbon hover:border-carbon",
            )}
          >
            {item}
          </Link>
        ),
      )}

      <PageLink
        href={page < pageCount ? hrefFor(page + 1) : null}
        label="Página siguiente"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  if (!href) {
    return (
      <span
        aria-disabled="true"
        className="flex h-10 min-w-10 items-center justify-center rounded-lg border border-border bg-card px-3 text-muted-foreground opacity-40"
      >
        <span className="sr-only">{label}</span>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className="flex h-10 min-w-10 items-center justify-center rounded-lg border border-border bg-card px-3 text-carbon transition-colors hover:border-carbon"
    >
      {children}
    </Link>
  );
}

/** Lista compacta: 1 … 4 5 6 … 20 */
function buildPageList(current: number, count: number): (number | "gap")[] {
  if (count <= 7) {
    return Array.from({ length: count }, (_, index) => index + 1);
  }

  const items: (number | "gap")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(count - 1, current + 1);

  if (start > 2) items.push("gap");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < count - 1) items.push("gap");
  items.push(count);

  return items;
}