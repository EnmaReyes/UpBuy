import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, PackageSearch, Truck } from "lucide-react";
import { getPublicTracking } from "@/services/orders/tracking";
import { ApiError } from "@/services/api/client";
import { TrackingTimeline } from "@/components/orders/TrackingTimeline";
import { safeHttpUrl } from "@/lib/safe-url";
import { FULFILLMENT_LABELS } from "@/types/order";
import type { PublicTracking } from "@/types/tracking";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Seguimiento del pedido — UPBUY",
  // La URL lleva datos de contacto en la query: nunca indexar.
  robots: { index: false, follow: false },
};

type TrackingPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ telefono?: string; correo?: string }>;
};

const inputClass =
  "mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-carbon outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-carbon";

export default async function TrackingPage({
  params,
  searchParams,
}: TrackingPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const phone = (query.telefono ?? "").trim();
  const email = (query.correo ?? "").trim();
  const asked = Boolean(phone || email);

  let tracking: PublicTracking | null = null;
  let error: string | null = null;

  if (asked) {
    try {
      tracking = await getPublicTracking(id, {
        phone: phone || undefined,
        email: email || undefined,
      });
    } catch (caught) {
      if (caught instanceof ApiError && caught.isNotFound) {
        error =
          "No encontramos un pedido con ese enlace y esos datos. Revisa el teléfono o el correo con el que compraste.";
      } else {
        error =
          "No pudimos consultar el pedido en este momento. Inténtalo de nuevo en unos segundos.";
      }
    }
  }

  const trackingUrl = tracking ? safeHttpUrl(tracking.tracking.url) : null;
  const fulfillmentLabel = tracking
    ? (FULFILLMENT_LABELS[tracking.fulfillmentStatus] ??
      tracking.fulfillmentLabel)
    : null;
  const paymentLabel =
    tracking && tracking.fulfillmentStatus !== "cancelled"
      ? tracking.paymentLabel
      : null;

  return (
    <div className="bg-background">
      <section className="bg-carbon pt-28 pb-14 text-cream sm:pt-32">
        <div className="container-page">
          <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.25em] text-terracotta uppercase">
            <Truck className="h-4 w-4" aria-hidden="true" />
            Seguimiento
          </p>
          <h1 className="mt-4 font-heading text-[clamp(2rem,4.5vw,3.5rem)] leading-tight font-bold tracking-tight">
            ¿Dónde va tu pedido?
          </h1>
          <p className="mt-3 max-w-xl text-sm text-cream/70">
            Consulta el estado y la guía con el teléfono o el correo que usaste
            al comprar.
          </p>
        </div>
      </section>

      <section className="section-y">
        <div className="container-page grid gap-8 lg:grid-cols-12 lg:gap-12">
          <div className="min-w-0 lg:col-span-5">
            <form
              method="get"
              className="rounded-xl border border-border bg-card p-6"
            >
              <h2 className="font-heading text-lg font-semibold text-carbon">
                Consulta tu pedido
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Basta con uno de los dos datos. Deben coincidir con el pedido.
              </p>

              <div className="mt-4 grid gap-4">
                <label className="block text-sm font-medium text-carbon">
                  Teléfono
                  <input
                    type="tel"
                    name="telefono"
                    defaultValue={phone}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="300 000 0000"
                    className={inputClass}
                  />
                </label>

                <label className="block text-sm font-medium text-carbon">
                  Correo electrónico
                  <input
                    type="email"
                    name="correo"
                    defaultValue={email}
                    autoComplete="email"
                    placeholder="tu@correo.com"
                    className={inputClass}
                  />
                </label>
              </div>

              <button
                type="submit"
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-carbon px-5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
              >
                <PackageSearch className="h-4 w-4" aria-hidden="true" />
                Consultar estado
              </button>

              {error ? (
                <p
                  role="alert"
                  className="mt-4 rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-xs leading-relaxed text-terracotta-deep"
                >
                  {error}
                </p>
              ) : null}
            </form>
          </div>

          <div className="min-w-0 lg:col-span-7">
            {tracking ? (
              <div className="grid gap-6">
                <div className="rounded-xl border border-border bg-card p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                        Pedido
                      </p>
                      <p className="font-heading text-xl font-bold text-carbon">
                        {tracking.orderNumber}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {fulfillmentLabel ? (
                        <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold text-carbon">
                          {fulfillmentLabel}
                        </span>
                      ) : null}
                      {paymentLabel ? (
                        <span className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-muted-foreground">
                          {paymentLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {tracking.message ? (
                    <p className="mt-4 rounded-lg border border-coffee/25 bg-coffee/5 p-3 text-sm leading-relaxed text-coffee-deep">
                      {tracking.message}
                    </p>
                  ) : null}

                  <div className="mt-6">
                    <h2 className="font-heading text-sm font-semibold text-carbon">
                      Recorrido
                    </h2>
                    <div className="mt-3">
                      <TrackingTimeline
                        fulfillmentStatus={tracking.fulfillmentStatus}
                        dates={tracking.dates}
                      />
                    </div>
                  </div>

                  {tracking.estimatedDeliveryDays ? (
                    <p className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-sm text-coffee-deep">
                      <Truck className="h-4 w-4 shrink-0" aria-hidden="true" />
                      Entrega estimada en {tracking.estimatedDeliveryDays} días
                      hábiles.
                    </p>
                  ) : null}
                </div>

                {tracking.tracking.number ? (
                  <div className="rounded-xl border border-border bg-card p-6">
                    <h2 className="font-heading text-lg font-semibold text-carbon">
                      Guía de envío
                    </h2>
                    <dl className="mt-3 grid gap-2 text-sm">
                      {tracking.tracking.carrier ? (
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">
                            Transportadora
                          </dt>
                          <dd className="font-semibold text-carbon">
                            {tracking.tracking.carrier}
                          </dd>
                        </div>
                      ) : null}
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Número</dt>
                        <dd className="break-all text-right font-semibold text-carbon">
                          {tracking.tracking.number}
                        </dd>
                      </div>
                    </dl>

                    {trackingUrl ? (
                      <a
                        href={trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-carbon px-5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
                      >
                        Rastrear en el courier
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-full flex-col items-start justify-center rounded-xl border border-dashed border-border bg-card/60 p-8">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-coffee-deep">
                  <PackageSearch className="h-6 w-6" aria-hidden="true" />
                </span>
                <h2 className="mt-4 font-heading text-lg font-semibold text-carbon">
                  Tu estado aparecerá aquí
                </h2>
                <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Por seguridad solo mostramos el pedido cuando el teléfono o el
                  correo coinciden con el de la compra.
                </p>
                <Link
                  href="/productos"
                  className="mt-5 inline-flex h-11 items-center justify-center rounded-lg border border-border px-5 text-sm font-semibold text-carbon transition-colors hover:border-carbon"
                >
                  Volver a la tienda
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
