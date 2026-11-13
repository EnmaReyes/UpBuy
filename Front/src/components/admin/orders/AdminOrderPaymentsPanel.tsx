"use client";

import { useState } from "react";
import { CircleAlert, CreditCard, ShieldCheck } from "lucide-react";
import { StepUpDialog } from "@/components/admin/StepUpDialog";
import {
  changeAdminOrderPayment,
  registerAdminOrderPayment,
} from "@/services/admin/orders.actions";
import { formatDateTime, formatPrice } from "@/lib/format";
import {
  ADMIN_PAYMENT_STATUS_LABELS,
  type AdminOrder,
  type AdminPayment,
} from "@/types/admin";
import { useAdminAction } from "./useAdminAction";

// Pagos del pedido. Registrar un pago aprobado usa POST (orders.write); cambiar
// el estado de un intento existente usa PATCH (orders.refund + step-up), igual
// que el backend. Los reembolsos piden el segundo factor.

const statusTone: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-900",
  en_revision: "bg-sky-100 text-sky-900",
  aprobado: "bg-emerald-100 text-emerald-900",
  rechazado: "bg-rose-100 text-rose-900",
  anulado: "bg-muted text-coffee-deep",
  reembolsado: "bg-violet-100 text-violet-900",
  error: "bg-rose-100 text-rose-900",
};

const CONFIRMABLE = new Set(["pendiente", "en_revision", "error"]);

export function AdminOrderPaymentsPanel({
  order,
  canWrite,
  canRefund,
  onUpdated,
}: {
  order: AdminOrder;
  canWrite: boolean;
  canRefund: boolean;
  onUpdated: (order: AdminOrder) => void;
}) {
  const { busy, error, stepUpOpen, setStepUpOpen, run, retry } =
    useAdminAction();
  const [notice, setNotice] = useState<string | null>(null);

  const payments = order.payments ?? [];
  const hasApproved = payments.some((payment) => payment.status === "aprobado");
  const canRegister = canWrite && !hasApproved && order.fulfillmentStatus !== "cancelled";

  const register = async () => {
    setNotice(null);
    await run(async () => {
      const updated = await registerAdminOrderPayment(order.id, {
        status: "aprobado",
        paymentMethodType: order.paymentMethodCode || undefined,
        note: "Pago registrado desde el panel",
      });
      setNotice("Pago aprobado registrado.");
      onUpdated(updated);
    });
  };

  const changeStatus = async (payment: AdminPayment, status: string) => {
    setNotice(null);
    await run(async () => {
      const updated = await changeAdminOrderPayment(order.id, payment.id, {
        status,
        note:
          status === "reembolsado"
            ? "Reembolso registrado desde el panel"
            : "Pago confirmado desde el panel",
      });
      setNotice(
        status === "reembolsado"
          ? "Reembolso registrado."
          : "Pago confirmado.",
      );
      onUpdated(updated);
    });
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-1.5 font-heading text-base font-semibold text-carbon">
        <CreditCard className="h-4 w-4" aria-hidden="true" />
        Pagos
      </h2>

      {payments.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Todavía no hay intentos de pago registrados.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {payments.map((payment) => {
            const confirmable = CONFIRMABLE.has(payment.status);
            return (
              <li key={payment.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                      {formatPrice(payment.amountInCents / 100)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {payment.provider}
                      {payment.paymentMethodType
                        ? ` · ${payment.paymentMethodType}`
                        : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(payment.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      statusTone[payment.status] ?? "bg-muted text-carbon"
                    }`}
                  >
                    {ADMIN_PAYMENT_STATUS_LABELS[payment.status] ??
                      payment.status}
                  </span>
                </div>

                {payment.statusMessage || payment.failureCode ? (
                  <p className="mt-1 text-xs break-words text-coffee-deep">
                    {payment.statusMessage || payment.failureCode}
                  </p>
                ) : null}

                {canRefund && (confirmable || payment.status === "aprobado") ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {confirmable ? (
                      <button
                        type="button"
                        onClick={() =>
                          void changeStatus(payment, "aprobado").catch(() => {})
                        }
                        disabled={busy}
                        className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-xs font-semibold text-carbon transition-colors hover:border-carbon disabled:opacity-60"
                      >
                        Confirmar pago
                      </button>
                    ) : null}
                    {payment.status === "aprobado" ? (
                      <button
                        type="button"
                        onClick={() =>
                          void changeStatus(payment, "reembolsado").catch(
                            () => {},
                          )
                        }
                        disabled={busy}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-terracotta/40 bg-terracotta/5 px-3 text-xs font-semibold text-terracotta-deep transition-colors hover:bg-terracotta/10 disabled:opacity-60"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Reembolsar
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canRegister ? (
        <button
          type="button"
          onClick={() => void register().catch(() => {})}
          disabled={busy}
          className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep disabled:opacity-60"
        >
          {busy ? "Guardando…" : "Registrar pago aprobado"}
        </button>
      ) : null}

      {!canRefund && payments.some((payment) => payment.status === "aprobado") ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Para confirmar o reembolsar un pago necesitas el permiso de
          reembolsos.
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {notice}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-sm text-terracotta-deep"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <StepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        actionLabel="Reembolsar o confirmar un pago"
        onVerified={retry}
      />
    </section>
  );
}
