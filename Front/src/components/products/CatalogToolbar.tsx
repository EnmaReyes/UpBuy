"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const SORT_OPTIONS = [
  { value: "destacados", label: "Destacados" },
  { value: "nuevos", label: "Novedades" },
  { value: "precio-asc", label: "Precio: menor a mayor" },
  { value: "precio-desc", label: "Precio: mayor a menor" },
];

type CatalogToolbarProps = {
  total: number;
  activeCategoryName: string | null;
};

// Barra del catálogo: conteo de resultados y orden. El orden vive en la URL
// para que los filtros sean compartibles y el catálogo siga siendo indexable.
export function CatalogToolbar({ total, activeCategoryName }: CatalogToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentSort = searchParams?.get("orden") ?? "destacados";

  const onChangeSort = (value: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (value === "destacados") {
      params.delete("orden");
    } else {
      params.set("orden", value);
    }
    const query = params.toString();
    const basePath = pathname ?? "/productos";
    router.replace(query ? `${basePath}?${query}` : basePath, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        <span className="font-semibold text-carbon [font-variant-numeric:tabular-nums]">
          {total}
        </span>{" "}
        {total === 1 ? "producto" : "productos"}
        {activeCategoryName ? ` en ${activeCategoryName}` : ""}
      </p>

      <div className="flex items-center gap-2">
        <label htmlFor="catalog-sort" className="text-xs font-semibold tracking-wide text-coffee-deep uppercase">
          Ordenar por
        </label>
        <select
          id="catalog-sort"
          value={currentSort}
          onChange={(event) => onChangeSort(event.target.value)}
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-carbon focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
