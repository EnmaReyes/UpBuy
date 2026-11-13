import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Package,
  ReceiptText,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { getDashboardSummary } from "@/services/admin/dashboard";
import { formatDate, formatPrice } from "@/lib/format";
import {
  FULFILLMENT_LABELS,
  PAYMENT_STATE_LABELS,
} from "@/types/order";
import type { DashboardProvider, DashboardSummary } from "@/types/admin";

export const dynamic = "force-dynamic";

const PROVIDER_LABELS: Record<string, string> = {
  vendelo: "Vendelo",
  dropi: "Dropi",
};

export default async function AdminDashboardPage() {
  let data: DashboardSummary;

  try {
    data = await getDashboardSummary();
  } catch {
    return (
      <div
        role="alert"
        className="rounded-xl border border-terracotta/30 bg-terracotta/5 p-6"
      >
        <p className="font-heading text-lg font-semibold text-carbon">
          No pudimos cargar el resumen
        </p>
        <p className="mt-1 text-sm text-coffee-deep">
          Revisa la conexión con la API e inténtalo de nuevo.
        </p>
        <Link
          href="/admin"
          className="mt-4 inline-flex h-10 items-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream hover:bg-terracotta-deep"
        >
          Reintentar
        </Link>
      </div>
    );
  }

  const settledCount = data.stats.byPaymentStatus.settled?.count ?? 0;
  const averageTicket =
    settledCount > 0 ? Math.round(data.stats.approvedRevenue / settledCount) : 0;

  const kpis = [
    {
      label: "Ventas liquidadas",
      value: formatPrice(data.stats.approvedRevenue),
      hint: "Pedidos con pago liquidado",
      icon: Wallet,
    },
    {
      label: "Pedidos",
      value: String(data.stats.totalOrders),
      hint: `${data.stats.ordersToday} hoy`,
      icon: Package,
    },
    {
      label: "Ticket promedio",
      value: formatPrice(averageTicket),
      hint: `${settledCount} pedido(s) liquidado(s)`,
      icon: ReceiptText,
    },
    {
      label: "Utilidad ganada",
      value: formatPrice(data.stats.earnedProfit),
      hint: "Pedidos entregados",
      icon: TrendingUp,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-carbon">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Resumen de {monthName(data.period.accounting.from)}. Actualizado{" "}
          {formatDate(data.generatedAt)}.
        </p>
      </header>

      <section aria-label="Indicadores del mes" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <article
              key={item.label}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold tracking-[0.12em] text-coffee-deep uppercase">
                  {item.label}
                </p>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-coffee-deep">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-3 font-heading text-2xl font-bold text-carbon [font-variant-numeric:tabular-nums]">
                {item.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
            </article>
          );
        })}
      </section>

      <ProvidersNotice providers={data.providers} />

      <section aria-labelledby="recent-orders-title" className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2
              id="recent-orders-title"
              className="font-heading text-base font-semibold text-carbon"
            >
              Últimas compras
            </h2>
            <p className="text-xs text-muted-foreground">
              Los 5 pedidos más recientes.
            </p>
          </div>
        </div>

        {data.recentOrders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <Package className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-semibold text-carbon">
              Todavía no hay pedidos
            </p>
            <p className="text-xs text-muted-foreground">
              Cuando entre la primera compra aparecerá aquí.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-muted/50 text-xs tracking-wide text-coffee-deep uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2 font-semibold">Pedido</th>
                  <th scope="col" className="px-4 py-2 font-semibold">Cliente</th>
                  <th scope="col" className="px-4 py-2 font-semibold">Fecha</th>
                  <th scope="col" className="px-4 py-2 font-semibold">Pago</th>
                  <th scope="col" className="px-4 py-2 font-semibold">Cumplimiento</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-4 py-3 font-semibold text-carbon">
                      {order.orderNumber}
                    </td>
                    <td className="px-4 py-3 text-coffee-deep">
                      {order.recipientName || order.email || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(order.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-coffee-deep">
                      {PAYMENT_STATE_LABELS[order.paymentState] ??
                        order.paymentState}
                    </td>
                    <td className="px-4 py-3 text-coffee-deep">
                      {FULFILLMENT_LABELS[order.fulfillmentStatus] ??
                        order.fulfillmentStatus}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                      {formatPrice(order.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ProvidersNotice({ providers }: { providers: DashboardProvider[] }) {
  const missing = providers.filter((provider) => !provider.configured);

  if (providers.length === 0) return null;

  if (missing.length === 0) {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-coffee/25 bg-coffee/5 p-4 text-sm text-coffee-deep">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Todos los proveedores están configurados.
      </p>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-xl border border-terracotta/30 bg-terracotta/5 p-4">
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-deep"
        aria-hidden="true"
      />
      <div>
        <p className="text-sm font-semibold text-terracotta-deep">
          Hay proveedores sin credenciales
        </p>
        <p className="mt-1 text-sm text-coffee-deep">
          {missing
            .map((provider) => PROVIDER_LABELS[provider.name] ?? provider.name)
            .join(", ")}{" "}
          está(n) en modo manual. Los pedidos que dependan de su API no se
          sincronizarán hasta configurarlos.
        </p>
      </div>
    </div>
  );
}

function monthName(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "el mes";
  return new Intl.DateTimeFormat("es-CO", { month: "long" }).format(date);
}
