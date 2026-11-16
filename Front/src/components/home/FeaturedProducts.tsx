import { Reveal } from "@/components/shared/Reveal";
import { ProductCard } from "@/components/products/ProductCard";
import type { ProductCardData } from "@/types/catalog";

type FeaturedProductsProps = {
  products: ProductCardData[];
};

// Productos destacados: curaduría del admin (`product_home_sections`).
// Si la sección llega vacía no se pinta: nunca un grid vacío.
export function FeaturedProducts({ products }: FeaturedProductsProps) {
  if (products.length === 0) return null;

  return (
    <section className="section-y bg-background">
      <div className="container-page">
        <Reveal>
          <p className="text-sm font-semibold tracking-[0.25em] text-terracotta-deep uppercase">
            Selección
          </p>
          <h2 className="mt-3 font-heading text-[clamp(1.75rem,3.5vw,3rem)] leading-tight font-bold tracking-tight text-carbon">
            Productos destacados
          </h2>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground">
            Las piezas que más se mueven con nosotros. Cada diseño se prueba antes de llegar a
            tu closet.
          </p>
        </Reveal>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
          {products.map((product, index) => (
            <Reveal key={product.id ?? product.slug ?? index} delay={index * 0.06}>
              <ProductCard product={product} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
