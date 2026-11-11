import { apiSend } from "@/services/api/client";
import type { PaymentMethodCode } from "@/types/order";

// Pago en línea (Wompi Web Checkout).
//
// `createPayment` devuelve la URL del checkout del proveedor y la referencia.
// La confirmación real llega por webhook; `verifyPayment` es el respaldo que
// consulta el estado directamente en Wompi.

export type PaymentIntent = {
  url: string;
  reference: string;
  amountInCents: number;
  currency: string;
  env?: string;
};

export type PaymentVerification = {
  applied: boolean;
  reason?: string;
  status?: string;
};

export async function createPayment(
  orderId: string,
  provider: PaymentMethodCode = "wompi",
): Promise<PaymentIntent> {
  return apiSend<PaymentIntent>("/api/payments/intent", {
    body: { orderId, provider },
  });
}

export async function verifyPayment(
  orderId: string,
  transactionId: string,
): Promise<PaymentVerification> {
  return apiSend<PaymentVerification>(
    `/api/orders/${encodeURIComponent(orderId)}/payment/verify`,
    { body: { transactionId } },
  );
}