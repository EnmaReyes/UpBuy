import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/shared/Reveal";
import { ProductCollection } from "@/components/products/ProductCollection";
import type { ProductCardData } from "@/types/catalog";

type NewArrivalsProps = {
  products: ProductCardData[];
};

// Sección editorial de novedades. Reutiliza ProductCard para no duplicar
// la lógica de tarjetas. Sin productos no se pinta.
export function NewArrivals({ products }: NewArrivalsProps) {
  if (products.length === 0) return null;

  return (
    <section className="section-y bg-carbon text-cream">
      <div className="container-page">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
          <Reveal className="lg:col-span-6">
            <p className="text-sm font-semibold tracking-[0.25em] text-terracotta uppercase">
              Novedades
            </p>
            <h2 className="mt-3 font-heading text-[clamp(1.75rem,3.5vw,3rem)] leading-tight font-bold tracking-tight">
              Nueva temporada. Nueva energía.
            </h2>
          </Reveal>

          <Reveal className="lg:col-span-6" delay={0.1}>
            <p className="text-base leading-relaxed text-cream/70">
              Las últimas siluetas y los detalles que acabamos de trabajar. Diseñadas para
              acompañar tus días más activos.
            </p>
            <Link
              href="/productos?nuevos=1"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-terracotta transition-colors hover:text-cream"
            >
              Ver todas las novedades
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Reveal>
        </div>

        <ProductCollection label="Novedades" products={products} />
      </div>
    </section>
  );
}
