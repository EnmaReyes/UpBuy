"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RotateCcw, SearchX } from "lucide-react";
import Loader from "@/components/kokonutui/loader";
import { SalesMetricCard } from "@/components/admin/sales/SalesMetricCard";
import {
  ProviderSpendingRing,
  providerLabel,
} from "@/components/admin/sales/ProviderSpendingRing";
import {
  defaultAccountingRange,
  getSales,
  getSalesAccounting,
  type SalesPeriodo,
} from "@/services/admin/sales";
import { ApiError } from "@/services/api/client";
import { formatPrice } from "@/lib/format";
import { PAYMENT_STATE_LABELS } from "@/types/order";
import {
  ADMIN_PAYMENT_METHOD_CODE_LABELS,
  type AccountingFull,
  type DashboardSales,
} from "@/types/admin";

// Ventas del panel (ADM-6).
//
// El selector de periodo y los filtros actualizan la vista desde el cliente
// (sin recargar la página): la serie llama a `/api/admin/orders/ventas` y la
// contabilidad a `/api/admin/orders/accounting`. Ambos endpoints revalidan
// sesión y permiso en el backend.

const PERIOD_OPTIONS: { value: SalesPeriodo; label: string }[] = [
  { value: "dia", label: "Diario" },
  { value: "semana", label: "Semanal" },
  { value: "mes", label: "Mensual" },
  { value: "anio", label: "Anual" },
];

const PERIOD_TEXT: Record<SalesPeriodo, string> = {
  dia: "del día",
  semana: "de la semana",
  mes: "del mes",
  anio: "del año",
};

const METHOD_NAMES: Record<string, string> = {
  ...ADMIN_PAYMENT_METHOD_CODE_LABELS,
  sin_metodo: "Sin método",
};

const COD_STATES = ["pending_collection", "collected", "settled"] as const;

const fieldClass =
  "h-11 w-full rounded-lg border border-border bg-card px-3 text-sm text-carbon focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const labelClass =
  "text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase";

const thClass = "px-3 py-2 font-semibold";

