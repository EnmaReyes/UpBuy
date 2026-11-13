"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CircleAlert, RefreshCw, Send, Truck } from "lucide-react";
import { ApiError } from "@/services/api/client";
import {
  pushAdminOrder,
  syncAdminOrder,
  type AdminPushResult,
  type AdminSyncResult,
} from "@/services/admin/orders.actions";
import { formatDateTime } from "@/lib/format";
import {
  ADMIN_PROVIDER_LABELS,
  ADMIN_SYNC_DIRECTION_LABELS,
  type AdminOrder,
  type AdminSyncLog,
} from "@/types/admin";
import { SyncBadge } from "./OrderBadges";

// Bloque «Proveedor»: estado mapeado (nunca el crudo), última sincronización y
// botones para releer el estado o enviar el pedido. Un fallo deja el pedido
// marcado `outOfSync`, así que se explica y se puede reintentar.

const SKIPPED_REASONS: Record<string, string> = {
  sin_proveedor: "El pedido no tiene proveedor asignado.",
  manual_override: "El pedido tiene un cambio manual: la sincronización está en pausa.",
  proveedor_no_configurado: "El proveedor no tiene credenciales configuradas.",
};

function syncMessage(result: AdminSyncResult): string {
  if (result.skipped) {
    return SKIPPED_REASONS[result.skipped] ?? "La sincronización se omitió.";
  }
  if (result.ok === false) {
    return result.error || "El proveedor no respondió. Revisa el historial.";
  }
  if (result.unchanged) {
    return "Sin cambios: el pedido ya estaba al día.";
  }
  return "Estado sincronizado con el proveedor.";
}

function pushMessage(result: AdminPushResult): string {
  if (result.pushed) {
    return "Pedido enviado al proveedor.";
  }
  return result.reason
    ? `No se pudo enviar: ${result.reason}`
    : "No se pudo enviar el pedido al proveedor.";
}

export function AdminOrderProviderPanel({
  order,
  canWrite,
  syncHistory = [],
}: {
  order: AdminOrder;
  canWrite: boolean;
  syncHistory?: AdminSyncLog[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"sync" | "push" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sync = order.providerSync;

  const onSync = async () => {
    setBusy("sync");
    setError(null);
    setMessage(null);
    try {
      const result = await syncAdminOrder(order.id);
      setMessage(syncMessage(result));
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudo sincronizar el pedido.",
      );
    } finally {
      setBusy(null);
    }
  };

  const onPush = async () => {
    setBusy("push");
    setError(null);
    setMessage(null);
    try {
      const result = await pushAdminOrder(order.id);
      setMessage(pushMessage(result));
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudo enviar el pedido al proveedor.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-heading text-base font-semibold text-carbon">
          <Truck className="h-4 w-4" aria-hidden="true" />
          Proveedor
        </h2>
        <SyncBadge
          provider={sync.provider}
          outOfSync={sync.outOfSync}
          manualOverride={sync.manualOverride}
          lastSyncOk={sync.lastSyncOk}
        />
      </div>

      {!sync.provider ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Este pedido no tiene proveedor asignado. Se gestiona de forma manual.
        </p>
      ) : (
        <dl className="mt-3 grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Proveedor</dt>
            <dd className="font-medium text-carbon">
              {ADMIN_PROVIDER_LABELS[sync.provider] ?? sync.provider}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">ID en proveedor</dt>
            <dd className="max-w-[60%] truncate text-right font-mono text-xs text-carbon">
              {sync.providerOrderId || "Sin enviar"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Estado mapeado</dt>
            <dd className="text-right text-xs font-semibold text-carbon">
              {sync.fulfillmentLabel || sync.paymentLabel || "Sin estado"}
              {sync.fulfillmentLabel && sync.paymentLabel
                ? ` · ${sync.paymentLabel}`
                : ""}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Último intento</dt>
            <dd className="text-right text-xs text-carbon">
              {sync.lastSyncAt ? formatDateTime(sync.lastSyncAt) : "Nunca"}
              {sync.lastSyncOk === false ? " · falló" : ""}
            </dd>
          </div>
        </dl>
      )}

      {sync.outOfSync ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-relaxed text-rose-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            UpBuy y el proveedor están desincronizados. Revisa el historial y
            reintenta la sincronización.
          </span>
        </p>
      ) : null}

      {sync.manualOverride ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          Hay un cambio manual reciente. La sincronización automática no pisa
          ese estado; puedes forzar una lectura con «Sincronizar».
        </p>
      ) : null}

      {sync.lastSyncError ? (
        <p className="mt-3 break-words rounded-lg border border-border bg-muted/40 p-3 text-xs text-coffee-deep">
          Último error: {sync.lastSyncError}
        </p>
      ) : null}

      {syncHistory.length > 0 ? (
        <details className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-coffee-deep">
            Historial de sincronización ({syncHistory.length})
          </summary>
          <ul className="mt-2 divide-y divide-border">
            {syncHistory.map((log) => (
              <li key={log.id} className="py-2 text-xs first:pt-0 last:pb-0">
                <p className="flex items-center justify-between gap-2">
                  <span
                    className={
                      log.ok ? "font-semibold text-emerald-800" : "font-semibold text-rose-800"
                    }
                  >
                    {log.ok ? "Correcto" : "Falló"} ·{" "}
                    {ADMIN_SYNC_DIRECTION_LABELS[log.direction] ?? log.direction}
                  </span>
                  <span className="text-muted-foreground">
                    intento {log.attempt}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  {formatDateTime(log.createdAt)}
                </p>
                {log.error ? (
                  <p className="mt-0.5 break-words text-rose-800">{log.error}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {canWrite && sync.provider ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onSync}
            disabled={busy !== null}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {busy === "sync" ? "Sincronizando…" : "Sincronizar"}
          </button>
          <button
            type="button"
            onClick={onPush}
            disabled={busy !== null}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-carbon px-3 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {busy === "push" ? "Enviando…" : "Enviar al proveedor"}
          </button>
        </div>
      ) : null}

      {message ? (
        <p
          role="status"
          className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {message}
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
    </section>
  );
}
