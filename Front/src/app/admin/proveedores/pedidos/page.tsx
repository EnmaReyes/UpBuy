import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, PackageSearch, Truck } from "lucide-react";
import { listAdminOrders } from "@/services/admin/orders";
import { ApiError } from "@/services/api/client";
import { formatDateTime, formatPrice } from "@/lib/format";
import {
  ADMIN_PROVIDER_LABELS,
  type AdminOrderFilters,
  type AdminOrderListItem,
} from "@/types/admin";
import {
  FulfillmentBadge,
  PaymentBadge,
  SyncBadge,
} from "@/components/admin/orders/OrderBadges";
import {
  ProviderOrderActions,
  ProviderOrdersExport,
} from "@/components/admin/providers/ProviderOrdersActions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pedidos por proveedor — Panel UPBUY",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 20;

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string =>
  typeof value === "string" ? value : "";

const dateOnly = (value: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";

export default async function ProviderOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;

  const provider = one(raw.provider) in ADMIN_PROVIDER_LABELS ? one(raw.provider) : "";
  const outOfSync = one(raw.outOfSync) === "1";
  const from = dateOnly(one(raw.from));
  const to = dateOnly(one(raw.to));

  const filters: AdminOrderFilters = {
    q: "",
    status: "",
    paymentStatus: "",
    channel: "",
    paymentMethodCode: "",
    provider,
    from,
    to,
  };

  const requestedPage = Math.max(1, Number(one(raw.page)) || 1);
  const offset = (requestedPage - 1) * PAGE_SIZE;

  let result;
  try {
    result = await listAdminOrders({
      provider: provider || undefined,
      outOfSync: outOfSync || undefined,
      from: from || undefined,
      to: to || undefined,
      limit: PAGE_SIZE,
      offset,
    });
  } catch (error) {
    return <ProviderOrdersError error={error} />;
  }

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  if (page !== requestedPage) {
    try {
      result = await listAdminOrders({
        provider: provider || undefined,
        outOfSync: outOfSync || undefined,
        from: from || undefined,
        to: to || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
    } catch (error) {
      return <ProviderOrdersError error={error} />;
    }
  }

  const exportQuery = {
    provider: provider || undefined,
    outOfSync: outOfSync ? 1 : undefined,
    from: from || undefined,
    to: to || undefined,
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <nav aria-label="Ruta" className="text-xs text-muted-foreground">
            <Link href="/admin/proveedores" className="hover:underline">
              Proveedores
            </Link>{" "}
            / Pedidos
          </nav>
          <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight text-carbon">
            Pedidos por proveedor
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total} pedido(s){outOfSync ? " desincronizado(s)" : ""}.
            Reintenta la sincronización o exporta el CSV para operar en el panel
            del proveedor.
          </p>
        </div>
        <ProviderOrdersExport query={exportQuery} />
      </header>

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
        <div>
          <label htmlFor="provider" className="block text-xs font-semibold text-carbon">
            Proveedor
          </label>
          <select
            id="provider"
            name="provider"
            defaultValue={provider}
            className="mt-1 h-10 rounded-lg border border-border bg-background px-3 text-sm text-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">Todos</option>
            <option value="dropi">Dropi</option>
          </select>
        </div>
        <div>
          <label htmlFor="from" className="block text-xs font-semibold text-carbon">
            Desde
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={from}
            className="mt-1 h-10 rounded-lg border border-border bg-background px-3 text-sm text-carbon"
          />
        </div>
        <div>
          <label htmlFor="to" className="block text-xs font-semibold text-carbon">
            Hasta
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={to}
            className="mt-1 h-10 rounded-lg border border-border bg-background px-3 text-sm text-carbon"
          />
        </div>
        <label className="flex h-10 items-center gap-2 text-sm text-carbon">
          <input
            type="checkbox"
            name="outOfSync"
            value="1"
            defaultChecked={outOfSync}
            className="h-4 w-4 rounded border-border"
          />
          Solo desincronizados
        </label>
        <button
          type="submit"
          className="h-10 rounded-lg bg-carbon px-4 text-sm font-semibold text-cream hover:bg-terracotta-deep"
        >
          Filtrar
        </button>
        <Link
          href="/admin/proveedores/pedidos"
          className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-carbon hover:border-carbon"
        >
          Limpiar
        </Link>
      </form>

      {result.orders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-14 text-center">
          <PackageSearch className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-heading text-lg font-semibold text-carbon">
            Ningún pedido con estos filtros
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Prueba con otro proveedor, limpia los filtros o revisa el rango de
            fechas.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-muted/50 text-xs tracking-wide text-coffee-deep uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Pedido</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Cliente</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Proveedor</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Pago</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Cumplimiento</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Sincronización</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.orders.map((order) => (
                  <tr key={order.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/pedidos/${order.id}`}
                        className="font-semibold text-carbon underline-offset-4 hover:text-terracotta-deep hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(order.createdAt)}
                      </p>
                      <p className="text-xs font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                        {formatPrice(order.total)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-carbon">{clientName(order)}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.phone || order.email || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-coffee-deep">
                      {order.provider
                        ? (ADMIN_PROVIDER_LABELS[order.provider] ?? order.provider)
                        : "—"}
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {order.providerOrderId || "Sin enviar"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <PaymentBadge value={order.paymentState} />
                    </td>
                    <td className="px-4 py-3">
                      <FulfillmentBadge value={order.fulfillmentStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <SyncBadge
                        provider={order.provider}
                        outOfSync={Boolean(order.providerOutOfSync)}
                        manualOverride={Boolean(order.manualOverride)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <ProviderOrderActions
                        id={order.id}
                        provider={order.provider}
                        providerOrderId={order.providerOrderId}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="grid gap-3 md:hidden">
            {result.orders.map((order) => (
              <li key={order.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/admin/pedidos/${order.id}`}
                      className="font-semibold text-carbon underline-offset-4 hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(order.createdAt)}
                    </p>
                  </div>
                  <p className="font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                    {formatPrice(order.total)}
                  </p>
                </div>
                <p className="mt-2 text-sm text-carbon">{clientName(order)}</p>
                <p className="text-xs text-muted-foreground">
                  {order.provider
                    ? (ADMIN_PROVIDER_LABELS[order.provider] ?? order.provider)
                    : "Sin proveedor"}{" "}
                  · {order.providerOrderId || "Sin enviar"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <PaymentBadge value={order.paymentState} />
                  <FulfillmentBadge value={order.fulfillmentStatus} />
                  <SyncBadge
                    provider={order.provider}
                    outOfSync={Boolean(order.providerOutOfSync)}
                    manualOverride={Boolean(order.manualOverride)}
                  />
                </div>
                <div className="mt-3 border-t border-border pt-3">
                  <ProviderOrderActions
                    id={order.id}
                    provider={order.provider}
                    providerOrderId={order.providerOrderId}
                  />
                </div>
              </li>
            ))}
          </ul>

          <Pagination page={page} totalPages={totalPages} raw={raw} />
        </>
      )}

      <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
        <Download className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        El CSV incluye estados ya traducidos y los datos necesarios para operar
        en el panel del proveedor, sin secretos ni estados crudos.
      </p>
    </div>
  );
}

