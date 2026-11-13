"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

// Frontera de error del panel. No muestra detalles internos: el backend ya
// evita filtrar mensajes de Sequelize y aquí se ofrece reintentar.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // El digest identifica el error en los logs del servidor.
    console.error("Error en el panel administrativo", error.digest ?? "");
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-terracotta/30 bg-terracotta/5 px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-terracotta/10 text-terracotta-deep">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </span>
      <h1 className="font-heading text-xl font-semibold text-carbon">
        Algo falló al cargar el panel
      </h1>
      <p className="max-w-md text-sm text-coffee-deep">
        Vuelve a intentarlo. Si el problema continúa, revisa el estado de la API
        y de la base de datos.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
        >
          Reintentar
        </button>
        <Link
          href="/admin"
          className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon"
        >
          Ir al dashboard
        </Link>
      </div>
    </div>
  );
}
