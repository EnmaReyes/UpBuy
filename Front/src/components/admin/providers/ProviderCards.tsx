import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleSlash,
  Database,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import type {
  AdminCatalogProviderHealth,
  AdminOrderProviderHealth,
} from "@/types/admin";
import { ADMIN_CATALOG_RUN_STATUS_LABELS } from "@/types/admin";

// Tarjetas de salud del panel de proveedores (ADM-4). Presentacionales: no
// hacen fetch ni mutan nada. Los botones viven en componentes cliente aparte.

export function StatusBadge({
  configured,
  label,
}: {
  configured: boolean;
  label?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        configured
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      {configured ? (
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      ) : (
        <CircleSlash className="h-3 w-3" aria-hidden="true" />
      )}
      {label ?? (configured ? "Conectado" : "Modo manual")}
    </span>
  );
}

function CardShell({
  title,
  subtitle,
  icon: Icon,
  href,
  children,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-coffee-deep">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-heading text-base font-semibold text-carbon">
              {title}
            </h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {href ? (
          <Link
            href={href}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Abrir
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">{children}</div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold tracking-[0.1em] text-coffee-deep uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-carbon [font-variant-numeric:tabular-nums]">
        {value}
      </dd>
    </div>
  );
}

export function OrderProviderCard({
  provider,
}: {
  provider: AdminOrderProviderHealth;
}) {
  return (
    <CardShell
      title={provider.label}
      subtitle="Pedidos y estados de cumplimiento"
      icon={Truck}
      href={`/admin/proveedores/pedidos?provider=${provider.name}`}
    >
      <StatusBadge
        configured={provider.configured}
        label={
          provider.configured
            ? `Conectado · modo ${provider.mode}`
            : "Sin credenciales · modo manual"
        }
      />

      <dl className="grid grid-cols-2 gap-3">
        <Metric label="Pedidos" value={provider.totalOrders} />
        <Metric
          label="Desincronizados"
          value={
            <span
              className={
                provider.outOfSyncOrders > 0
                  ? "text-rose-800"
                  : "text-carbon"
              }
            >
              {provider.outOfSyncOrders}
            </span>
          }
        />
        <Metric
          label="Última sincronización"
          value={
            provider.lastActivityAt
              ? formatDateTime(provider.lastActivityAt)
              : "Sin actividad"
          }
        />
        <Metric
          label="Último resultado"
          value={
            provider.lastSyncOk === null
              ? "—"
              : provider.lastSyncOk
                ? "Correcto"
                : "Falló"
          }
        />
      </dl>

      {provider.lastSyncOk === false && provider.lastSyncError ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs leading-relaxed text-rose-900">
          <span className="font-semibold">Último error: </span>
          {provider.lastSyncError}
        </p>
      ) : null}

      {!provider.configured ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900">
          Este proveedor opera en modo manual: los pedidos se sincronizan con
          los botones de la lista o desde su panel externo.
        </p>
      ) : null}
    </CardShell>
  );
}

export function CatalogProviderCard({
  provider,
  href,
}: {
  provider: AdminCatalogProviderHealth;
  href?: string;
}) {
  return (
    <CardShell
      title={provider.label}
      subtitle="Catálogo y publicación de productos"
      icon={Database}
      href={href}
    >
      <StatusBadge
        configured={provider.configured}
        label={provider.configured ? "Conectado por API" : "Sin credenciales"}
      />

      <dl className="grid grid-cols-2 gap-3">
        <Metric
          label="Productos importados"
          value={provider.supplierProducts}
        />
        <Metric label="Publicados" value={provider.publishedProducts} />
        <Metric
          label="Última actividad"
          value={
            provider.lastActivityAt
              ? formatDateTime(provider.lastActivityAt)
              : "Sin actividad"
          }
        />
        <Metric
          label="Última corrida"
          value={provider.lastRun ? statusLabel(provider.lastRun.status) : "—"}
        />
      </dl>

      {provider.lastRun?.errors ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900">
          La última sincronización terminó con {provider.lastRun.errors} error(es).
          Revisa el historial antes de volver a publicar.
        </p>
      ) : null}
    </CardShell>
  );
}

export function OutOfSyncCard({ count }: { count: number }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between",
        count > 0
          ? "border-rose-200 bg-rose-50"
          : "border-border bg-card",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            count > 0
              ? "bg-rose-100 text-rose-800"
              : "bg-muted text-coffee-deep",
          )}
        >
          {count > 0 ? (
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          )}
        </span>
        <div>
          <h2 className="font-heading text-base font-semibold text-carbon">
            {count > 0
              ? `${count} pedido(s) desincronizado(s)`
              : "Ningún pedido desincronizado"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {count > 0
              ? "UpBuy y el proveedor no coinciden. Revisa cada pedido y reintenta la sincronización."
              : "Los pedidos con proveedor están alineados con su estado canónico."}
          </p>
        </div>
      </div>

      {count > 0 ? (
        <Link
          href="/admin/proveedores/pedidos?outOfSync=1"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Ver desincronizados
        </Link>
      ) : null}
    </div>
  );
}

export function ProvidersNamingNote() {
  return (
    <aside className="rounded-xl border border-coffee/25 bg-coffee/5 p-4 text-sm leading-relaxed text-coffee-deep">
      <p className="font-semibold text-carbon">
        VENNDELO (doble N) no es VENDELO (una N)
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <strong>Venndelo Pro</strong> (<code>VENNDELO_*</code>): proveedor de
          catálogo. Importa productos, stock y precios.
        </li>
        <li>
          <strong>Vendelo</strong> (<code>VENDELO_*</code>): proveedor de
          pedidos. Recibe y actualiza el cumplimiento.
        </li>
        <li>
          <strong>Dropi</strong>: proveedor de pedidos con modo manual y API.
        </li>
      </ul>
      <p className="mt-2">
        Son integraciones distintas: configurar una no configura la otra.
      </p>
    </aside>
  );
}

export function statusLabel(status: string): string {
  return ADMIN_CATALOG_RUN_STATUS_LABELS[status] ?? status;
}
