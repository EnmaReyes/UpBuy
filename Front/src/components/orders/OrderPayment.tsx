"use client";

import { useRef, useState } from "react";
import { Truck } from "lucide-react";
import { createPayment } from "@/services/payments";
import { ApiError } from "@/services/api/client";
import SlideToConfirm from "@/components/kokonutui/slide-to-confirm";

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
  // El intento de pago se pide una sola vez aunque el gesto se repita.
  const inFlightRef = useRef(false);

  const isCod = Boolean(paymentMethodCode?.startsWith("cod_"));
  const isPaid = paymentState === "settled" || paymentState === "collected";
  const canPay =
    paymentMethodCode === "wompi" &&
    paymentState === "unpaid" &&
    fulfillmentStatus === "pending_payment" &&
    total > 0;

  // Misma función que ejecutaba "Pagar ahora": crea el intento en Wompi y
  // redirige a su checkout alojado. Los datos de la tarjeta nunca pasan por
  // UPBUY. Si falla, se rechaza la promesa para que el pulgar vuelva al inicio.
  const onPay = async (): Promise<void> => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
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
      throw caught;
    } finally {
      inFlightRef.current = false;
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
      <SlideToConfirm
        label="Desliza para pagar"
        confirmingLabel="Abriendo pago"
        doneLabel="Redirigiendo…"
        onConfirm={onPay}
        disabled={pending}
        resetAfter={null}
        className="max-w-none"
      />

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-xs leading-relaxed text-terracotta-deep"
        >
          {error}
        </p>
      ) : null}

      <p className="text-center text-[11px] text-muted-foreground">
        Te llevaremos al checkout seguro de Wompi. Allí eliges tarjeta débito,
        crédito, PSE o Nequi.
      </p>
    </div>
  );
}