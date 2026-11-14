"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Loader2, PlugZap, RefreshCw } from "lucide-react";
import { ApiError } from "@/services/api/client";
import {
  syncVenndeloCatalog,
  testVenndeloConnection,
} from "@/services/admin/providers.actions";

// Acciones de conexión de Venndelo Pro (ADM-4). Un fallo se muestra con el
// mensaje real del backend y una pista accionable, nunca con una pantalla rota.

const errorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.status === 503) {
      return `${error.message}. Configura VENNDELO_CLIENT_ID, VENNDELO_CLIENT_SECRET y VENNDELO_REFRESH_TOKEN en el backend.`;
    }
    return error.message;
  }
  return "No se pudo completar la acción. Revisa la conexión con la API.";
};

export function VenndeloActions({
  configured,
  size = "default",
}: {
  configured: boolean;
  size?: "default" | "compact";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"test" | "sync" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: "test" | "sync") => {
    setBusy(kind);
    setMessage(null);
    setError(null);
    try {
      if (kind === "test") {
        const result = await testVenndeloConnection();
        setMessage(
          `${result.message} · ${result.latencyMs} ms · token válido hasta ${result.tokenExpiresAt ? new Date(result.tokenExpiresAt).toLocaleString("es-CO") : "sin fecha"}.`,
        );
      } else {
        const result = await syncVenndeloCatalog();
        setMessage(
          `Sincronización iniciada. Recibidos: ${result.received ?? 0} · creados: ${result.created ?? 0} · actualizados: ${result.updated ?? 0}.`,
        );
        router.refresh();
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const compact = size === "compact";
  const button =
    "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";
  const sizeClass = compact ? "h-9 px-3 text-xs" : "h-10 px-4";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run("test")}
          disabled={busy !== null || !configured}
          className={`${button} ${sizeClass} border border-border bg-background text-carbon hover:border-carbon`}
        >
          {busy === "test" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <PlugZap className="h-4 w-4" aria-hidden="true" />
          )}
          {busy === "test" ? "Probando…" : "Probar conexión"}
        </button>

        <button
          type="button"
          onClick={() => run("sync")}
          disabled={busy !== null || !configured}
          className={`${button} ${sizeClass} bg-carbon text-cream hover:bg-terracotta-deep`}
        >
          {busy === "sync" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          {busy === "sync" ? "Sincronizando…" : "Sincronizar catálogo"}
        </button>
      </div>

      {!configured ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900">
          Venndelo Pro no tiene credenciales. Las acciones de API están
          deshabilitadas hasta configurarlas; el catálogo ya importado sigue
          visible.
        </p>
      ) : null}

      {message ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs leading-relaxed text-emerald-900"
        >
          {message}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-terracotta/30 bg-terracotta/5 p-2.5 text-xs leading-relaxed text-terracotta-deep"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
