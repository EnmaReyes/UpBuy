import { Compass, Layers, Sparkles, Footprints } from "lucide-react";
import { Reveal } from "@/components/shared/Reveal";

const PILLARS = [
  {
    number: "01",
    title: "Movimiento",
    description: "Prendas que acompañan tu ritmo, del primer café al último metro.",
    icon: Footprints,
  },
  {
    number: "02",
    title: "Carácter",
    description: "Siluetas que se distinguen sin volverse invasivas.",
    icon: Compass,
  },
  {
    number: "03",
    title: "Duración",
    description: "Materiales y acabados elegidos para resistir lavados y uso real.",
    icon: Layers,
  },
  {
    number: "04",
    title: "Identidad",
    description: "Cada pieza refleja quién eres y cómo te mueves.",
    icon: Sparkles,
  },
];

// Nuestra propuesta: cuatro pilares de marca con iconografía discreta.
export function BrandPillars() {
  return (
    <section className="section-y bg-muted">
      <div className="container-page">
        <Reveal>
          <p className="text-sm font-semibold tracking-[0.25em] text-terracotta uppercase">
            Nuestra propuesta
          </p>
          <h2 className="mt-3 max-w-2xl font-heading text-[clamp(1.75rem,3.5vw,3rem)] leading-tight font-bold tracking-tight text-carbon">
            Diseño pensado. Rendimiento diario.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((pillar, index) => {
            const Icon = pillar.icon;
            return (
              <Reveal key={pillar.number} delay={index * 0.07}>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-terracotta">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="font-heading text-sm font-bold tracking-[0.2em] text-coffee-deep">
                      {pillar.number}
                    </span>
                  </div>
                  <h3 className="font-heading text-xl font-semibold text-carbon">{pillar.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{pillar.description}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
