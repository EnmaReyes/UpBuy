"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Loader2, RotateCw } from "lucide-react";
import { ApiError } from "@/services/api/client";
import {
  retryMastershopOrder,
  type MastershopRetryResult,
} from "@/services/admin/mastershop.actions";

// Boton de reintento de un pedido de MasterShop. No exige step-up: el backend
// decide si corresponde recrear el pedido o empujar la cancelacion.

const messageFor = (error: unknown): string =>
  error instanceof ApiError
    ? error.message
    : "No se pudo completar el reintento.";

const successMessage = (result: MastershopRetryResult): string => {
  if (result.ok === false) {
    return result.reason || "El proveedor no aceptó el reintento.";
  }
  if (result.action === "cancel") {
    return "Cancelación confirmada en MasterShop.";
  }
  if (result.action === "create") {
    return "Pedido creado en MasterShop.";
  }
  return result.reason || "No había nada que reintentar.";
};

export function MastershopRetryButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const retry = async () => {
    setBusy(true);
    setMessage(null);
    setFailed(false);
    try {
      const result = await retryMastershopOrder(id);
      const ok = result.ok !== false;
      setFailed(!ok);
      setMessage(successMessage(result));
      router.refresh();
    } catch (caught) {
      setFailed(true);
      setMessage(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={retry}
        disabled={busy}
        className="inline-flex h-8 items-center gap-1 rounded-lg bg-carbon px-2.5 text-xs font-semibold text-cream hover:bg-terracotta-deep disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {busy ? "Reintentando..." : "Reintentar"}
      </button>
      {message ? (
        <p
          role={failed ? "alert" : "status"}
          className={
            failed
              ? "flex max-w-[16rem] items-start gap-1 text-right text-[11px] text-terracotta-deep"
              : "max-w-[16rem] text-right text-[11px] text-emerald-800"
          }
        >
          {failed ? (
            <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          ) : null}
          {message}
        </p>
      ) : null}
    </div>
  );
}