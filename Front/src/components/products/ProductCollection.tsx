import { Reveal } from "@/components/shared/Reveal";
import { ProductCard } from "@/components/products/ProductCard";
import { ProductRail } from "@/components/products/ProductRail";
import type { ProductCardData } from "@/types/catalog";

type ProductCollectionProps = {
  products: ProductCardData[];
  /** Nombre accesible del rail en pantallas pequenas. */
  label: string;
  /** Retardo entre tarjetas al entrar en pantalla. */
  stagger?: number;
};

// Coleccion de productos de la portada:
// - Movil y tabletas angostas: Momentum Rail (arrastre con inercia + snap).
// - Desde md: rejilla estable de 3 o 4 columnas con tarjetas de igual altura.
export function ProductCollection({
  products,
  label,
  stagger = 0.06,
}: ProductCollectionProps) {
  if (products.length === 0) return null;

  return (
    <>
      <ProductRail label={label} products={products} />

      <div className="mt-10 hidden grid-cols-3 items-stretch gap-4 sm:gap-6 md:grid lg:grid-cols-4">
        {products.map((product, index) => (
          <Reveal
            className="h-full"
            delay={index * stagger}
            key={product.id ?? product.slug ?? index}
          >
            <ProductCard className="h-full" product={product} />
          </Reveal>
        ))}
      </div>
    </>
  );
}
