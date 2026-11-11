import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/shared/Reveal";
import { ProductCard } from "@/components/products/ProductCard";
import type { Product } from "@/lib/mock-data";

type FavoritesProps = {
  products: Product[];
};

// Favoritos de la comunidad: misma lógica de tarjeta que el resto del catálogo.
// La selección llegará del backend cuando exista el contrato de catálogo.
export function Favorites({ products }: FavoritesProps) {
  return (
    <section className="section-y bg-background">
      <div className="container-page">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <Reveal className="lg:col-span-8">
            <p className="text-xs font-semibold tracking-[0.25em] text-terracotta-deep uppercase">
              Los favoritos de la comunidad
            </p>
            <h2 className="mt-3 max-w-2xl font-heading text-[clamp(1.75rem,3.5vw,3rem)] leading-tight font-bold tracking-tight text-carbon">
              Las piezas que más se repiten
            </h2>
          </Reveal>

          <Reveal className="lg:col-span-4" delay={0.08}>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Las que se agotan, las que vuelven y las que todos preguntan. Una
              selección que se mueve con nuestra gente.
            </p>
            <Link
              href="/productos?orden=destacados"
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-carbon transition-colors hover:text-terracotta-deep"
            >
              Ver todos los productos
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Reveal>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
          {products.map((product, index) => (
            <Reveal key={product.id} delay={index * 0.06}>
              <ProductCard product={product} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
