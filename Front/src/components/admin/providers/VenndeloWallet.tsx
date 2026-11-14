"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert,
  ExternalLink,
  Loader2,
  Wallet,
} from "lucide-react";
import { ApiError } from "@/services/api/client";
import { topupVenndeloWallet } from "@/services/admin/providers.actions";
import { formatPrice } from "@/lib/format";
import type { AdminVenndeloWalletBalance } from "@/types/admin";

// Wallet de Venndelo Pro (ADM-4). La recarga es dinero real: exige monto,
// confirmación explícita y muestra el enlace de pago devuelto por el proveedor.

export function VenndeloWallet({
  balance,
}: {
  balance: AdminVenndeloWalletBalance;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const numeric = Number(amount);
  const valid = Number.isFinite(numeric) && numeric > 0;

  const topup = async () => {
    if (!valid || !confirmed) return;
    setBusy(true);
    setError(null);
    setPaymentUrl(null);
    try {
      const url = await topupVenndeloWallet(numeric);
      setPaymentUrl(url);
      setConfirmed(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudo iniciar la recarga de la wallet.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-1.5 font-heading text-base font-semibold text-carbon">
          <Wallet className="h-4 w-4" aria-hidden="true" />
          Saldo de la wallet
        </h2>
        <p className="mt-3 font-heading text-3xl font-bold text-carbon [font-variant-numeric:tabular-nums]">
          {balance.balance === null ? "No disponible" : formatPrice(balance.balance)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Saldo con el que Venndelo cobra el cumplimiento de los pedidos.
        </p>

        {balance.detail.length > 0 ? (
          <ul className="mt-4 divide-y divide-border border-t border-border">
            {balance.detail.slice(0, 12).map((item, index) => (
              <li
                key={`${item.description || "movimiento"}-${index}`}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="text-coffee-deep">
                  {String(item.description || "Movimiento")}
                </span>
                <span className="font-medium text-carbon [font-variant-numeric:tabular-nums]">
                  {Number.isFinite(Number(item.amount))
                    ? formatPrice(Number(item.amount))
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            El proveedor no reportó movimientos recientes.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-heading text-base font-semibold text-carbon">
          Recargar wallet
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Se genera un enlace de pago del proveedor. La recarga no se cobra
          automáticamente desde UpBuy.
        </p>

        <label htmlFor="topup-amount" className="mt-4 block text-xs font-semibold text-carbon">
          Monto en COP
        </label>
        <input
          id="topup-amount"
          type="number"
          min={1}
          step={1000}
          inputMode="numeric"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setPaymentUrl(null);
          }}
          placeholder="Ej. 200000"
          className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-carbon [font-variant-numeric:tabular-nums] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />

        <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-coffee-deep">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border"
          />
          Confirmo que quiero iniciar una recarga por{" "}
          <strong className="text-carbon">
            {valid ? formatPrice(numeric) : "el monto indicado"}
          </strong>{" "}
          en la wallet de Venndelo Pro.
        </label>

        <button
          type="button"
          onClick={topup}
          disabled={!valid || !confirmed || busy}
          className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          {busy ? "Generando enlace…" : "Generar enlace de recarga"}
        </button>

        {paymentUrl ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p className="font-semibold">Enlace de pago listo</p>
            <a
              href={paymentUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-flex items-center gap-1 font-semibold underline underline-offset-2"
            >
              Abrir pago de Venndelo
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <p className="mt-1 text-xs">
              El saldo se actualiza cuando el proveedor confirma el pago.
            </p>
          </div>
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
      </section>
    </div>
  );
}
