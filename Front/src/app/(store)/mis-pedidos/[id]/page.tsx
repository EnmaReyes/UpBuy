import { redirect } from "next/navigation";
import { verifyPaymentServer } from "@/services/payments/queries";
import { getSession } from "@/services/account/queries";

export const dynamic = "force-dynamic";

// Retorno de Wompi Web Checkout.
//
// El backend arma la redirección como `${FRONTEND_URL}/mis-pedidos/:id` y
// Wompi añade `?id=<transactionId>`. Aquí se intenta verificar el pago
// (respaldo del webhook) y se manda al comprador a la ficha del pedido, que
// siempre muestra el estado real guardado por el backend.

type ReturnPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ id?: string; env?: string }>;
};

export default async function PaymentReturnPage({
  params,
  searchParams,
}: ReturnPageProps) {
  const { id } = await params;
  const query = await searchParams;

  const session = await getSession();
  if (!session) redirect(`/login?next=/pedido/${id}`);

  const transactionId = query.id;

  if (transactionId) {
    try {
      await verifyPaymentServer(id, transactionId);
    } catch {
      // La verificación es un respaldo: si falla (Wompi no configurado, red),
      // el pedido se muestra igual y el webhook sigue siendo la fuente real.
    }
  }

  redirect(`/pedido/${id}`);
}