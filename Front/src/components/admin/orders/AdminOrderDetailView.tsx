"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Clock3,
  MapPin,
  Package,
  ReceiptText,
  UserRound,
} from "lucide-react";
import { SafeImage } from "@/components/shared/SafeImage";
import { formatDateTime, formatPrice } from "@/lib/format";
import {
  FULFILLMENT_LABELS,
  PAYMENT_STATE_LABELS,
} from "@/types/order";
import {
  ADMIN_CHANNEL_LABELS,
  ADMIN_MANUAL_PAYMENT_LABELS,
  ADMIN_PAYMENT_METHOD_CODE_LABELS,
  ADMIN_PROVIDER_LABELS,
  type AdminOrder,
  type AdminPermission,
  type AdminSyncLog,
} from "@/types/admin";
import { FulfillmentBadge, PaymentBadge } from "./OrderBadges";
import { AdminOrderStatusPanel } from "./AdminOrderStatusPanel";
import { AdminOrderProviderPanel } from "./AdminOrderProviderPanel";
import { AdminOrderPaymentsPanel } from "./AdminOrderPaymentsPanel";

// Detalle operativo del pedido. El estado se actualiza con la respuesta real
// del backend después de cada acción, sin inventar transiciones locales.

function buyerName(order: AdminOrder): string {
  const user = order.user;
  const fromUser =
    user && [user.name, user.lastName].filter(Boolean).join(" ").trim();
  return fromUser || order.recipientName || user?.email || order.email || "—";
}

function paymentMethod(order: AdminOrder): string {
  if (order.paymentMethodCode) {
    return (
      ADMIN_PAYMENT_METHOD_CODE_LABELS[order.paymentMethodCode] ??
      order.paymentMethodCode
    );
  }
  if (order.paymentMethod) {
    return (
      ADMIN_MANUAL_PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod
    );
  }
  return "Sin definir";
}

