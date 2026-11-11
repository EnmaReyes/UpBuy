import { Check, Circle, X } from "lucide-react";
import { formatDate } from "@/lib/format";

// Línea de tiempo del pedido. Se usa en la ficha privada y en el seguimiento
// público. No calcula estados: los recibe ya resueltos por el backend.

type TimelineDates = {
  createdAt: string;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
};

type Step = {
  key: string;
  label: string;
  at: string | null;
  done: boolean;
  cancelled?: boolean;
};

export function TrackingTimeline({
  fulfillmentStatus,
  dates,
}: {
  fulfillmentStatus: string;
  dates: TimelineDates;
}) {
  const isCancelled = fulfillmentStatus === "cancelled";
  const packingDone = ["packing", "shipped", "delivered"].includes(
    fulfillmentStatus,
  );
  const shippedDone = ["shipped", "delivered"].includes(fulfillmentStatus);
  const deliveredDone = fulfillmentStatus === "delivered";

  const steps: Step[] = [
    {
      key: "created",
      label: "Pedido confirmado",
      at: dates.createdAt,
      done: true,
    },
  ];

  if (isCancelled) {
    steps.push({
      key: "cancelled",
      label: "Cancelado",
      at: dates.cancelledAt ?? null,
      done: true,
      cancelled: true,
    });
  } else {
    steps.push(
      {
        key: "packing",
        label: "En preparación",
        at: null,
        done: packingDone,
      },
      {
        key: "shipped",
        label: "En camino",
        at: dates.shippedAt ?? null,
        done: shippedDone,
      },
      {
        key: "delivered",
        label: "Entregado",
        at: dates.deliveredAt ?? null,
        done: deliveredDone,
      },
    );
  }

  return (
    <ol className="grid gap-4">
      {steps.map((step) => (
        <li key={step.key} className="flex gap-3">
          <span
            aria-hidden="true"
            className={[
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
              step.cancelled
                ? "border-terracotta bg-terracotta text-cream"
                : step.done
                  ? "border-carbon bg-carbon text-cream"
                  : "border-border bg-card text-muted-foreground",
            ].join(" ")}
          >
            {step.cancelled ? (
              <X className="h-3.5 w-3.5" />
            ) : step.done ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Circle className="h-3.5 w-3.5" />
            )}
          </span>
          <div className="min-w-0">
            <p
              className={[
                "text-sm font-semibold",
                step.done || step.cancelled
                  ? "text-carbon"
                  : "text-muted-foreground",
              ].join(" ")}
            >
              {step.label}
            </p>
            {step.at ? (
              <p className="text-xs text-muted-foreground">
                {formatDate(step.at)}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
