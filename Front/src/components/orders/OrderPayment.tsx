"use client";

import { useState } from "react";
import { CreditCard, Truck } from "lucide-react";
import { createPayment } from "@/services/payments";
import { ApiError } from "@/services/api/client";

// Acciones de pago del pedido.
//
// - Wompi: `POST /api/payments/intent` devuelve la URL de Web Checkout y se
//   redirige al proveedor. La confirmación real la aplica el webhook.
// - Contra entrega: no se cobra ahora; se informa que se paga al recibir.
export function OrderPayment({
  orderId,
  paymentMethodCode,
  paymentState,
  fulfillmentStatus,
  total,
}: {
  orderId: string;
  paymentMethodCode: string | null;
  paymentState: string;
  fulfillmentStatus: string;
  total: number;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCod = Boolean(paymentMethodCode?.startsWith("cod_"));
  const isPaid = paymentState === "settled" || paymentState === "collected";
  const canPay =
    paymentMethodCode === "wompi" &&
    paymentState === "unpaid" &&
    fulfillmentStatus === "pending_payment" &&
    total > 0;

  const onPay = async () => {
    setPending(true);
    setError(null);
    try {
      const intent = await createPayment(orderId, "wompi");
      window.location.href = intent.url;
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudo iniciar el pago en línea.",
      );
      setPending(false);
    }
  };

  if (isPaid) {
    return (
      <p className="rounded-lg border border-coffee/25 bg-coffee/5 p-3 text-xs leading-relaxed text-coffee-deep">
        Pago confirmado. Gracias.
      </p>
    );
  }

  if (isCod) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-coffee/25 bg-coffee/5 p-3 text-xs leading-relaxed text-coffee-deep">
        <Truck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Pago contra entrega: pagas en efectivo cuando recibes el pedido. No se
        cobra nada ahora.
      </p>
    );
  }

  if (!canPay) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
        Este pedido no tiene un pago pendiente.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={onPay}
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-carbon px-5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep disabled:opacity-60"
      >
        <CreditCard className="h-4 w-4" aria-hidden="true" />
        {pending ? "Abriendo pago…" : "Pagar ahora"}
      </button>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-xs leading-relaxed text-terracotta-deep"
        >
          {error}
        </p>
      ) : null}

      <p className="text-center text-[11px] text-muted-foreground">
        Te llevaremos al checkout seguro de Wompi.
      </p>
    </div>
  );
}