export function AdminOrderDetailView({
  initialOrder,
  permissions,
  syncHistory = [],
}: {
  initialOrder: AdminOrder;
  permissions: AdminPermission[];
  syncHistory?: AdminSyncLog[];
}) {
  const [order, setOrder] = useState(initialOrder);

  useEffect(() => {
    setOrder(initialOrder);
  }, [initialOrder]);

  const canWrite = permissions.includes("orders.write");
  const canRefund = permissions.includes("orders.refund");

  const address = order.addressSnapshot;
  const recipient = buyerName(order);
  const phone = order.phone || address?.phone;
  const email = order.email || address?.email || order.user?.email;
  const fullAddress =
    address?.address || order.address || "Sin dirección registrada";
  const cityLine = [address?.city ?? order.city, address?.department ?? order.department]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/pedidos"
          className="inline-flex items-center gap-1 text-xs font-semibold text-coffee-deep underline-offset-4 hover:text-carbon hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Volver a pedidos
        </Link>
      </div>

      <header className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-coffee-deep uppercase">
              Pedido
            </p>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-carbon">
              {order.orderNumber}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDateTime(order.createdAt)} ·{" "}
              {ADMIN_CHANNEL_LABELS[order.channel] ?? order.channel} ·{" "}
              {paymentMethod(order)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-heading text-2xl font-bold text-carbon [font-variant-numeric:tabular-nums]">
              {formatPrice(order.total)}
            </p>
            <div className="mt-1 flex flex-wrap justify-end gap-1.5">
              <PaymentBadge value={order.paymentState} />
              <FulfillmentBadge value={order.fulfillmentStatus} />
            </div>
          </div>
        </div>

        {order.providerOutOfSync ? (
          <p
            role="status"
            className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900"
          >
            Este pedido está desincronizado con el proveedor. Revisa el bloque
            «Proveedor» y reintenta.
          </p>
        ) : null}
      </header>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-7">
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-1.5 font-heading text-base font-semibold text-carbon">
              <UserRound className="h-4 w-4" aria-hidden="true" />
              Comprador y entrega
            </h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
                  Destinatario
                </dt>
                <dd className="mt-0.5 text-sm font-medium text-carbon">
                  {recipient}
                </dd>
                {order.user ? (
                  <dd className="text-xs text-muted-foreground">
                    Cuenta: {order.user.email}
                  </dd>
                ) : (
                  <dd className="text-xs text-muted-foreground">
                    Venta sin cuenta de usuario
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
                  Contacto
                </dt>
                <dd className="mt-0.5 text-sm text-carbon">{phone || "—"}</dd>
                <dd className="text-xs break-all text-muted-foreground">
                  {email || "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="flex items-center gap-1 text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  Dirección
                </dt>
                <dd className="mt-0.5 text-sm text-carbon">{fullAddress}</dd>
                <dd className="text-xs text-muted-foreground">
                  {[cityLine, address?.postalCode].filter(Boolean).join(" · ") ||
                    "—"}
                </dd>
                {address?.reference ? (
                  <dd className="text-xs text-muted-foreground">
                    Referencia: {address.reference}
                  </dd>
                ) : null}
              </div>
              {order.notes ? (
                <div className="sm:col-span-2">
                  <dt className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
                    Nota del comprador
                  </dt>
                  <dd className="mt-0.5 text-sm text-coffee-deep">
                    {order.notes}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-1.5 font-heading text-base font-semibold text-carbon">
              <Package className="h-4 w-4" aria-hidden="true" />
              Ítems
            </h2>
            <ul className="mt-3 divide-y divide-border">
              {order.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 gap-3">
                    <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
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
                      <p className="text-sm font-medium text-carbon">
                        {item.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.size ? `Talla ${item.size} · ` : ""}
                        {item.quantity} × {formatPrice(item.unitPrice)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Producto {item.productId.slice(0, 8)}…
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                    {formatPrice(item.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-4 grid gap-1.5 border-t border-border pt-3 text-sm">
              <Row label="Subtotal" value={formatPrice(order.subtotal)} />
              <Row label="Envío" value={formatPrice(order.shippingCost)} />
              {order.discountTotal > 0 ? (
                <Row
                  label="Descuento"
                  value={`−${formatPrice(order.discountTotal)}`}
                />
              ) : null}
              <Row
                label="Costo proveedor"
                value={formatPrice(order.providerCost)}
              />
              <Row label="Comisión pasarela" value={formatPrice(order.gatewayFee)} />
              <Row label="Comisión proveedor" value={formatPrice(order.providerFee)} />
              <div className="mt-1 flex justify-between border-t border-border pt-2">
                <dt className="font-semibold text-carbon">Utilidad neta</dt>
                <dd className="font-heading text-base font-bold text-carbon [font-variant-numeric:tabular-nums]">
                  {formatPrice(order.netProfit)}
                </dd>
              </div>
              <div className="flex justify-between text-base">
                <dt className="font-semibold text-carbon">Total del pedido</dt>
                <dd className="font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                  {formatPrice(order.total)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-1.5 font-heading text-base font-semibold text-carbon">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              Historial
            </h2>
            {!order.history || order.history.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Sin cambios de estado registrados.
              </p>
            ) : (
              <ol className="mt-3 flex flex-col gap-3">
                {order.history.map((entry) => {
                  const labels =
                    entry.kind === "pago"
                      ? PAYMENT_STATE_LABELS
                      : FULFILLMENT_LABELS;
                  const actor =
                    [entry.changedBy?.username, entry.changedBy?.email]
                      .filter(Boolean)
                      .join(" · ") || "Sistema";
                  return (
                    <li key={entry.id} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-terracotta"
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-carbon">
                          {entry.fromStatus
                            ? `${labels[entry.fromStatus] ?? entry.fromStatus} → `
                            : ""}
                          <span className="font-semibold">
                            {labels[entry.toStatus] ?? entry.toStatus}
                          </span>
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({entry.kind === "pago" ? "pago" : "logística"})
                          </span>
                        </p>
                        {entry.note ? (
                          <p className="text-xs text-coffee-deep">{entry.note}</p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(entry.createdAt)} · {actor}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6 xl:col-span-5">
          <AdminOrderStatusPanel
            order={order}
            canWrite={canWrite}
            onUpdated={setOrder}
          />
          <AdminOrderProviderPanel
            order={order}
            canWrite={canWrite}
            syncHistory={syncHistory}
          />
          <AdminOrderPaymentsPanel
            order={order}
            canWrite={canWrite}
            canRefund={canRefund}
            onUpdated={setOrder}
          />

          <section className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
            <h2 className="flex items-center gap-1.5 font-heading text-sm font-semibold text-carbon">
              <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
              Datos internos
            </h2>
            <p className="mt-2 break-all">
              UUID: <span className="font-mono">{order.id}</span>
            </p>
            <p className="mt-1">
              Proveedor:{" "}
              {order.provider
                ? (ADMIN_PROVIDER_LABELS[order.provider] ?? order.provider)
                : "Sin asignar"}
            </p>
            <p className="mt-1">
              Última actualización: {formatDateTime(order.updatedAt)}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-carbon [font-variant-numeric:tabular-nums]">{value}</dd>
    </div>
  );
}
