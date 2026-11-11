import { serverSend } from "@/services/api/server";
import type { PaymentVerification } from "./index";

// Verificación de pago en el servidor (la usa el retorno de Wompi).
// Va aparte de `./index` para no arrastrar `next/headers` al navegador.

export async function verifyPaymentServer(
  orderId: string,
  transactionId: string,
): Promise<PaymentVerification> {
  return serverSend<PaymentVerification>(
    `/api/orders/${encodeURIComponent(orderId)}/payment/verify`,
    { body: { transactionId } },
  );
}