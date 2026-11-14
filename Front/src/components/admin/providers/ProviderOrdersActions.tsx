"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert,
  Download,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";
import { ApiError, type Query } from "@/services/api/client";
import { downloadProviderOrdersCsv } from "@/services/admin/providers.actions";
import { pushAdminOrder, syncAdminOrder } from "@/services/admin/orders.actions";

// Acciones de la lista de pedidos por proveedor (ADM-4): reintentar la
// sincronización, empujar al proveedor y exportar CSV para su panel.

const messageFor = (error: unknown): string =>
  error instanceof ApiError
    ? error.message
    : "No se pudo completar la acción.";

export function ProviderOrdersExport({ query }: { query: Query }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadProviderOrdersCsv(query);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        {busy ? "Exportando…" : "Exportar CSV"}
      </button>
      {error ? (
        <p role="alert" className="flex items-start gap-1 text-[11px] text-terracotta-deep">
          <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ProviderOrderActions({
  id,
  providerOrderId,
  provider,
}: {
  id: string;
  providerOrderId: string | null;
  provider: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"sync" | "push" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!provider) {
    return <span className="text-xs text-muted-foreground">Sin proveedor</span>;
  }

  const sync = async () => {
    setBusy("sync");
    setMessage(null);
    setError(null);
    try {
      const result = await syncAdminOrder(id);
      if (result.skipped) {
        setMessage("Sincronización omitida por un cambio manual.");
      } else if (result.ok === false) {
        setMessage(result.error || "El proveedor no respondió.");
      } else {
        setMessage("Estado leído del proveedor.");
      }
      router.refresh();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(null);
    }
  };

  const push = async () => {
    setBusy("push");
    setMessage(null);
    setError(null);
    try {
      const result = await pushAdminOrder(id);
      setMessage(
        result.pushed
          ? "Pedido enviado al proveedor."
          : result.reason || "No se pudo enviar al proveedor.",
      );
      router.refresh();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        <button
          type="button"
          onClick={sync}
          disabled={busy !== null}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-carbon hover:border-carbon disabled:opacity-50"
        >
          {busy === "sync" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Sincronizar
        </button>
        <button
          type="button"
          onClick={push}
          disabled={busy !== null || Boolean(providerOrderId)}
          title={providerOrderId ? "El pedido ya existe en el proveedor" : undefined}
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-carbon px-2.5 text-xs font-semibold text-cream hover:bg-terracotta-deep disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "push" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Enviar
        </button>
      </div>
      {message ? (
        <p role="status" className="max-w-[16rem] text-right text-[11px] text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="max-w-[16rem] text-right text-[11px] text-terracotta-deep">
          {error}
        </p>
      ) : null}
    </div>
  );
}
