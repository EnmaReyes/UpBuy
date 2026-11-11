import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/shared/Reveal";

// Banner de marca: sección amplia con fotografía y texto comercial.
// La imagen es un marcador preparado para la fotografía real.
export function BrandBanner() {
  return (
    <section className="bg-background">
      <div className="container-page section-y">
        <Reveal>
          <div className="relative isolate overflow-hidden rounded-2xl bg-carbon text-cream">
            <div
              aria-hidden="true"
              className="absolute inset-0 -z-10 bg-[radial-gradient(90%_120%_at_15%_20%,rgba(211,84,0,0.35)_0%,rgba(11,11,11,0)_55%)]"
            />

            <div className="grid gap-0 lg:grid-cols-2">
              <div className="flex flex-col justify-center gap-5 px-6 py-14 sm:px-10 lg:px-14 lg:py-20">
                <p className="text-sm font-semibold tracking-[0.25em] text-terracotta uppercase">
                  De nuestro mundo al tuyo
                </p>
                <h2 className="font-heading text-[clamp(1.75rem,3.5vw,3rem)] leading-tight font-bold tracking-tight">
                  La buena ropa se adapta a tus pasos.
                </h2>
                <p className="max-w-lg text-base leading-relaxed text-cream/75">
                  Diseñamos prendas que acompañan el movimiento real: la calle, el trabajo,
                  el entrenamiento y el descanso. Sin complicaciones, con carácter.
                </p>
                <Link
                  href="/nosotros"
                  className="mt-2 inline-flex h-12 w-fit items-center justify-center gap-2 rounded-full border border-cream/30 px-7 text-sm font-semibold transition-colors hover:border-cream hover:bg-cream/10 focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-carbon"
                >
                  Conoce la marca
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>

              <div className="relative min-h-[280px] bg-[linear-gradient(140deg,#2A2A2A_0%,#3A2A20_60%,#D35400_140%)] lg:min-h-full">
                <div className="absolute inset-0 flex items-end p-6 sm:p-8">
                  <span className="text-xs font-medium tracking-[0.2em] text-cream/50 uppercase">
                    Fotografía de marca
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-px border-t border-cream/10 bg-cream/10 sm:grid-cols-3">
              {SHIPPING_STATS.map((stat) => (
                <div key={stat.value} className="bg-carbon px-6 py-7 sm:px-8">
                  <p className="font-heading text-2xl font-bold tracking-tight text-cream [font-variant-numeric:tabular-nums]">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed tracking-wide text-cream/60 uppercase">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const SHIPPING_STATS = [
  { value: "$150.000+", label: "Envío gratis desde este monto" },
  { value: "2–5 días", label: "Entrega estándar en Colombia" },
  { value: "30 días", label: "Cambios y devoluciones" },
];
