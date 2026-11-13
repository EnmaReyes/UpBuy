import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/shared/Reveal";
import type { Category } from "@/lib/mock-data";

type CategoriesProps = {
  categories: Category[];
};

// Categorías: imagen, nombre, descripción breve y CTA.
// Los enlaces filtran /productos por categoría; se conectarán al catálogo real
// cuando el backend publique el contrato.
export function Categories({ categories }: CategoriesProps) {
  return (
    <section
      id="encuentra-tu-estilo"
      className="section-y scroll-mt-24 bg-background"
    >
      <div className="container-page">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <Reveal>
            <p className="text-xs font-semibold tracking-[0.25em] text-terracotta-deep uppercase">
              Encuentra tu estilo
            </p>
            <h2 className="mt-3 font-heading text-[clamp(1.75rem,3.5vw,3rem)] leading-tight font-bold tracking-tight text-carbon">
              Hecho para cada movimiento
            </h2>
          </Reveal>
          <Reveal delay={0.08}>
            <Link
              href="/productos"
              className="inline-flex items-center gap-2 text-sm font-semibold text-carbon transition-colors hover:text-terracotta-deep"
            >
              Ver todas las categorías
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Reveal>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
          {categories.map((category, index) => (
            <Reveal key={category.slug} delay={index * 0.06}>
              <Link
                href={`/productos?categoria=${category.slug}`}
                className="group flex h-full flex-col overflow-hidden rounded-xl border border-border/70 bg-card transition-colors hover:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-[linear-gradient(150deg,#EDE0CE_0%,#D9C9B3_100%)]">
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-[radial-gradient(100%_80%_at_80%_20%,rgba(139,111,86,0.28)_0%,rgba(217,201,179,0)_60%)]"
                  />
                  <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-[10px] font-semibold tracking-[0.22em] text-coffee-deep/80 uppercase">
                    Foto de categoría
                  </span>
                  <span className="absolute top-3 left-3 rounded-full bg-cream/90 px-3 py-1 text-[10px] font-semibold tracking-[0.18em] text-carbon uppercase">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>

                <div className="flex flex-1 flex-col gap-2 p-5">
                  <h3 className="font-heading text-lg font-semibold text-carbon">{category.name}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {category.description}
                  </p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-xs font-semibold tracking-[0.16em] text-terracotta-deep uppercase">
                    Explorar
                    <ArrowRight
                      className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
