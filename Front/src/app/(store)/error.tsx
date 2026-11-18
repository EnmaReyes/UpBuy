"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";

// Frontera de error del grupo (store). Sin esto, cualquier throw en una página
// de la tienda mostraba la pantalla de error por defecto de Next (en inglés).
export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    // El digest identifica el error en los logs del servidor.
    console.error("Error en la tienda", error.digest ?? "");
  }, [error]);

  return (
    <section className="section-y pt-28 sm:pt-32">
      <div className="container-page">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-xl border border-terracotta/30 bg-terracotta/5 px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-terracotta/10 text-terracotta-deep">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="font-heading text-xl font-semibold text-carbon">
            No pudimos cargar esta página
          </h1>
          <p className="max-w-md text-sm text-coffee-deep">
            Vuelve a intentarlo. Si el problema continúa, escríbenos y lo
            revisamos.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-11 items-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
            >
              Reintentar
            </button>
            <Link
              href={pathname.startsWith("/cuenta") ? "/cuenta" : "/"}
              className="inline-flex h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon"
            >
              {pathname.startsWith("/cuenta")
                ? "Ir a mi cuenta"
                : "Volver al inicio"}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
