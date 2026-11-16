import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { CatalogPager } from "@/components/admin/catalog/CatalogPager";
import { SupplierCatalog } from "@/components/admin/providers/SupplierCatalog";
import { TabError } from "@/components/admin/providers/CatalogSupplierParts";
import { formatDateTime } from "@/lib/format";
import {
  getCatalogSupplierSyncHistory,
  listCatalogSupplierProducts,
  type CatalogSupplierSlug,
} from "@/services/admin/providers";
import {
  ADMIN_CATALOG_RUN_STATUS_LABELS,
  ADMIN_CATALOG_TRIGGER_LABELS,
} from "@/types/admin";

// Pestañas de catálogo e historial de un proveedor de catálogo. Se resolvieron
// como componentes de servidor para que Venndelo y MasterShop compartan la
// consulta, los filtros y la paginación sin duplicarla en cada página.

export type SupplierSearchParams = Record<
  string,
  string | string[] | undefined
>;

const one = (value: string | string[] | undefined): string =>
  typeof value === "string" ? value : "";

export const SUPPLIER_PAGE_SIZE = 20;

export async function CatalogSupplierProductsTab({
  slug,
  providerName,
  tab,
  searchParams,
}: {
  slug: CatalogSupplierSlug;
  providerName: string;
  tab: string;
  searchParams: SupplierSearchParams;
}) {
  const q = one(searchParams.q).trim();
  const availability = ["true", "false"].includes(one(searchParams.availability))
    ? one(searchParams.availability)
    : "";
  const requestedPage = Math.max(1, Number(one(searchParams.page)) || 1);

  try {
    const result = await listCatalogSupplierProducts(slug, {
      q: q || undefined,
      availability: availability || undefined,
      page: requestedPage,
      limit: SUPPLIER_PAGE_SIZE,
    });

    const totalPages = Math.max(1, Math.ceil(result.total / result.limit));
    const href = (target: number) => {
      const params = new URLSearchParams({ tab });
      if (q) params.set("q", q);
      if (availability) params.set("availability", availability);
      if (target > 1) params.set("page", String(target));
      return `/admin/proveedores/${slug}?${params.toString()}`;
    };

    return (
      <section
        className="flex flex-col gap-3"
        aria-label={`Catálogo de ${providerName}`}
      >
        <form
          method="get"
          aria-label={`Filtros del catálogo de ${providerName}`}
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="tab" value={tab} />
          <div className="min-w-[200px] flex-1">
            <label
              htmlFor="supplier-catalog-q"
              className="block text-xs font-semibold text-carbon"
            >
              Buscar producto
            </label>
            <input
              id="supplier-catalog-q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Nombre o ID del proveedor"
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="supplier-catalog-availability"
              className="block text-xs font-semibold text-carbon"
            >
              Disponibilidad
            </label>
            <select
              id="supplier-catalog-availability"
              name="availability"
              defaultValue={availability}
              className="mt-1 h-10 rounded-lg border border-border bg-background px-3 text-sm text-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <option value="">Todas</option>
              <option value="true">Con stock</option>
              <option value="false">Sin stock</option>
            </select>
          </div>
          <button
            type="submit"
            className="h-10 rounded-lg bg-carbon px-4 text-sm font-semibold text-cream hover:bg-terracotta-deep"
          >
            Filtrar
          </button>
          <p className="text-xs text-muted-foreground">
            {result.total} producto(s) · página{" "}
            {Math.min(result.page, totalPages)} de {totalPages}
          </p>
        </form>

        <SupplierCatalog
          slug={slug}
          providerName={providerName}
          products={result.products}
        />

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <CatalogPager
            page={Math.min(result.page, totalPages)}
            totalPages={totalPages}
            previousHref={href(Math.min(result.page, totalPages) - 1)}
            nextHref={href(Math.min(result.page, totalPages) + 1)}
            label={`Paginación del catálogo de ${providerName}`}
          />
        </div>
      </section>
    );
  } catch (error) {
    return (
      <TabError error={error} title="No pudimos cargar el catálogo" />
    );
  }
}

export async function CatalogSupplierHistoryTab({
  slug,
  tab,
  searchParams,
}: {
  slug: CatalogSupplierSlug;
  tab: string;
  searchParams: SupplierSearchParams;
}) {
  const offset = Math.max(0, Number(one(searchParams.offset)) || 0);
  const limit = SUPPLIER_PAGE_SIZE;

  try {
    const history = await getCatalogSupplierSyncHistory(slug, { limit, offset });
    const href = (target: number) => {
      const params = new URLSearchParams({ tab });
      if (target > 0) params.set("offset", String(target));
      return `/admin/proveedores/${slug}?${params.toString()}`;
    };

    return (
      <section
        className="flex flex-col gap-3"
        aria-label="Historial de sincronización"
      >
        {history.runs.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Todavía no hay corridas de sincronización de catálogo.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-muted/50 text-xs tracking-wide text-coffee-deep uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Inicio
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Origen
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Recibidos
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Creados / actualizados
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Auto-publicación
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Errores
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.runs.map((run) => (
                  <tr key={run.id} className="align-top">
                    <td className="px-4 py-3 text-xs text-carbon">
                      {formatDateTime(run.startedAt)}
                      {run.finishedAt ? (
                        <p className="text-muted-foreground">
                          Fin {formatDateTime(run.finishedAt)}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-coffee-deep">
                      {ADMIN_CATALOG_TRIGGER_LABELS[run.trigger] || run.trigger}
                    </td>
                    <td className="px-4 py-3">
                      {ADMIN_CATALOG_RUN_STATUS_LABELS[run.status] || run.status}
                    </td>
                    <td className="px-4 py-3 [font-variant-numeric:tabular-nums]">
                      {run.received}
                    </td>
                    <td className="px-4 py-3 [font-variant-numeric:tabular-nums]">
                      {run.created} / {run.updated}
                    </td>
                    <td className="px-4 py-3 text-xs [font-variant-numeric:tabular-nums]">
                      <p className="font-semibold text-carbon">
                        {run.publishedCreated} nuevos · {run.publishedUpdated}{" "}
                        actualizados
                      </p>
                      <p className="text-muted-foreground">
                        {run.hidden} ocultados · {run.skipped} omitidos
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          run.errors > 0 ? "font-semibold text-rose-800" : ""
                        }
                      >
                        {run.errors}
                      </span>
                      {run.errorSummary?.length ? (
                        <ul className="mt-1 list-disc pl-4 text-[11px] text-coffee-deep">
                          {run.errorSummary.slice(0, 3).map((entry, index) => (
                            <li key={index}>{String(entry.motivo || "Error")}</li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <nav
          aria-label="Paginación del historial"
          className="flex items-center justify-between gap-3"
        >
          {offset > 0 ? (
            <Link
              href={href(Math.max(0, offset - limit))}
              rel="prev"
              className="inline-flex h-10 items-center gap-1 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon hover:border-carbon"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Anteriores
            </Link>
          ) : (
            <span />
          )}
          {offset + history.runs.length < history.total ? (
            <Link
              href={href(offset + limit)}
              rel="next"
              className="inline-flex h-10 items-center gap-1 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon hover:border-carbon"
            >
              Siguientes
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </section>
    );
  } catch (error) {
    return <TabError error={error} title="No pudimos cargar el historial" />;
  }
}
