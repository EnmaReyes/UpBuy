import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  getAdminClient,
  getAdminClientOrders,
} from "@/services/admin/users";
import { formatDateTime, formatPrice } from "@/lib/format";
import {
  FULFILLMENT_LABELS,
  PAYMENT_STATE_LABELS,
} from "@/types/order";
import { ClientDetailView } from "@/components/admin/users/ClientDetailView";

// Detalle de un cliente (ADM-9): datos, direcciones, pedidos, consentimientos
// y acciones de edición / desactivación.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cliente — Panel UPBUY",
  robots: { index: false, follow: false },
};

export default async function AdminClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail;
  let orders;
  try {
    [detail, orders] = await Promise.all([
      getAdminClient(id),
      getAdminClientOrders(id, { limit: 20 }),
    ]);
  } catch {
    notFound();
  }

  const title =
    [detail.user.name, detail.user.lastName].filter(Boolean).join(" ").trim() ||
    detail.user.username ||
    detail.user.email;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link
          className="inline-flex items-center gap-1 text-sm font-semibold text-coffee-deep transition-colors hover:text-carbon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          href="/admin/usuarios"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Volver a usuarios
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-carbon">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {detail.user.email} · Registrado el {formatDateTime(detail.user.createdAt)}
        </p>
      </header>

      <ClientDetailView detail={detail} />

      <section aria-label="Pedidos del cliente" className="rounded-xl border border-border bg-card p-4">
        <p className="font-semibold text-sm text-carbon">
          Pedidos ({orders.total})
        </p>
        {orders.orders.length === 0 ? (
          <p className="mt-2 text-sm text-coffee-deep">
            Este cliente todavía no ha hecho compras.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="text-xs tracking-wide text-coffee-deep uppercase">
                <tr>
                  <th scope="col" className="py-2 font-semibold">Pedido</th>
                  <th scope="col" className="py-2 font-semibold">Fecha</th>
                  <th scope="col" className="py-2 font-semibold">Ciudad</th>
                  <th scope="col" className="py-2 font-semibold">Total</th>
                  <th scope="col" className="py-2 font-semibold">Pago</th>
                  <th scope="col" className="py-2 font-semibold">Cumplimiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.orders.map((order) => (
                  <tr key={order.id}>
                    <td className="py-2.5">
                      <Link
                        className="font-semibold text-carbon underline-offset-4 hover:text-terracotta-deep hover:underline"
                        href={`/admin/pedidos/${order.id}`}
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="py-2.5 text-coffee-deep">
                      {formatDateTime(order.createdAt)}
                    </td>
                    <td className="py-2.5 text-coffee-deep">{order.city || "—"}</td>
                    <td className="py-2.5 font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                      {formatPrice(order.total)}
                    </td>
                    <td className="py-2.5">
                      {PAYMENT_STATE_LABELS[order.paymentState] ?? order.paymentState}
                    </td>
                    <td className="py-2.5">
                      {FULFILLMENT_LABELS[order.fulfillmentStatus] ??
                        order.fulfillmentStatus}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
