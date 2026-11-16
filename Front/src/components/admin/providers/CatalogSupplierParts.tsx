import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CatalogSupplierActions } from "@/components/admin/providers/CatalogSupplierActions";
import { StatusBadge } from "@/components/admin/providers/ProviderCards";
import { formatDateTime } from "@/lib/format";
import { ApiError } from "@/services/api/client";
import type { CatalogSupplierSlug } from "@/services/admin/providers";
import { statusLabel } from "@/components/admin/providers/ProviderCards";
import type { AdminCatalogSupplierStatus } from "@/types/admin";

// Piezas compartidas del panel de un proveedor de catálogo. Venndelo Pro y
// MasterShop comparten estado, acciones, métricas y pestañas; lo único propio
// de Venndelo son los pedidos y la wallet.

export function CatalogSupplierHeader({
  slug,
  name,
  description,
  status,
  envHint,
}: {
  slug: CatalogSupplierSlug;
  name: string;
  description: string;
  status: AdminCatalogSupplierStatus;
  envHint: string;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <nav aria-label="Ruta" className="text-xs text-muted-foreground">
          <Link href="/admin/proveedores" className="hover:underline">
            Proveedores
          </Link>{" "}
          / {name}
        </nav>
        <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight text-carbon">
          {name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <StatusBadge
          configured={status.configured}
          label={status.configured ? "Conectado por API" : "Sin credenciales"}
        />
        <CatalogSupplierActions
          slug={slug}
          providerName={name}
          configured={status.configured}
          envHint={envHint}
          size="compact"
        />
      </div>
    </header>
  );
}

export function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold tracking-[0.1em] text-coffee-deep uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-carbon [font-variant-numeric:tabular-nums]">
        {value}
      </dd>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function CatalogSupplierMetrics({
  status,
  name,
  credential,
}: {
  status: AdminCatalogSupplierStatus;
  name: string;
  /** Cuarta métrica: token (Venndelo) o llave API (MasterShop). */
  credential: { label: string; value: React.ReactNode; hint?: string };
}) {
  return (
    <dl className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
      <Metric
        label="Productos importados"
        value={status.catalog.supplierProducts}
      />
      <Metric label="Publicados" value={status.catalog.publishedProducts} />
      <Metric
        label={credential.label}
        value={credential.value}
        hint={credential.hint}
      />
      <Metric
        label="Última corrida"
        value={status.lastRun ? statusLabel(status.lastRun.status) : "—"}
        hint={
          status.lastRun?.startedAt
            ? formatDateTime(status.lastRun.startedAt)
            : undefined
        }
      />
      {status.supplier.publishPolicy === "auto_visible" ||
      status.supplier.publishPolicy === "auto_draft" ? (
        <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
          Política de publicación de {name}:{" "}
          {status.supplier.publishPolicy === "auto_visible"
            ? "automática y visible"
            : "automática en borrador"}
          .
        </p>
      ) : null}
    </dl>
  );
}

export function SupplierTabs({
  slug,
  tabs,
  active,
}: {
  slug: CatalogSupplierSlug;
  tabs: { id: string; label: string; icon: LucideIcon }[];
  active: string;
}) {
  return (
    <nav aria-label="Secciones del proveedor">
      <ul className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((entry) => {
          const Icon = entry.icon;
          const isActive = entry.id === active;
          const params = new URLSearchParams({ tab: entry.id });
          return (
            <li key={entry.id}>
              <Link
                href={`/admin/proveedores/${slug}?${params.toString()}`}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "inline-flex h-10 items-center gap-1.5 border-b-2 border-terracotta px-3 text-sm font-semibold text-carbon"
                    : "inline-flex h-10 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground hover:text-carbon"
                }
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {entry.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function TabError({ error, title }: { error: unknown; title: string }) {
  const message =
    error instanceof ApiError
      ? error.message
      : "El proveedor no respondió. Revisa la conexión e inténtalo de nuevo.";

  return (
    <div
      role="alert"
      className="rounded-xl border border-terracotta/30 bg-terracotta/5 p-6"
    >
      <h2 className="font-heading text-lg font-semibold text-carbon">{title}</h2>
      <p className="mt-1 text-sm text-coffee-deep">{message}</p>
      <p className="mt-2 text-xs text-coffee-deep">
        Prueba la conexión o vuelve a cargar la página. Un error de credenciales
        se corrige en las variables del backend.
      </p>
    </div>
  );
}

export function SupplierPageError({
  error,
  name,
}: {
  error: unknown;
  name: string;
}) {
  const message =
    error instanceof ApiError
      ? error.message
      : `No se pudo cargar el estado de ${name}.`;

  return (
    <div
      role="alert"
      className="rounded-xl border border-terracotta/30 bg-terracotta/5 p-6"
    >
      <h1 className="font-heading text-lg font-semibold text-carbon">
        No pudimos cargar {name}
      </h1>
      <p className="mt-1 text-sm text-coffee-deep">{message}</p>
      <Link
        href="/admin/proveedores"
        className="mt-4 inline-flex h-10 items-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream hover:bg-terracotta-deep"
      >
        Volver a proveedores
      </Link>
    </div>
  );
}
