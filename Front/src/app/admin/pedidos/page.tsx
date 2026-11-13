import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Package, SearchX } from "lucide-react";
import { listAdminOrders } from "@/services/admin/orders";
import { ApiError } from "@/services/api/client";
import { formatDateTime, formatPrice } from "@/lib/format";
import {
  ADMIN_CHANNEL_LABELS,
  ADMIN_PROVIDER_LABELS,
  ADMIN_PAYMENT_METHOD_CODE_LABELS,
  ADMIN_MANUAL_PAYMENT_LABELS,
  type AdminOrderFilters,
  type AdminOrderListItem,
} from "@/types/admin";
import { FULFILLMENT_LABELS, PAYMENT_STATE_LABELS } from "@/types/order";
import { AdminOrdersFilters } from "@/components/admin/orders/AdminOrdersFilters";
import {
  FulfillmentBadge,
  PaymentBadge,
  SyncBadge,
} from "@/components/admin/orders/OrderBadges";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pedidos — Panel UPBUY",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 20;

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string =>
  typeof value === "string" ? value : "";

const pick = (value: string, allowed: Record<string, unknown>): string =>
  value && value in allowed ? value : "";

const dateOnly = (value: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;

  const filters: AdminOrderFilters = {
    q: one(raw.q).trim(),
    status: pick(one(raw.status), FULFILLMENT_LABELS),
    paymentStatus: pick(one(raw.paymentStatus), PAYMENT_STATE_LABELS),
    channel: pick(one(raw.channel), ADMIN_CHANNEL_LABELS),
    paymentMethodCode: pick(
      one(raw.paymentMethodCode),
      ADMIN_PAYMENT_METHOD_CODE_LABELS,
    ),
    provider: pick(one(raw.provider), ADMIN_PROVIDER_LABELS),
    from: dateOnly(one(raw.from)),
    to: dateOnly(one(raw.to)),
  };

  const requestedPage = Math.max(1, Number(one(raw.page)) || 1);
  const offset = (requestedPage - 1) * PAGE_SIZE;

  let result;
  try {
    result = await listAdminOrders({
      ...filters,
      limit: PAGE_SIZE,
      offset,
    });
  } catch (error) {
    return <OrdersError error={error} />;
  }

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  // Una URL con `page` fuera de rango se corrige a la última página real.
  if (page !== requestedPage) {
    try {
      result = await listAdminOrders({
        ...filters,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
    } catch (error) {
      return <OrdersError error={error} />;
    }
  }

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-carbon">
            Pedidos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total} pedido(s)
            {hasFilters ? " con los filtros aplicados" : " en total"}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/pedidos/nuevo"
            className="inline-flex h-10 items-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Nueva venta
          </Link>
          <Link
            href="/admin/pedidos/importar"
            className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Importar CSV
          </Link>
          <p className="text-xs text-muted-foreground">
            Página {page} de {totalPages}
          </p>
        </div>
      </header>

      <AdminOrdersFilters filters={filters} />

      {result.orders.length === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-muted/50 text-xs tracking-wide text-coffee-deep uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Pedido
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Cliente
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Total
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Pago
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Cumplimiento
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Proveedor
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Sincronización
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.orders.map((order) => (
                  <OrderRow key={order.id} order={order} />
                ))}
              </tbody>
            </table>
          </div>

          <ul className="grid gap-3 md:hidden">
            {result.orders.map((order) => (
              <li key={order.id}>
                <OrderCard order={order} />
              </li>
            ))}
          </ul>

          <Pagination
            page={page}
            totalPages={totalPages}
            filters={filters}
          />
        </>
      )}
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

function paymentMethodLabel(order: AdminOrderListItem): string {
  if (order.paymentMethodCode) {
    return (
      ADMIN_PAYMENT_METHOD_CODE_LABELS[order.paymentMethodCode] ??
      order.paymentMethodCode
    );
  }
  if (order.paymentMethod) {
    return ORDER_METHOD_LABEL(order.paymentMethod);
  }
  return "—";
}

const ORDER_METHOD_LABEL = (value: string): string =>
  ADMIN_MANUAL_PAYMENT_LABELS[value] ?? value;