export function VentasView() {
  const [periodo, setPeriodo] = useState<SalesPeriodo>("mes");
  const [applied, setApplied] = useState(() => {
    const range = defaultAccountingRange();
    return { from: range.from, to: range.to, provider: "" };
  });
  const [draftFrom, setDraftFrom] = useState(applied.from);
  const [draftTo, setDraftTo] = useState(applied.to);
  const [draftProvider, setDraftProvider] = useState("");
  const [sales, setSales] = useState<DashboardSales | null>(null);
  const [accounting, setAccounting] = useState<AccountingFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    const { from, to, provider } = applied;
    Promise.all([
      getSales(periodo),
      getSalesAccounting({
        from,
        to,
        provider: provider || undefined,
      }),
    ])
      .then(([salesData, accountingData]) => {
        if (!alive) return;
        setSales(salesData);
        setAccounting(accountingData);
      })
      .catch((err) => {
        if (!alive) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "No se pudieron cargar las ventas.",
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [periodo, applied, reloadKey]);

  const applyFilters = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setApplied({
        from: draftFrom,
        to: draftTo,
        provider: draftProvider,
      });
    },
    [draftFrom, draftTo, draftProvider],
  );

  const clearFilters = useCallback(() => {
    const range = defaultAccountingRange();
    setDraftFrom(range.from);
    setDraftTo(range.to);
    setDraftProvider("");
    setApplied({ from: range.from, to: range.to, provider: "" });
  }, []);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-terracotta/30 bg-terracotta/5 p-6"
      >
        <h1 className="font-heading text-lg font-semibold text-carbon">
          No pudimos cargar las ventas
        </h1>
        <p className="mt-1 text-sm text-coffee-deep">{error}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Reintentar
        </button>
      </div>
    );
  }

  if (loading && !sales) {
    return (
      <Loader
        title="Cargando ventas"
        subtitle="Preparando la serie y la contabilidad del periodo"
        className="py-16 text-carbon"
      />
    );
  }

  if (!sales || !accounting) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-terracotta/30 bg-terracotta/5 p-6"
      >
        <p className="text-sm text-coffee-deep">
          No hay datos de ventas disponibles.
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-carbon px-4 text-sm font-semibold text-cream hover:bg-terracotta-deep"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Reintentar
        </button>
      </div>
    );
  }

  const rangeText =
    accounting.range.from && accounting.range.to
      ? `Del ${accounting.range.from} al ${accounting.range.to}`
      : "Rango completo";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-carbon">
            Ventas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Serie liquidadas y contabilidad del rango.{" "}
            {loading ? "Actualizando…" : ""}
          </p>
        </div>
      </header>

      {/* Selector de periodo: actualiza la serie sin recargar la página. */}
      <div
        role="group"
        aria-label="Periodo de la serie de ventas"
        className="flex flex-wrap gap-1 rounded-full bg-muted p-1"
      >
        {PERIOD_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={periodo === option.value}
            onClick={() => setPeriodo(option.value)}
            className={
              periodo === option.value
                ? "inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-carbon px-4 text-sm font-semibold text-cream outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted sm:flex-none"
                : "inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold text-coffee-deep outline-none transition-colors hover:text-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted sm:flex-none"
            }
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Filtros de fecha y proveedor de la contabilidad. */}
      <form
        onSubmit={applyFilters}
        aria-label="Filtros de contabilidad"
        className="rounded-xl border border-border bg-card p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ventas-from" className={labelClass}>
              Desde
            </label>
            <input
              id="ventas-from"
              name="from"
              type="date"
              value={draftFrom}
              onChange={(event) => setDraftFrom(event.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ventas-to" className={labelClass}>
              Hasta
            </label>
            <input
              id="ventas-to"
              name="to"
              type="date"
              value={draftTo}
              onChange={(event) => setDraftTo(event.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ventas-provider" className={labelClass}>
              Proveedor
            </label>
            <select
              id="ventas-provider"
              name="provider"
              value={draftProvider}
              onChange={(event) => setDraftProvider(event.target.value)}
              className={fieldClass}
            >
              <option value="">Todos</option>
              <option value="vendelo">Vendelo</option>
              <option value="dropi">Dropi</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Aplicar
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Limpiar
            </button>
          </div>
        </div>
      </form>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Serie de ventas liquidadas. */}
        <section aria-label="Ventas liquidadas del periodo">
          {sales.total === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-14 text-center">
              <SearchX
                className="h-8 w-8 text-muted-foreground"
                aria-hidden="true"
              />
              <h2 className="font-heading text-lg font-semibold text-carbon">
                Aún no hay ventas en este periodo
              </h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                El gráfico solo cuenta pagos liquidados (settled) de pedidos no
                cancelados. Prueba otro periodo o rango de fechas.
              </p>
            </div>
          ) : (
            <SalesMetricCard sales={sales} periodo={periodo} />
          )}
        </section>

        {/* Anillo por proveedor. */}
        <section aria-label="Ventas por proveedor">
          <ProviderSpendingRing byProvider={accounting.byProvider} />
        </section>
      </div>

      {/* Contabilidad del rango. */}
      <section
        aria-labelledby="accounting-title"
        className="rounded-xl border border-border bg-card"
      >
        <div className="border-b border-border px-4 py-3">
          <h2
            id="accounting-title"
            className="font-heading text-base font-semibold text-carbon"
          >
            Contabilidad {rangeText}
          </h2>
          <p className="text-xs text-muted-foreground">
            {accounting.orders.total} pedido(s), {accounting.orders.cancelled}{" "}
            cancelado(s), {accounting.orders.delivered} entregado(s).
          </p>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <AccountingItem
            label="Bruto del rango"
            value={formatPrice(accounting.revenue.gross)}
            hint="Subtotal + envío - descuentos"
          />
          <AccountingItem
            label="Costo proveedor"
            value={formatPrice(accounting.costs.providerCost)}
            hint="Costo de los productos"
          />
          <AccountingItem
            label="Comisiones (fees)"
            value={formatPrice(accounting.costs.total)}
            hint="Pasarela + proveedor"
          />
          <AccountingItem
            label="Margen"
            value={`${accounting.profit.marginPercent.toFixed(1)}%`}
            hint="Utilidad / bruto"
          />
          <AccountingItem
            label="Utilidad del periodo"
            value={formatPrice(accounting.profit.net)}
            hint="Todos los pedidos no cancelados"
          />
          <AccountingItem
            label="Utilidad ganada"
            value={formatPrice(accounting.earnedProfit)}
            hint="Solo pedidos entregados"
          />
          <AccountingItem
            label="Efectivo pendiente"
            value={formatPrice(accounting.cash.pendingCollection.amount)}
            hint={`${accounting.cash.pendingCollection.orders} pedido(s) en camino`}
          />
          <AccountingItem
            label="Depositado por proveedores"
            value={formatPrice(accounting.cash.payouts.amount)}
            hint={`${accounting.cash.payouts.count} pago(s) liquidado(s)`}
          />
        </div>

        <div className="border-t border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-carbon">
            Pago contra entrega (COD) por estado
          </h3>
          <table className="mt-2 w-full text-left text-sm">
            <caption className="sr-only">
              Pedidos contra entrega por estado de pago
            </caption>
            <thead className="bg-muted/50 text-xs tracking-wide text-coffee-deep uppercase">
              <tr>
                <th scope="col" className={thClass}>
                  Estado
                </th>
                <th scope="col" className={`${thClass} text-right`}>
                  Pedidos
                </th>
                <th scope="col" className={`${thClass} text-right`}>
                  Monto
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {COD_STATES.map((state) => {
                const bucket = accounting.cod[state] ?? { orders: 0, amount: 0 };
                return (
                  <tr key={state}>
                    <th scope="row" className="px-3 py-2 font-medium text-carbon">
                      {PAYMENT_STATE_LABELS[state] ?? state}
                    </th>
                    <td className="px-3 py-2 text-right text-coffee-deep [font-variant-numeric:tabular-nums]">
                      {bucket.orders}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                      {formatPrice(bucket.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Detalle por proveedor: equivalente accesible del anillo. */}
      <section
        aria-labelledby="by-provider-title"
        className="rounded-xl border border-border bg-card"
      >
        <div className="border-b border-border px-4 py-3">
          <h2
            id="by-provider-title"
            className="font-heading text-base font-semibold text-carbon"
          >
            Detalle por proveedor
          </h2>
          <p className="text-xs text-muted-foreground">
            Los totales coinciden con el anillo y con la contabilidad del rango.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Ventas, costo y utilidad por proveedor
            </caption>
            <thead className="bg-muted/50 text-xs tracking-wide text-coffee-deep uppercase">
              <tr>
                <th scope="col" className={thClass}>
                  Proveedor
                </th>
                <th scope="col" className={`${thClass} text-right`}>
                  Pedidos
                </th>
                <th scope="col" className={`${thClass} text-right`}>
                  Bruto
                </th>
                <th scope="col" className={`${thClass} text-right`}>
                  Costo
                </th>
                <th scope="col" className={`${thClass} text-right`}>
                  Utilidad
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accounting.byProvider.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    Aún no hay ventas en este periodo.
                  </td>
                </tr>
              ) : (
                accounting.byProvider.map((row) => (
                  <tr key={row.provider}>
                    <th scope="row" className="px-3 py-2 font-medium text-carbon">
                      {providerLabel(row.provider)}
                    </th>
                    <td className="px-3 py-2 text-right text-coffee-deep [font-variant-numeric:tabular-nums]">
                      {row.orders}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                      {formatPrice(row.gross)}
                    </td>
                    <td className="px-3 py-2 text-right text-coffee-deep [font-variant-numeric:tabular-nums]">
                      {formatPrice(row.providerCost)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                      {formatPrice(row.netProfit)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {accounting.byProvider.length > 0 ? (
              <tfoot className="border-t border-border text-sm font-semibold text-carbon">
                <tr>
                  <th scope="row" className="px-3 py-2 text-left">
                    Total
                  </th>
                  <td className="px-3 py-2 text-right [font-variant-numeric:tabular-nums]">
                    {accounting.byProvider.reduce((sum, row) => sum + row.orders, 0)}
                  </td>
                  <td className="px-3 py-2 text-right [font-variant-numeric:tabular-nums]">
                    {formatPrice(
                      accounting.byProvider.reduce((sum, row) => sum + row.gross, 0),
                    )}
                  </td>
                  <td className="px-3 py-2 text-right [font-variant-numeric:tabular-nums]">
                    {formatPrice(
                      accounting.byProvider.reduce(
                        (sum, row) => sum + row.providerCost,
                        0,
                      ),
                    )}
                  </td>
                  <td className="px-3 py-2 text-right [font-variant-numeric:tabular-nums]">
                    {formatPrice(
                      accounting.byProvider.reduce(
                        (sum, row) => sum + row.netProfit,
                        0,
                      ),
                    )}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>

      {/* Desglose por método de pago. */}
      <section
        aria-labelledby="by-method-title"
        className="rounded-xl border border-border bg-card"
      >
        <div className="border-b border-border px-4 py-3">
          <h2
            id="by-method-title"
            className="font-heading text-base font-semibold text-carbon"
          >
            Por método de pago
          </h2>
          <p className="text-xs text-muted-foreground">
            Monto de pedidos no cancelados y comisiones de pasarela.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Pedidos, monto y comisiones por método de pago
            </caption>
            <thead className="bg-muted/50 text-xs tracking-wide text-coffee-deep uppercase">
              <tr>
                <th scope="col" className={thClass}>
                  Método
                </th>
                <th scope="col" className={`${thClass} text-right`}>
                  Pedidos
                </th>
                <th scope="col" className={`${thClass} text-right`}>
                  Monto
                </th>
                <th scope="col" className={`${thClass} text-right`}>
                  Fees
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accounting.byPaymentMethodCode.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                    Aún no hay ventas en este periodo.
                  </td>
                </tr>
              ) : (
                accounting.byPaymentMethodCode.map((row) => (
                  <tr key={row.method}>
                    <th scope="row" className="px-3 py-2 font-medium text-carbon">
                      {METHOD_NAMES[row.method] ?? row.method}
                    </th>
                    <td className="px-3 py-2 text-right text-coffee-deep [font-variant-numeric:tabular-nums]">
                      {row.orders}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                      {formatPrice(row.amount)}
                    </td>
                    <td className="px-3 py-2 text-right text-coffee-deep [font-variant-numeric:tabular-nums]">
                      {formatPrice(row.gatewayFee)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AccountingItem({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
        {label}
      </p>
      <p className="mt-1 font-heading text-xl font-bold text-carbon [font-variant-numeric:tabular-nums]">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
