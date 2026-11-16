"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Loader2, PlugZap, RefreshCw } from "lucide-react";
import { ApiError } from "@/services/api/client";
import type { CatalogSupplierSlug } from "@/services/admin/providers";
import {
  syncCatalogSupplier,
  testCatalogSupplierConnection,
} from "@/services/admin/providers.actions";

// Acciones de conexión de un proveedor de catálogo (ADM-4). Sirve para
// Venndelo y MasterShop: solo cambian los textos y las variables de entorno
// que se sugieren cuando falta configuración.

const buildTestMessage = (
  result: Awaited<ReturnType<typeof testCatalogSupplierConnection>>,
): string => {
  const parts = [result.message, `${result.latencyMs} ms`];
  if (result.totalProducts !== undefined) {
    parts.push(`${result.totalProducts} producto(s) visibles para la llave`);
  }
  if (result.tokenExpiresAt) {
    parts.push(
      `token válido hasta ${new Date(result.tokenExpiresAt).toLocaleString("es-CO")}`,
    );
  }
  return parts.join(" · ");
};

export function CatalogSupplierActions({
  slug,
  providerName,
  configured,
  envHint,
  size = "default",
}: {
  slug: CatalogSupplierSlug;
  providerName: string;
  configured: boolean;
  /** Variables de entorno que faltan cuando el proveedor no está configurado. */
  envHint: string;
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
        setMessage(buildTestMessage(await testCatalogSupplierConnection(slug)));
      } else {
        const result = await syncCatalogSupplier(slug);
        setMessage(
          [
            "Sincronización completada.",
            `Recibidos: ${result.received ?? 0}`,
            `importados: ${result.created ?? 0}`,
            `actualizados: ${result.updated ?? 0}`,
            `publicados: ${result.publishedCreated ?? 0}`,
            `ocultados: ${result.hidden ?? 0}`,
            `omitidos: ${result.skipped ?? 0}`,
          ].join(" · "),
        );
        router.refresh();
      }
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(
          caught.status === 503
            ? `${caught.message}. Configura ${envHint} en el backend.`
            : caught.message,
        );
      } else {
        setError("No se pudo completar la acción. Revisa la conexión con la API.");
      }
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
          {providerName} no tiene credenciales. Las acciones de API están
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
