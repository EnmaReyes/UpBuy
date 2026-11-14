"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  Check,
  ChevronDown,
  CircleAlert,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { ApiError } from "@/services/api/client";
import {
  cancelVenndeloOrder,
  confirmVenndeloOrder,
  getVenndeloOrder,
} from "@/services/admin/providers.actions";
import { formatDateTime } from "@/lib/format";
import type { AdminVenndeloOrder } from "@/types/admin";
import {
  ADMIN_VENNDELO_CONFIRMATION_LABELS,
  ADMIN_VENNDELO_ORDER_STATUS_LABELS,
} from "@/types/admin";
import { VenndeloAdvancedTools } from "./VenndeloAdvancedTools";

// Pedidos administrativos de Venndelo Pro (ADM-4). Se listan, se consulta el
// detalle, se cancelan con confirmacion y se responde la confirmacion de
// entrega COD. El estado se muestra mapeado: nunca el string crudo.

const orderId = (order: AdminVenndeloOrder): string =>
  String(order.id || order.order_id || order.external_order_id || "");

const orderDate = (order: AdminVenndeloOrder): string | null => {
  const value = order.created_at || order.createdAt;
  return typeof value === "string" ? value : null;
};

const orderTotal = (order: AdminVenndeloOrder): number => {
  const value = Number(order.total ?? order.amount_total ?? order.total_amount);
  return Number.isFinite(value) ? value : 0;
};

const customerName = (order: AdminVenndeloOrder): string => {
  const record = (order.customer || order.billing_info || {}) as Record<
    string,
    unknown
  >;
  const name = record.name || record.full_name || record.recipient_name;
  return typeof name === "string" && name.trim() ? name : "—";
};

const statusLabel = (order: AdminVenndeloOrder): string => {
  const raw = String(order.status || "").toUpperCase();
  return ADMIN_VENNDELO_ORDER_STATUS_LABELS[raw] || "Sin estado";
};

const confirmationLabel = (order: AdminVenndeloOrder): string => {
  const raw = String(order.confirmation_status || "").toUpperCase();
  return ADMIN_VENNDELO_CONFIRMATION_LABELS[raw] || "Sin confirmar";
};

