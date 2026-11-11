import Link from "next/link";
import { PackageX, ServerCrash } from "lucide-react";

// Estado de error del catálogo: la API no respondió (red o 5xx).
// No se disfraza de catálogo vacío: es un problema distinto y se dice.
export function CatalogUnavailable({ detail }: { detail?: string }) {
  return (
    <div
      role="alert"
      className="mt-12 flex flex-col items-center gap-4 rounded-xl border border-border bg-card px-6 py-14 text-center"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-terracotta/10 text-terracotta-deep">
        <ServerCrash className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="font-heading text-xl font-semibold text-carbon">
        No pudimos cargar el catálogo
      </p>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        El servidor de productos no está disponible en este momento. Vuelve a
        intentarlo en unos segundos.
      </p>
      {detail ? (
        <p className="text-xs text-muted-foreground/70">{detail}</p>
      ) : null}
      <Link
        href="/productos"
        className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-carbon px-6 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
      >
        Reintentar
      </Link>
    </div>
  );
}

// Catálogo vacío por filtros o porque todavía no hay productos publicados.
export function CatalogEmpty({
  title,
  description,
  actionLabel = "Ver toda la colección",
  actionHref = "/productos",
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="mt-16 flex flex-col items-center gap-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-coffee-deep">
        <PackageX className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="font-heading text-xl font-semibold text-carbon">{title}</p>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <Link
        href={actionHref}
        className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-carbon px-6 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
      >
        {actionLabel}
      </Link>
    </div>
  );
}