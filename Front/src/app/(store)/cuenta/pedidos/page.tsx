import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Package } from "lucide-react";
import { listOrders } from "@/services/orders/queries";
import { formatDate, formatPrice } from "@/lib/format";
import {
  FULFILLMENT_LABELS,
  PAYMENT_STATE_LABELS,
  type OrderListItem,
} from "@/types/order";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mis pedidos — UPBUY",
  robots: { index: false, follow: false },
};

type OrdersPageProps = {
  searchParams: Promise<{ pagina?: string }>;
};

const PAGE_SIZE = 10;

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.pagina) || 1);

  let result: { orders: OrderListItem[]; total: number };
  try {
    result = await listOrders({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });
  } catch {
    return (
      <div
        role="alert"
        className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground"
      >
        No pudimos cargar tus pedidos. Vuelve a intentarlo en unos segundos.
      </div>
    );
  }

  if (result.orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-coffee-deep">
          <Package className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="font-heading text-xl font-semibold text-carbon">
          Todavía no tienes pedidos
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Cuando compres algo, aparecerá aquí con su estado.
        </p>
        <Link
          href="/productos"
          className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-carbon px-6 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
        >
          Ver la colección
        </Link>
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-carbon">
          Tus pedidos
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {result.total} {result.total === 1 ? "pedido" : "pedidos"} en total.
        </p>
      </div>

      <ul className="grid gap-3">
        {result.orders.map((order) => {
          const fulfillment =
            FULFILLMENT_LABELS[order.fulfillmentStatus] ?? order.fulfillmentStatus;
          const payment =
            PAYMENT_STATE_LABELS[order.paymentState] ?? order.paymentState;

          return (
            <li key={order.id}>
              <Link
                href={`/pedido/${order.id}`}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-carbon"
              >
                <div className="min-w-0">
                  <p className="font-heading text-sm font-semibold text-carbon">
                    {order.orderNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(order.createdAt)} ·{" "}
                    {order.items.length}{" "}
                    {order.items.length === 1 ? "artículo" : "artículos"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold text-carbon">
                    {fulfillment}
                  </span>
                  <span className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-muted-foreground">
                    {payment}
                  </span>
                  <span className="text-sm font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                    {formatPrice(order.total)}
                  </span>
                  <ChevronRight
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {pageCount > 1 ? (
        <nav
          aria-label="Paginación de pedidos"
          className="flex items-center justify-center gap-2"
        >
          {page > 1 ? (
            <Link
              href={`/cuenta/pedidos?pagina=${page - 1}`}
              className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon hover:border-carbon"
            >
              Anterior
            </Link>
          ) : null}
          <span className="text-xs text-muted-foreground [font-variant-numeric:tabular-nums]">
            Página {page} de {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={`/cuenta/pedidos?pagina=${page + 1}`}
              className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon hover:border-carbon"
            >
              Siguiente
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}