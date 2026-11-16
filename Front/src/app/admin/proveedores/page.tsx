import type { Metadata } from "next";
import Link from "next/link";
import { Activity } from "lucide-react";
import { getProvidersOverview } from "@/services/admin/providers";
import { ApiError } from "@/services/api/client";
import { formatDateTime } from "@/lib/format";
import UptimeCard from "@/components/kokonutui/uptime-card";
import {
  CatalogProviderCard,
  OrderProviderCard,
  OutOfSyncCard,
  ProvidersNamingNote,
} from "@/components/admin/providers/ProviderCards";
import { CatalogSupplierActions } from "@/components/admin/providers/CatalogSupplierActions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Proveedores — Panel UPBUY",
  robots: { index: false, follow: false },
};

export default async function AdminProvidersPage() {
  let overview;
  try {
    overview = await getProvidersOverview();
  } catch (error) {
    return <ProvidersError error={error} />;
  }

  const venndelo = overview.catalogProviders.find(
    (provider) => provider.slug === "venndelo",
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-carbon">
            Proveedores
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Estado de las integraciones, pedidos desincronizados y acciones
            operativas. Actualizado {formatDateTime(overview.generatedAt)}.
          </p>
        </div>
        {venndelo ? (
          <CatalogSupplierActions
            slug="venndelo"
            providerName="Venndelo Pro"
            configured={venndelo.configured}
            envHint="VENNDELO_CLIENT_ID, VENNDELO_CLIENT_SECRET y VENNDELO_REFRESH_TOKEN"
          />
        ) : null}
      </header>

      <ProvidersNamingNote />

      <OutOfSyncCard count={overview.outOfSync} />

      <section aria-labelledby="order-providers-title" className="flex flex-col gap-3">
        <div>
          <h2
            id="order-providers-title"
            className="font-heading text-lg font-semibold text-carbon"
          >
            Proveedores de pedidos
          </h2>
          <p className="text-sm text-muted-foreground">
            Reciben y actualizan el cumplimiento. Un fallo deja el pedido
            marcado como desincronizado y se puede reintentar.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {overview.orderProviders.map((provider) => (
            <OrderProviderCard key={provider.name} provider={provider} />
          ))}
        </div>
      </section>

      <section aria-labelledby="catalog-providers-title" className="flex flex-col gap-3">
        <div>
          <h2
            id="catalog-providers-title"
            className="font-heading text-lg font-semibold text-carbon"
          >
            Proveedores de catálogo
          </h2>
          <p className="text-sm text-muted-foreground">
            Importan productos, stock y precios. Publicar es una decisión de
            UpBuy: el precio de venta nunca se pisa.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {overview.catalogProviders.map((provider) => (
            <CatalogProviderCard
              key={provider.id}
              provider={provider}
              href={
                provider.slug === "venndelo" || provider.slug === "mastershop"
                  ? `/admin/proveedores/${provider.slug}`
                  : undefined
              }
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="health-title" className="flex flex-col gap-3">
        <div>
          <h2
            id="health-title"
            className="flex items-center gap-1.5 font-heading text-lg font-semibold text-carbon"
          >
            <Activity className="h-4 w-4" aria-hidden="true" />
            Salud de sincronización
          </h2>
          <p className="text-sm text-muted-foreground">
            Últimos {overview.health.days} días de intentos. Un día con fallos
            aparece degradado o caído; pasa el cursor o usa las flechas para ver
            el detalle.
          </p>
        </div>

        {overview.health.services.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Todavía no hay actividad de sincronización registrada.
          </p>
        ) : (
          <UptimeCard
            title="Intentos de sincronización"
            services={overview.health.services}
            days={overview.health.days}
            endDate={overview.health.endDate}
            className="max-w-none border-border bg-card text-carbon"
          />
        )}
      </section>
    </div>
  );
}

function ProvidersError({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError
      ? error.message
      : "No se pudo cargar el estado de los proveedores.";

  return (
    <div
      role="alert"
      className="rounded-xl border border-terracotta/30 bg-terracotta/5 p-6"
    >
      <h1 className="font-heading text-lg font-semibold text-carbon">
        No pudimos cargar los proveedores
      </h1>
      <p className="mt-1 text-sm text-coffee-deep">{message}</p>
      <p className="mt-2 text-xs text-coffee-deep">
        Si el panel carga pero esta sección falla, revisa que el backend tenga
        aplicado el esquema de proveedores.
      </p>
      <Link
        href="/admin/proveedores"
        className="mt-4 inline-flex h-10 items-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream hover:bg-terracotta-deep"
      >
        Reintentar
      </Link>
    </div>
  );
}
