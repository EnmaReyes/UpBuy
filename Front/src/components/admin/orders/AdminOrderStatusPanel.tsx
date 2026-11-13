"use client";

import { useState } from "react";
import { CircleAlert, Truck } from "lucide-react";
import SlideToConfirm from "@/components/kokonutui/slide-to-confirm";
import { StepUpDialog } from "@/components/admin/StepUpDialog";
import { changeAdminOrderStatus } from "@/services/admin/orders.actions";
import type { AdminAllowedTransition, AdminOrder } from "@/types/admin";
import { FULFILLMENT_LABELS } from "@/types/order";
import { useAdminAction } from "./useAdminAction";

// Acciones de estado del pedido.
//
// - Solo se muestran las transiciones que el backend considera válidas
//   (`allowedTransitions`): la UI no duplica la máquina de estados.
// - «Enviado» exige guía (número o URL); el backend también lo valida (422).
// - Cancelar se confirma deslizando (Hold / Slide to confirm) y exige step-up.
// - El error real del backend se muestra sin traducir a un mensaje genérico.

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-carbon focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function AdminOrderStatusPanel({
  order,
  canWrite,
  onUpdated,
}: {
  order: AdminOrder;
  canWrite: boolean;
  onUpdated: (order: AdminOrder) => void;
}) {
  const { busy, error, stepUpOpen, setStepUpOpen, run, retry } =
    useAdminAction();
  const [note, setNote] = useState("");
  const [trackingNumber, setTrackingNumber] = useState(
    order.trackingNumber ?? "",
  );
  const [trackingUrl, setTrackingUrl] = useState(order.trackingUrl ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  const shippingTransition = order.allowedTransitions.find(
    (item) => item.requiresTracking,
  );

  const execute = async (
    transition: AdminAllowedTransition,
    tracking?: { number: string; url: string },
  ) => {
    setLocalError(null);

    if (transition.requiresTracking) {
      if (!tracking?.number.trim() && !tracking?.url.trim()) {
        setLocalError(
          "Para marcar el pedido como enviado escribe el número de guía o el enlace de rastreo.",
        );
        return;
      }
    }

    await run(async () => {
      const updated = await changeAdminOrderStatus(order.id, {
        status: transition.value,
        note: note.trim() || undefined,
        trackingNumber: tracking?.number.trim() || undefined,
        trackingUrl: tracking?.url.trim() || undefined,
      });
      setNote("");
      onUpdated(updated);
    });
  };

  const onTransition = (transition: AdminAllowedTransition) => {
    void execute(
      transition,
      transition.requiresTracking
        ? { number: trackingNumber, url: trackingUrl }
        : undefined,
    ).catch(() => {});
  };

  if (order.allowedTransitions.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-heading text-base font-semibold text-carbon">
          Estado del pedido
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {order.fulfillmentStatus === "cancelled"
            ? "El pedido está cancelado: no admite más cambios logísticos."
            : "El pedido está entregado: el ciclo logístico terminó."}
        </p>
      </section>
    );
  }

  const normalTransitions = order.allowedTransitions.filter(
    (item) => item.value !== "cancelled",
  );
  const cancelTransition = order.allowedTransitions.find(
    (item) => item.value === "cancelled",
  );

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-heading text-base font-semibold text-carbon">
        Cambiar estado
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Solo aparecen las transiciones permitidas desde{" "}
        <span className="font-semibold text-carbon">
          {FULFILLMENT_LABELS[order.fulfillmentStatus] ??
            order.fulfillmentStatus}
        </span>
        .
      </p>

      {!canWrite ? (
        <p className="mt-3 rounded-lg border border-border bg-muted/50 p-3 text-xs text-coffee-deep">
          Tu rol puede consultar el pedido, pero no cambiarlo. Un administrador
          debe hacerlo.
        </p>
      ) : (
        <>
          {shippingTransition ? (
            <div className="mt-4 grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-carbon">
                <Truck className="h-3.5 w-3.5" aria-hidden="true" />
                Guía para marcar como enviado
              </p>
              <input
                value={trackingNumber}
                onChange={(event) => setTrackingNumber(event.target.value)}
                placeholder="Número de guía"
                aria-label="Número de guía"
                className={fieldClass}
                disabled={busy}
              />
              <input
                value={trackingUrl}
                onChange={(event) => setTrackingUrl(event.target.value)}
                placeholder="https://courier.com/rastreo/…"
                aria-label="Enlace de rastreo"
                inputMode="url"
                className={fieldClass}
                disabled={busy}
              />
            </div>
          ) : null}

          <label
            htmlFor="order-status-note"
            className="mt-4 block text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase"
          >
            Nota (opcional)
          </label>
          <textarea
            id="order-status-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Motivo o detalle del cambio"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-carbon focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            disabled={busy}
          />

          <div className="mt-3 flex flex-wrap gap-2">
            {normalTransitions.map((transition) => (
              <button
                key={transition.value}
                type="button"
                onClick={() => onTransition(transition)}
                disabled={busy}
                className="inline-flex h-10 items-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Guardando…" : `Marcar como ${transition.label.toLowerCase()}`}
              </button>
            ))}
          </div>

          {cancelTransition ? (
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-xs font-semibold tracking-[0.12em] text-terracotta-deep uppercase">
                Cancelar pedido
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Devuelve el stock y no se puede deshacer. Desliza para
                confirmar; después se pedirá tu código de verificación si hace
                falta.
              </p>
              <div className="mt-3">
                <SlideToConfirm
                  label="Desliza para cancelar el pedido"
                  confirmingLabel="Cancelando"
                  doneLabel="Cancelado"
                  disabled={busy}
                  resetAfter={null}
                  onConfirm={() =>
                    execute(cancelTransition, undefined).catch(() => {})
                  }
                />
              </div>
            </div>
          ) : null}
        </>
      )}

      {localError ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-sm text-terracotta-deep"
        >
          {localError}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-sm text-terracotta-deep"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <StepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        actionLabel="Cancelar pedido"
        onVerified={retry}
      />
    </section>
  );
}
