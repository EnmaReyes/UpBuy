import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, ChevronRight, Truck } from "lucide-react";
import { getOrder } from "@/services/orders/queries";
import { getSession } from "@/services/account/queries";
import { ApiError } from "@/services/api/client";
import { formatPrice } from "@/lib/format";
import { OrderPayment } from "@/components/orders/OrderPayment";
import { SafeImage } from "@/components/shared/SafeImage";
import {
  FULFILLMENT_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATE_LABELS,
  type Order,
} from "@/types/order";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pedido confirmado — UPBUY",
  robots: { index: false, follow: false },
};

type OrderPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ metodo?: string }>;
};

export default async function OrderPage({ params, searchParams }: OrderPageProps) {
  const { id } = await params;
  const query = await searchParams;

  const session = await getSession();
  if (!session) redirect(`/login?next=/pedido/${id}`);

  let order: Order;
  try {
    order = await getOrder(id);
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) notFound();
    throw error;
  }

  const fulfillmentLabel =
    FULFILLMENT_LABELS[order.fulfillmentStatus] ?? order.fulfillmentStatus;
  const paymentLabel =
    PAYMENT_STATE_LABELS[order.paymentState] ?? order.paymentState;
  const address = order.addressSnapshot ?? null;
  const requestedCod = Boolean(query.metodo?.startsWith("cod_"));

  return (
    <div className="bg-background">
      <section className="bg-carbon pt-28 pb-14 text-cream sm:pt-32">
        <div className="container-page">
          <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.25em] text-terracotta uppercase">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Pedido creado
          </p>
          <h1 className="mt-4 font-heading text-[clamp(2rem,4.5vw,3.5rem)] leading-tight font-bold tracking-tight">
            Gracias por tu compra
          </h1>
          <p className="mt-3 text-sm text-cream/70">
            Pedido <span className="font-semibold text-cream">{order.orderNumber}</span>
          </p>
        </div>
      </section>

      <section className="section-y">
        <div className="container-page">
          {requestedCod && order.paymentMethodCode === "wompi" ? (
            <p
              role="alert"
              className="mb-8 rounded-xl border border-terracotta/30 bg-terracotta/5 p-4 text-sm leading-relaxed text-terracotta-deep"
            >
              Elegiste contra entrega, pero el servidor registró el pedido como
              pago en línea: el endpoint de pedidos todavía no acepta el método
              de pago. Contacta a la tienda para ajustarlo antes de pagar.
            </p>
          ) : null}

          <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-heading text-lg font-semibold text-carbon">
                Resumen del pedido
              </h2>
              <ul className="mt-4 grid gap-4">
                {order.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex min-w-0 items-start justify-between gap-4"
                  >
                    <div className="flex min-w-0 gap-3">
                      <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                        <SafeImage
                          src={item.imageUrl}
                          alt={item.title}
                          className="absolute inset-0 h-full w-full object-cover"
                          fallback={
                            <span
                              aria-hidden="true"
                              className="absolute inset-0 bg-[linear-gradient(150deg,#EDE0CE_0%,#F5E9D7_48%,#D9C9B3_100%)]"
                            />
                          }
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-carbon">
                          {item.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.size ? `Talla ${item.size} · ` : ""}
                          {item.quantity} × {formatPrice(item.unitPrice)}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                      {formatPrice(item.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>

              <dl className="mt-5 grid gap-2 border-t border-border pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="text-carbon [font-variant-numeric:tabular-nums]">
                    {formatPrice(order.subtotal)}
                  </dd>
                </div>
                {order.discountTotal > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Descuento</dt>
                    <dd className="text-carbon [font-variant-numeric:tabular-nums]">
                      −{formatPrice(order.discountTotal)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Envío</dt>
                  <dd className="font-semibold text-terracotta-deep">Gratis</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2">
                  <dt className="font-semibold text-carbon">Total</dt>
                  <dd className="font-heading text-lg font-bold text-carbon [font-variant-numeric:tabular-nums]">
                    {formatPrice(order.total)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-heading text-lg font-semibold text-carbon">
                Entrega
              </h2>
              <p className="mt-3 text-sm text-carbon">
                {order.recipientName ?? address?.recipientName}
              </p>
              <p className="text-sm text-muted-foreground">
                {address?.address ?? order.address}
                {address?.reference ? ` · ${address.reference}` : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                {[address?.city ?? order.city, address?.department ?? order.department]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {order.phone ?? address?.phone}
              </p>

              {order.estimatedDeliveryDays ? (
                <p className="mt-4 flex items-center gap-2 text-sm text-coffee-deep">
                  <Truck className="h-4 w-4" aria-hidden="true" />
                  Entrega estimada en {order.estimatedDeliveryDays} días hábiles.
                </p>
              ) : null}
            </div>
          </div>

          <aside className="min-w-0 lg:col-span-5">
            <div className="rounded-xl border border-border bg-card p-6 lg:sticky lg:top-24">
              <h2 className="font-heading text-lg font-semibold text-carbon">
                Estado
              </h2>

              <dl className="mt-4 grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Preparación</dt>
                  <dd className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-carbon">
                    {fulfillmentLabel}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Pago</dt>
                  <dd className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-carbon">
                    {paymentLabel}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Método</dt>
                  <dd className="text-xs font-semibold text-carbon">
                    {order.paymentMethodCode
                      ? (PAYMENT_METHOD_LABELS[order.paymentMethodCode] ??
                        order.paymentMethodCode)
                      : "Sin definir"}
                  </dd>
                </div>
              </dl>

              <div className="mt-5">
                <OrderPayment
                  orderId={order.id}
                  paymentMethodCode={order.paymentMethodCode}
                  paymentState={order.paymentState}
                  fulfillmentStatus={order.fulfillmentStatus}
                  total={order.total}
                />
              </div>

              <div className="mt-5 grid gap-2">
                <Link
                  href="/productos"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-carbon px-5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
                >
                  Seguir comprando
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/cuenta/pedidos"
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-border px-5 text-sm font-semibold text-carbon transition-colors hover:border-carbon"
                >
                  Ver mis pedidos
                </Link>
              </div>
            </div>
          </aside>
          </div>
        </div>
      </section>
    </div>
  );
}