"use client";

import CarouselCards, {
  type RailItem,
} from "@/components/kokonutui/carousel-cards";
import { ProductCard } from "@/components/products/ProductCard";
import type { ProductCardData } from "@/types/catalog";

type ProductRailProps = {
  products: ProductCardData[];
  /** Nombre accesible del carrusel. */
  label: string;
};

// Version movil de las rejillas de la portada: Momentum Rail de Kokonut UI.
// Reutiliza la misma ProductCard para que la tarjeta no cambie de forma entre
// el rail y la rejilla, y deja el arrastre con inercia en manos del rail.
export function ProductRail({ products, label }: ProductRailProps) {
  if (products.length === 0) return null;

  const productsById = new Map<string, ProductCardData>();
  const items: RailItem[] = products.map((product, index) => {
    const id = product.id ?? product.slug ?? `producto-${index}`;
    productsById.set(id, product);

    return {
      id,
      title: product.name,
      location: product.categoryLabel ?? "UPBUY",
      image: product.image ?? undefined,
      imageAlt: product.name,
      price: product.price,
      currency: "$",
      priceLabel: "COP",
      href: product.slug ? `/producto/${product.slug}` : undefined,
    };
  });

  return (
    <CarouselCards
      className="py-0 [--rail-card:72vw] max-[360px]:[--rail-card:78vw] [&>section]:py-3 md:hidden"
      items={items}
      showHeader={false}
      title={label}
      renderItem={(item) => {
        const product = productsById.get(item.id);
        return product ? (
          <ProductCard className="h-full" product={product} />
        ) : null;
      }}
    />
  );
}
