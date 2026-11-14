import type { Metadata } from "next";
import Link from "next/link";
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  History,
  Wallet,
} from "lucide-react";
import {
  getVenndeloStatus,
  getVenndeloSyncHistory,
  getVenndeloWalletBalance,
  listVenndeloOrders,
  listVenndeloProducts,
} from "@/services/admin/providers";
import { ApiError } from "@/services/api/client";
import { formatDateTime } from "@/lib/format";
import {
  ADMIN_CATALOG_RUN_STATUS_LABELS,
  ADMIN_CATALOG_TRIGGER_LABELS,
  ADMIN_VENNDELO_ORDER_STATUS_LABELS,
  type AdminVenndeloOrder,
  type AdminVenndeloStatus,
} from "@/types/admin";
import { StatusBadge, statusLabel } from "@/components/admin/providers/ProviderCards";
import { VenndeloActions } from "@/components/admin/providers/VenndeloActions";
import { VenndeloCatalog } from "@/components/admin/providers/VenndeloCatalog";
import { VenndeloOrders } from "@/components/admin/providers/VenndeloOrders";
import { VenndeloWallet } from "@/components/admin/providers/VenndeloWallet";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Venndelo Pro — Panel UPBUY",
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string =>
  typeof value === "string" ? value : "";

const TABS = [
  { id: "catalogo", label: "Catálogo", icon: Boxes },
  { id: "pedidos", label: "Pedidos", icon: ClipboardList },
  { id: "wallet", label: "Wallet", icon: Wallet },
  { id: "historial", label: "Historial", icon: History },
] as const;

type TabId = (typeof TABS)[number]["id"];

const VENNDELO_STATUSES = Object.keys(ADMIN_VENNDELO_ORDER_STATUS_LABELS).filter(
  (status) => status !== "ANY",
);