export function VenndeloOrders({ orders }: { orders: AdminVenndeloOrder[] }) {
  const router = useRouter();
  const [detail, setDetail] = useState<AdminVenndeloOrder | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<void>, success: string) => {
    setBusy(key);
    setMessage(null);
    setError(null);
    try {
      await action();
      setMessage(success);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudo completar la acción.",
      );
    } finally {
      setBusy(null);
    }
  };

  const openDetail = async (order: AdminVenndeloOrder) => {
    const id = orderId(order);
    if (!id) return;
    setBusy(`detail-${id}`);
    setError(null);
    try {
      setDetail(await getVenndeloOrder(id));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudo cargar el detalle del pedido.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {message ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-sm text-terracotta-deep"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-12 text-center">
          <Search className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-heading text-lg font-semibold text-carbon">
            Sin pedidos en Venndelo Pro
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Los pedidos creados en Venndelo con estas credenciales aparecerán
            aquí. Prueba con otro estado o rango de fechas.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-muted/50 text-xs tracking-wide text-coffee-deep uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Pedido</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Cliente</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Fecha</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Estado</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Confirmación</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((order, index) => {
                  const id = orderId(order);
                  return (
                    <tr key={id || `order-${index}`} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-semibold text-carbon">
                          {id || "—"}
                        </p>
                        <p className="text-[11px] text-muted-foreground [font-variant-numeric:tabular-nums]">
                          {orderTotal(order).toLocaleString("es-CO", {
                            style: "currency",
                            currency: String(order.currency || "COP"),
                            maximumFractionDigits: 0,
                          })}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-carbon">{customerName(order)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {orderDate(order) ? formatDateTime(orderDate(order)!) : "—"}
                      </td>
                      <td className="px-4 py-3 text-coffee-deep">{statusLabel(order)}</td>
                      <td className="px-4 py-3 text-coffee-deep">
                        {confirmationLabel(order)}
                      </td>
                      <td className="px-4 py-3">
                        <OrderActions
                          order={order}
                          id={id}
                          busy={busy}
                          onDetail={() => openDetail(order)}
                          onConfirm={(status) =>
                            run(
                              `confirm-${id}`,
                              async () => {
                                await confirmVenndeloOrder(id, status);
                              },
                              `Confirmación actualizada: ${ADMIN_VENNDELO_CONFIRMATION_LABELS[status]}.`,
                            )
                          }
                          onCancel={() =>
                            run(
                              `cancel-${id}`,
                              async () => {
                                await cancelVenndeloOrder(id);
                              },
                              "Pedido cancelado en Venndelo Pro.",
                            )
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="grid gap-3 md:hidden">
            {orders.map((order, index) => {
              const id = orderId(order);
              return (
                <li
                  key={id || `order-card-${index}`}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-semibold text-carbon">
                        {id || "—"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {orderDate(order) ? formatDateTime(orderDate(order)!) : "—"}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                      {orderTotal(order).toLocaleString("es-CO", {
                        style: "currency",
                        currency: String(order.currency || "COP"),
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-carbon">{customerName(order)}</p>
                  <p className="mt-1 text-xs text-coffee-deep">
                    {statusLabel(order)} · {confirmationLabel(order)}
                  </p>
                  <div className="mt-3">
                    <OrderActions
                      order={order}
                      id={id}
                      busy={busy}
                      full
                      onDetail={() => openDetail(order)}
                      onConfirm={(status) =>
                        run(
                          `confirm-${id}`,
                          async () => {
                            await confirmVenndeloOrder(id, status);
                          },
                          `Confirmación actualizada: ${ADMIN_VENNDELO_CONFIRMATION_LABELS[status]}.`,
                        )
                      }
                      onCancel={() =>
                        run(
                          `cancel-${id}`,
                          async () => {
                            await cancelVenndeloOrder(id);
                          },
                          "Pedido cancelado en Venndelo Pro.",
                        )
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {detail ? (
        <section
          aria-labelledby="venndelo-order-detail"
          className="rounded-xl border border-border bg-card p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2
                id="venndelo-order-detail"
                className="font-heading text-base font-semibold text-carbon"
              >
                Detalle del pedido
              </h2>
              <p className="font-mono text-xs text-muted-foreground">
                {orderId(detail) || "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDetail(null)}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-carbon hover:border-carbon"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Cerrar
            </button>
          </div>

          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <Row label="Cliente" value={customerName(detail)} />
            <Row label="Estado" value={statusLabel(detail)} />
            <Row label="Confirmación" value={confirmationLabel(detail)} />
            <Row
              label="Fecha"
              value={orderDate(detail) ? formatDateTime(orderDate(detail)!) : "—"}
            />
            <Row
              label="Total"
              value={orderTotal(detail).toLocaleString("es-CO", {
                style: "currency",
                currency: String(detail.currency || "COP"),
                maximumFractionDigits: 0,
              })}
            />
            <Row
              label="Referencia externa"
              value={String(detail.external_order_id || detail.externalOrderId || "—")}
            />
          </dl>

          <p className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            El detalle completo vive en el panel de Venndelo Pro. Aquí se
            muestran los campos operativos y el estado ya traducido.
          </p>
        </section>
      ) : null}

      <VenndeloAdvancedTools />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-carbon">{value}</dd>
    </div>
  );
}

function OrderActions({
  id,
  busy,
  full,
  onDetail,
  onConfirm,
  onCancel,
}: {
  order: AdminVenndeloOrder;
  id: string;
  busy: string | null;
  full?: boolean;
  onDetail: () => void;
  onConfirm: (status: "CONFIRMED" | "REJECTED") => void;
  onCancel: () => void;
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const cancellable = !busy && id;

  return (
    <div className={full ? "flex flex-col gap-2" : "flex flex-wrap justify-end gap-1.5"}>
      <button
        type="button"
        onClick={onDetail}
        disabled={!id || busy === `detail-${id}`}
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-carbon hover:border-carbon disabled:opacity-50"
      >
        {busy === `detail-${id}` ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Ver detalle
      </button>

      <button
        type="button"
        onClick={() => onConfirm("CONFIRMED")}
        disabled={!cancellable}
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800 hover:border-emerald-400 disabled:opacity-50"
      >
        {busy === `confirm-${id}` ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Confirmar
      </button>

      <button
        type="button"
        onClick={() => onConfirm("REJECTED")}
        disabled={!cancellable}
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-coffee-deep hover:border-carbon disabled:opacity-50"
      >
        Rechazar
      </button>

      {confirmingCancel ? (
        <span className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setConfirmingCancel(false);
              onCancel();
            }}
            disabled={!cancellable}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-rose-700 px-2.5 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
          >
            {busy === `cancel-${id}` ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            Sí, cancelar
          </button>
          <button
            type="button"
            onClick={() => setConfirmingCancel(false)}
            className="inline-flex h-8 items-center rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-carbon"
          >
            No
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingCancel(true)}
          disabled={!cancellable}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-800 hover:border-rose-400 disabled:opacity-50"
        >
          <Ban className="h-3.5 w-3.5" aria-hidden="true" />
          Cancelar
        </button>
      )}
    </div>
  );
}
