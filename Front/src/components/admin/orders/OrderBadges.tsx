import {
  FULFILLMENT_LABELS,
  PAYMENT_STATE_LABELS,
} from "@/types/order";
import { cn } from "@/lib/utils";

// Insignias de estado reutilizadas por la lista y el detalle. El color no es
// la única señal: siempre hay texto legible.

const base =
  "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap";

const fulfillmentTone: Record<string, string> = {
  pending_payment: "bg-amber-100 text-amber-900",
  paid: "bg-sky-100 text-sky-900",
  packing: "bg-indigo-100 text-indigo-900",
  shipped: "bg-violet-100 text-violet-900",
  delivered: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-rose-100 text-rose-900",
};

const paymentTone: Record<string, string> = {
  unpaid: "bg-amber-100 text-amber-900",
  pending_collection: "bg-orange-100 text-orange-900",
  collected: "bg-sky-100 text-sky-900",
  settled: "bg-emerald-100 text-emerald-900",
  refunded: "bg-rose-100 text-rose-900",
};

export function FulfillmentBadge({ value }: { value: string }) {
  return (
    <span className={cn(base, fulfillmentTone[value] ?? "bg-muted text-carbon")}>
      {FULFILLMENT_LABELS[value] ?? value}
    </span>
  );
}

export function PaymentBadge({ value }: { value: string }) {
  return (
    <span className={cn(base, paymentTone[value] ?? "bg-muted text-carbon")}>
      {PAYMENT_STATE_LABELS[value] ?? value}
    </span>
  );
}

export function SyncBadge({
  provider,
  outOfSync,
  manualOverride,
  lastSyncOk,
}: {
  provider: string | null;
  outOfSync: boolean;
  manualOverride: boolean;
  lastSyncOk?: boolean | null;
}) {
  if (outOfSync) {
    return (
      <span className={cn(base, "bg-rose-100 text-rose-900")}>
        Desincronizado
      </span>
    );
  }
  if (!provider) {
    return (
      <span className={cn(base, "bg-muted text-coffee-deep")}>Sin proveedor</span>
    );
  }
  if (manualOverride) {
    return (
      <span className={cn(base, "bg-amber-100 text-amber-900")}>
        Cambio manual
      </span>
    );
  }
  if (lastSyncOk === false) {
    return (
      <span className={cn(base, "bg-amber-100 text-amber-900")}>
        Último sync falló
      </span>
    );
  }
  return (
    <span className={cn(base, "bg-emerald-100 text-emerald-900")}>Al día</span>
  );
}