export default async function VenndeloPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const requestedTab = one(raw.tab);
  const tab: TabId = TABS.some((entry) => entry.id === requestedTab)
    ? (requestedTab as TabId)
    : "catalogo";

  let status: AdminVenndeloStatus;
  try {
    status = await getVenndeloStatus();
  } catch (error) {
    return <VenndeloError error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <nav aria-label="Ruta" className="text-xs text-muted-foreground">
            <Link href="/admin/proveedores" className="hover:underline">
              Proveedores
            </Link>{" "}
            / Venndelo Pro
          </nav>
          <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight text-carbon">
            Venndelo Pro
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Catálogo, pedidos y wallet del proveedor con doble N
            (<code>VENNDELO_*</code>). No es Vendelo (pedidos).
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge
            configured={status.configured}
            label={status.configured ? "Conectado por API" : "Sin credenciales"}
          />
          <VenndeloActions configured={status.configured} size="compact" />
        </div>
      </header>

      <dl className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Productos importados" value={status.catalog.supplierProducts} />
        <Metric label="Publicados" value={status.catalog.publishedProducts} />
        <Metric
          label="Token"
          value={status.token.cached ? "En caché" : "Sin token"}
          hint={
            status.token.expiresAt
              ? `Vence ${formatDateTime(status.token.expiresAt)}`
              : undefined
          }
        />
        <Metric
          label="Última corrida"
          value={status.lastRun ? statusLabel(status.lastRun.status) : "—"}
          hint={
            status.lastRun?.startedAt
              ? formatDateTime(status.lastRun.startedAt)
              : undefined
          }
        />
      </dl>

      <nav aria-label="Secciones de Venndelo Pro">
        <ul className="flex flex-wrap gap-1 border-b border-border">
          {TABS.map((entry) => {
            const Icon = entry.icon;
            const active = entry.id === tab;
            const params = new URLSearchParams({ tab: entry.id });
            return (
              <li key={entry.id}>
                <Link
                  href={`/admin/proveedores/venndelo?${params.toString()}`}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "inline-flex h-10 items-center gap-1.5 border-b-2 border-terracotta px-3 text-sm font-semibold text-carbon"
                      : "inline-flex h-10 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground hover:text-carbon"
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {entry.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {tab === "catalogo" ? <CatalogTab raw={raw} /> : null}
      {tab === "pedidos" ? <OrdersTab raw={raw} configured={status.configured} /> : null}
      {tab === "wallet" ? <WalletTab configured={status.configured} /> : null}
      {tab === "historial" ? <HistoryTab raw={raw} /> : null}
    </div>
  );
}

async function CatalogTab({ raw }: { raw: SearchParams }) {
  const q = one(raw.q).trim();
  const availability = ["true", "false"].includes(one(raw.availability))
    ? one(raw.availability)
    : "";
  const page = Math.max(1, Number(one(raw.page)) || 1);
  const limit = 20;

  try {
    const result = await listVenndeloProducts({
      q: q || undefined,
      availability: availability || undefined,
      page,
      limit,
    });

    const totalPages = Math.max(1, Math.ceil(result.total / result.limit));
    const href = (target: number) => {
      const params = new URLSearchParams({ tab: "catalogo" });
      if (q) params.set("q", q);
      if (availability) params.set("availability", availability);
      if (target > 1) params.set("page", String(target));
      return `/admin/proveedores/venndelo?${params.toString()}`;
    };

    return (
      <section className="flex flex-col gap-3" aria-label="Catálogo de Venndelo">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="catalogo" />
          <div className="min-w-[200px] flex-1">
            <label htmlFor="catalog-q" className="block text-xs font-semibold text-carbon">
              Buscar producto
            </label>
            <input
              id="catalog-q"
              name="q"
              defaultValue={q}
              placeholder="Nombre o ID del proveedor"
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </div>
          <div>
            <label htmlFor="catalog-availability" className="block text-xs font-semibold text-carbon">
              Disponibilidad
            </label>
            <select
              id="catalog-availability"
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
            {result.total} producto(s) · página {Math.min(result.page, totalPages)} de{" "}
            {totalPages}
          </p>
        </form>

        <VenndeloCatalog products={result.products} />

        {totalPages > 1 ? (
          <nav
            aria-label="Paginación del catálogo"
            className="flex items-center justify-between gap-3"
          >
            {page > 1 ? (
              <Link
                href={href(page - 1)}
                rel="prev"
                className="inline-flex h-10 items-center gap-1 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon hover:border-carbon"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Anterior
              </Link>
            ) : (
              <span />
            )}
            {page < totalPages ? (
              <Link
                href={href(page + 1)}
                rel="next"
                className="inline-flex h-10 items-center gap-1 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon hover:border-carbon"
              >
                Siguiente
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    );
  } catch (error) {
    return <TabError error={error} title="No pudimos cargar el catálogo" />;
  }
}

async function OrdersTab({
  raw,
  configured,
}: {
  raw: SearchParams;
  configured: boolean;
}) {
  const requestedStatus = one(raw.status).toUpperCase();
  const status = VENNDELO_STATUSES.includes(requestedStatus)
    ? requestedStatus
    : "";
  const createdMin = dateOnly(one(raw.created_min));
  const createdMax = dateOnly(one(raw.created_max));

  let orders: AdminVenndeloOrder[] = [];
  let loadError: unknown = null;

  if (configured) {
    try {
      orders = await listVenndeloOrders({
        status: status || undefined,
        created_min: createdMin || undefined,
        created_max: createdMax || undefined,
        page_size: 50,
      });
      if (!Array.isArray(orders)) {
        orders = [];
      }
    } catch (error) {
      loadError = error;
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Pedidos en Venndelo">
      {!configured ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Venndelo Pro no tiene credenciales. Los pedidos no se pueden consultar
          hasta configurarlas en el backend.
        </p>
      ) : (
        <>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value="pedidos" />
            <div>
              <label htmlFor="orders-status" className="block text-xs font-semibold text-carbon">
                Estado
              </label>
              <select
                id="orders-status"
                name="status"
                defaultValue={status}
                className="mt-1 h-10 rounded-lg border border-border bg-background px-3 text-sm text-carbon"
              >
                <option value="">Todos</option>
                {VENNDELO_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {ADMIN_VENNDELO_ORDER_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="orders-from" className="block text-xs font-semibold text-carbon">
                Desde
              </label>
              <input
                id="orders-from"
                name="created_min"
                type="date"
                defaultValue={createdMin}
                className="mt-1 h-10 rounded-lg border border-border bg-background px-3 text-sm text-carbon"
              />
            </div>
            <div>
              <label htmlFor="orders-to" className="block text-xs font-semibold text-carbon">
                Hasta
              </label>
              <input
                id="orders-to"
                name="created_max"
                type="date"
                defaultValue={createdMax}
                className="mt-1 h-10 rounded-lg border border-border bg-background px-3 text-sm text-carbon"
              />
            </div>
            <button
              type="submit"
              className="h-10 rounded-lg bg-carbon px-4 text-sm font-semibold text-cream hover:bg-terracotta-deep"
            >
              Filtrar
            </button>
          </form>

          {loadError ? (
            <TabError error={loadError} title="No pudimos cargar los pedidos" />
          ) : (
            <VenndeloOrders orders={orders} />
          )}
        </>
      )}
    </section>
  );
}

async function WalletTab({ configured }: { configured: boolean }) {
  if (!configured) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        La wallet de Venndelo Pro requiere credenciales configuradas. Sin ellas
        no se consulta saldo ni se generan recargas.
      </p>
    );
  }

  try {
    const balance = await getVenndeloWalletBalance();
    return <VenndeloWallet balance={balance} />;
  } catch (error) {
    return <TabError error={error} title="No pudimos consultar la wallet" />;
  }
}

async function HistoryTab({ raw }: { raw: SearchParams }) {
  const offset = Math.max(0, Number(one(raw.offset)) || 0);
  const limit = 20;

  try {
    const history = await getVenndeloSyncHistory({ limit, offset });

    return (
      <section className="flex flex-col gap-3" aria-label="Historial de sincronización">
        {history.runs.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Todavía no hay corridas de sincronización de catálogo.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-muted/50 text-xs tracking-wide text-coffee-deep uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Inicio</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Origen</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Estado</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Recibidos</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Creados / actualizados</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Errores</th>
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
                    <td className="px-4 py-3">
                      <span className={run.errors > 0 ? "font-semibold text-rose-800" : ""}>
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
              href={`/admin/proveedores/venndelo?tab=historial&offset=${Math.max(0, offset - limit)}`}
              className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon hover:border-carbon"
            >
              Anteriores
            </Link>
          ) : (
            <span />
          )}
          {offset + history.runs.length < history.total ? (
            <Link
              href={`/admin/proveedores/venndelo?tab=historial&offset=${offset + limit}`}
              className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon hover:border-carbon"
            >
              Siguientes
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

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold tracking-[0.1em] text-coffee-deep uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-carbon [font-variant-numeric:tabular-nums]">
        {value}
      </dd>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function TabError({ error, title }: { error: unknown; title: string }) {
  const message =
    error instanceof ApiError
      ? error.message
      : "El proveedor no respondió. Revisa la conexión e inténtalo de nuevo.";

  return (
    <div
      role="alert"
      className="rounded-xl border border-terracotta/30 bg-terracotta/5 p-6"
    >
      <h2 className="font-heading text-lg font-semibold text-carbon">{title}</h2>
      <p className="mt-1 text-sm text-coffee-deep">{message}</p>
      <p className="mt-2 text-xs text-coffee-deep">
        Prueba la conexión o vuelve a cargar la página. Un error de credenciales
        se corrige en las variables del backend.
      </p>
    </div>
  );
}

function VenndeloError({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError
      ? error.message
      : "No se pudo cargar el estado de Venndelo Pro.";

  return (
    <div
      role="alert"
      className="rounded-xl border border-terracotta/30 bg-terracotta/5 p-6"
    >
      <h1 className="font-heading text-lg font-semibold text-carbon">
        No pudimos cargar Venndelo Pro
      </h1>
      <p className="mt-1 text-sm text-coffee-deep">{message}</p>
      <Link
        href="/admin/proveedores"
        className="mt-4 inline-flex h-10 items-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream hover:bg-terracotta-deep"
      >
        Volver a proveedores
      </Link>
    </div>
  );
}

const dateOnly = (value: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
