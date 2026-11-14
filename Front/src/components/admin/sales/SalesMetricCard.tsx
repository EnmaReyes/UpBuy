"use client";

import MetricCard from "@/components/kokonutui/metric-card";
import { MARKET } from "@/config/market.config";
import { formatPrice } from "@/lib/format";
import type { DashboardSales } from "@/types/admin";
import type { SalesPeriodo } from "@/services/admin/sales";

// Tarjeta principal de ventas (ADM-6).
//
// Envuelve `@kokonutui/metric-card` y adapta la serie real del backend
// (`/api/admin/orders/ventas`) a su API: cada cubo de la serie se convierte en
// un `MetricPoint` con una sola parte (el total liquidado). El KPI grande es
// el cubo actual y la comparación, el cubo anterior (p. ej. este mes vs. el
// anterior), que es lo que el endpoint expone como `actual`/`anterior`.

const COMPARISON_LABELS: Record<SalesPeriodo, string> = {
  dia: "vs. día anterior",
  semana: "vs. semana anterior",
  mes: "vs. mes anterior",
  anio: "vs. año anterior",
};

const PERIOD_LABEL: Record<SalesPeriodo, string> = {
  dia: "Ventas liquidadas del día",
  semana: "Ventas liquidadas de la semana",
  mes: "Ventas liquidadas del mes",
  anio: "Ventas liquidadas del año",
};

/** Rótulos del eje X según el cubo: día/semana, mes o año. */
function tickFormatter(periodo: SalesPeriodo): (date: string) => string {
  const options: Intl.DateTimeFormatOptions =
    periodo === "anio"
      ? { year: "numeric", timeZone: "UTC" }
      : periodo === "mes"
        ? { month: "short", year: "2-digit", timeZone: "UTC" }
        : { day: "2-digit", month: "short", timeZone: "UTC" };
  return (date) =>
    new Intl.DateTimeFormat("es-CO", options).format(
      new Date(`${date}T00:00:00Z`),
    );
}

export function SalesMetricCard({
  sales,
  periodo,
  className,
}: {
  sales: DashboardSales;
  periodo: SalesPeriodo;
  className?: string;
}) {
  const points = sales.serie.map((point) => ({
    date: point.fecha.slice(0, 10),
    parts: [point.total],
  }));

  const diff = sales.actual.total - sales.anterior.total;
  const pct = sales.anterior.total ? (diff / sales.anterior.total) * 100 : 0;
  const count = sales.actual.count;

  return (
    <div className={className}>
      <MetricCard
        label={PERIOD_LABEL[periodo]}
        segments={["Ventas liquidadas"]}
        data={points}
        events={[]}
        periods={[points.length]}
        defaultPeriod={points.length}
        showPeriods={false}
        showBreakdown={false}
        value={sales.actual.total}
        previousValue={sales.anterior.total}
        comparisonText={COMPARISON_LABELS[periodo]}
        format="currency"
        currency={MARKET.currency}
        locale={MARKET.locale}
        formatTick={tickFormatter(periodo)}
        className="w-full max-w-none border-border bg-card text-carbon"
      />
      <p className="mt-2 text-xs text-muted-foreground">
        {count} pedido(s) liquidado(s) en el cubo actual · Variación absoluta:{" "}
        <span className="font-semibold text-carbon [font-variant-numeric:tabular-nums]">
          {formatPrice(diff)}
        </span>{" "}
        ({pct.toFixed(1)}%) {COMPARISON_LABELS[periodo]}.
      </p>
      <p className="sr-only">
        Solo se grafican ventas liquidadas (pago settled, sin cancelados).
      </p>
    </div>
  );
}
