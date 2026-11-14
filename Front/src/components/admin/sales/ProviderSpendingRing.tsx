"use client";

import { useState } from "react";
import SpendingRing from "@/components/kokonutui/spending-ring";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ADMIN_PROVIDER_LABELS, type AccountingByProvider } from "@/types/admin";

// Anillo de «Ventas por proveedor» (ADM-6).
//
// Envuelve `@kokonutui/spending-ring` con los segmentos de
// `accounting.byProvider`. El valor principal es la cantidad de pedidos y se
// puede alternar a monto bruto con un control accesible. La leyenda repite
// pedidos, monto y utilidad en texto: el color no es la única señal.
//
// Los colores y las etiquetas son genéricos: cualquier proveedor que aparezca
// en la contabilidad obtiene un color estable (derivado de su nombre) y una
// etiqueta legible; `sin_proveedor` siempre queda en gris.

/** Paleta de segmentos; asignada por hash del nombre del proveedor. */
const PROVIDER_PALETTE: { stroke: string; dot: string }[] = [
  { stroke: "stroke-[#D35400]", dot: "bg-[#D35400]" }, // terracotta
  { stroke: "stroke-[#8B6F56]", dot: "bg-[#8B6F56]" }, // coffee
  { stroke: "stroke-emerald-600 dark:stroke-emerald-500", dot: "bg-emerald-600" },
  { stroke: "stroke-sky-600 dark:stroke-sky-500", dot: "bg-sky-600" },
  { stroke: "stroke-amber-600 dark:stroke-amber-500", dot: "bg-amber-600" },
  { stroke: "stroke-violet-600 dark:stroke-violet-500", dot: "bg-violet-600" },
];

const NEUTRAL_COLOR = {
  stroke: "stroke-zinc-400 dark:stroke-zinc-500",
  dot: "bg-zinc-400",
};

/** Hash estable del nombre: el mismo proveedor siempre recibe el mismo color. */
function colorForProvider(provider: string): { stroke: string; dot: string } {
  let hash = 0;
  for (let i = 0; i < provider.length; i++) {
    hash = (hash * 31 + provider.charCodeAt(i)) % 1_000_003;
  }
  return PROVIDER_PALETTE[hash % PROVIDER_PALETTE.length];
}

/** Etiqueta legible del proveedor: mapa conocido, si no, el slug en legible. */
export function providerLabel(provider: string): string {
  if (provider === "sin_proveedor") return "Sin proveedor";
  return ADMIN_PROVIDER_LABELS[provider] ?? provider;
}

type RingMetric = "pedidos" | "bruto";

const toggleClass = (active: boolean) =>
  cn(
    "inline-flex min-h-11 items-center rounded-full px-4 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    active
      ? "bg-carbon text-cream"
      : "text-coffee-deep hover:text-carbon",
  );

export function ProviderSpendingRing({
  byProvider,
  className,
}: {
  byProvider: AccountingByProvider[];
  className?: string;
}) {
  const [metric, setMetric] = useState<RingMetric>("pedidos");

  const totalOrders = byProvider.reduce((sum, row) => sum + row.orders, 0);
  const totalGross = byProvider.reduce((sum, row) => sum + row.gross, 0);

  if (byProvider.length === 0) return null;

  const categories = byProvider.map((row) => {
    const color =
      row.provider === "sin_proveedor"
        ? NEUTRAL_COLOR
        : colorForProvider(row.provider);
    return {
      name: providerLabel(row.provider),
      amount: metric === "pedidos" ? row.orders : row.gross,
      stroke: color.stroke,
      dot: color.dot,
      meta: [
        { label: "Pedidos", value: String(row.orders) },
        { label: "Monto", value: formatPrice(row.gross) },
        { label: "Utilidad", value: formatPrice(row.netProfit) },
      ],
    };
  });

  return (
    <div
      className={cn(
        "rounded-3xl border border-border bg-card p-5 text-carbon",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-heading text-base font-semibold text-carbon">
            Ventas por proveedor
          </h3>
          <p className="text-xs text-muted-foreground">
            Gira el anillo o usa las flechas para leer cada segmento.
          </p>
        </div>
        <div
          role="group"
          aria-label="Medida del anillo de proveedores"
          className="flex rounded-full bg-muted p-0.5"
        >
          <button
            type="button"
            aria-pressed={metric === "pedidos"}
            onClick={() => setMetric("pedidos")}
            className={toggleClass(metric === "pedidos")}
          >
            Pedidos
          </button>
          <button
            type="button"
            aria-pressed={metric === "bruto"}
            onClick={() => setMetric("bruto")}
            className={toggleClass(metric === "bruto")}
          >
            Monto bruto
          </button>
        </div>
      </div>

      <SpendingRing
        title={
          metric === "pedidos"
            ? "Pedidos por proveedor"
            : "Monto bruto por proveedor"
        }
        categories={categories}
        formatValue={(value) =>
          metric === "pedidos" ? String(value) : formatPrice(value)
        }
        unitLabel={metric === "pedidos" ? "pedidos" : undefined}
        className="mx-auto mt-2 max-w-none border-0 bg-transparent p-0"
      />

      <p className="mt-2 text-xs text-muted-foreground">
        Total del rango:{" "}
        <span className="font-semibold text-carbon [font-variant-numeric:tabular-nums]">
          {metric === "pedidos" ? `${totalOrders} pedido(s)` : formatPrice(totalGross)}
        </span>
        . El detalle completo está en la tabla «Detalle por proveedor».
      </p>
    </div>
  );
}
