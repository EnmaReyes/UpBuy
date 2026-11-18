"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { cancelOrder } from "@/services/orders";
import { ApiError } from "@/services/api/client";

// Cancelación desde la ficha del pedido.
//
// El backend es quien decide si se puede cancelar (`canCancel`): este
// componente solo se pinta cuando el servidor lo permite. Aun así la regla se
// vuelve a validar en el endpoint, porque el estado pudo cambiar desde que se
// cargó la página.
export function OrderCancel({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCancel = async () => {
    setPending(true);
    setError(null);
    try {
      await cancelOrder(orderId);
      // Se marca como hecho antes de refrescar: si el refresh tarda o falla,
      // el boton no queda atascado en "Cancelando…". El Server Component
      // reemplaza este bloque cuando llega el estado real (cancelado).
      setDone(true);
      setPending(false);
      setConfirming(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudo cancelar el pedido.",
      );
      setPending(false);
    }
  };

  if (done) {
    return (
      <p
        role="status"
        className="rounded-lg border border-border bg-muted/40 p-3 text-center text-sm font-semibold text-carbon"
      >
        Pedido cancelado. Actualizando…
      </p>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border px-5 text-sm font-semibold text-carbon transition-colors hover:border-terracotta hover:text-terracotta-deep"
      >
        <XCircle className="h-4 w-4" aria-hidden="true" />
        Cancelar pedido
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Confirmar cancelación"
      className="rounded-lg border border-terracotta/30 bg-terracotta/5 p-4"
    >
      <p className="text-sm leading-relaxed text-terracotta-deep">
        ¿Seguro que quieres cancelar este pedido? Esta acción no se puede
        deshacer.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-terracotta px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep disabled:opacity-60"
        >
          {pending ? "Cancelando…" : "Sí, cancelar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon disabled:opacity-60"
        >
          Volver
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-terracotta/30 bg-card p-3 text-xs leading-relaxed text-terracotta-deep"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