function OrderRow({ order }: { order: AdminOrderListItem }) {
  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <Link
          href={`/admin/pedidos/${order.id}`}
          className="font-semibold text-carbon underline-offset-4 hover:text-terracotta-deep hover:underline"
        >
          {order.orderNumber}
        </Link>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatDateTime(order.createdAt)}
        </p>
        <p className="text-xs text-muted-foreground">
          {ADMIN_CHANNEL_LABELS[order.channel] ?? order.channel}
        </p>
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-carbon">{clientName(order)}</p>
        <p className="text-xs text-muted-foreground">
          {order.phone || order.email || "—"}
        </p>
      </td>
      <td className="px-4 py-3 font-semibold text-carbon [font-variant-numeric:tabular-nums]">
        {formatPrice(order.total)}
        <p className="text-xs font-normal text-muted-foreground">
          {paymentMethodLabel(order)}
        </p>
      </td>
      <td className="px-4 py-3">
        <PaymentBadge value={order.paymentState} />
      </td>
      <td className="px-4 py-3">
        <FulfillmentBadge value={order.fulfillmentStatus} />
      </td>
      <td className="px-4 py-3 text-coffee-deep">
        {order.provider
          ? (ADMIN_PROVIDER_LABELS[order.provider] ?? order.provider)
          : "—"}
        {order.providerOrderId ? (
          <p className="text-xs text-muted-foreground">
            {order.providerOrderId}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <SyncBadge
          provider={order.provider}
          outOfSync={Boolean(order.providerOutOfSync)}
          manualOverride={Boolean(order.manualOverride)}
        />
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={`/admin/pedidos/${order.id}`}
          className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-xs font-semibold text-carbon transition-colors hover:border-carbon"
        >
          Ver detalle
        </Link>
      </td>
    </tr>
  );
}

function OrderCard({ order }: { order: AdminOrderListItem }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/admin/pedidos/${order.id}`}
            className="font-semibold text-carbon underline-offset-4 hover:text-terracotta-deep hover:underline"
          >
            {order.orderNumber}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDateTime(order.createdAt)} ·{" "}
            {ADMIN_CHANNEL_LABELS[order.channel] ?? order.channel}
          </p>
        </div>
        <p className="shrink-0 font-semibold text-carbon [font-variant-numeric:tabular-nums]">
          {formatPrice(order.total)}
        </p>
      </div>

      <p className="mt-2 truncate text-sm text-carbon">{clientName(order)}</p>
      <p className="truncate text-xs text-muted-foreground">
        {order.phone || order.email || "—"}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <PaymentBadge value={order.paymentState} />
        <FulfillmentBadge value={order.fulfillmentStatus} />
        <SyncBadge
          provider={order.provider}
          outOfSync={Boolean(order.providerOutOfSync)}
          manualOverride={Boolean(order.manualOverride)}
        />
      </div>

      <Link
        href={`/admin/pedidos/${order.id}`}
        className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
      >
        Ver detalle
      </Link>
    </article>
  );
}

function Pagination({
  page,
  totalPages,
  filters,
}: {
  page: number;
  totalPages: number;
  filters: AdminOrderFilters;
}) {
  if (totalPages <= 1) return null;

  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/admin/pedidos?${query}` : "/admin/pedidos";
  };

  return (
    <nav
      aria-label="Paginación de pedidos"
      className="flex items-center justify-between gap-3"
    >
      {page > 1 ? (
        <Link
          href={href(page - 1)}
          rel="prev"
          className="inline-flex h-10 items-center gap-1 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon"
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
          className="inline-flex h-10 items-center gap-1 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon"
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

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-14 text-center">
      {hasFilters ? (
        <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      ) : (
        <Package className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      )}
      <h2 className="font-heading text-lg font-semibold text-carbon">
        {hasFilters ? "Ningún pedido coincide" : "Todavía no hay pedidos"}
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {hasFilters
          ? "Prueba con otros filtros o limpia la búsqueda."
          : "Cuando entre la primera compra aparecerá aquí."}
      </p>
      {hasFilters ? (
        <Link
          href="/admin/pedidos"
          className="mt-2 inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon"
        >
          Limpiar filtros
        </Link>
      ) : null}
    </div>
  );
}

function OrdersError({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError
      ? error.message
      : "No se pudo cargar la lista de pedidos.";

  return (
    <div
      role="alert"
      className="rounded-xl border border-terracotta/30 bg-terracotta/5 p-6"
    >
      <h1 className="font-heading text-lg font-semibold text-carbon">
        No pudimos cargar los pedidos
      </h1>
      <p className="mt-1 text-sm text-coffee-deep">{message}</p>
      <Link
        href="/admin/pedidos"
        className="mt-4 inline-flex h-10 items-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream hover:bg-terracotta-deep"
      >
        Reintentar
      </Link>
    </div>
  );
}