function clientName(order: AdminOrderListItem): string {
  const user = order.user;
  const fromUser =
    user && [user.name, user.lastName].filter(Boolean).join(" ").trim();
  return (
    fromUser ||
    order.recipientName ||
    user?.email ||
    order.email ||
    order.phone ||
    "—"
  );
}

function Pagination({
  page,
  totalPages,
  raw,
}: {
  page: number;
  totalPages: number;
  raw: SearchParams;
}) {
  if (totalPages <= 1) return null;

  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const key of ["provider", "outOfSync", "from", "to"]) {
      const value = one(raw[key]);
      if (value) params.set(key, value);
    }
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query
      ? `/admin/proveedores/pedidos?${query}`
      : "/admin/proveedores/pedidos";
  };

  return (
    <nav
      aria-label="Paginación de pedidos por proveedor"
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
      <span className="text-xs text-muted-foreground">
        {page} / {totalPages}
      </span>
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
  );
}

function ProviderOrdersError({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError
      ? error.message
      : "No se pudo cargar la lista de pedidos por proveedor.";

  return (
    <div
      role="alert"
      className="rounded-xl border border-terracotta/30 bg-terracotta/5 p-6"
    >
      <h1 className="flex items-center gap-2 font-heading text-lg font-semibold text-carbon">
        <Truck className="h-5 w-5" aria-hidden="true" />
        No pudimos cargar los pedidos
      </h1>
      <p className="mt-1 text-sm text-coffee-deep">{message}</p>
      <Link
        href="/admin/proveedores/pedidos"
        className="mt-4 inline-flex h-10 items-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream hover:bg-terracotta-deep"
      >
        Reintentar
      </Link>
    </div>
  );
}
