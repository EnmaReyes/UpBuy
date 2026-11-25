import { getCoverImage } from "@/services/catalog";
import type {
  ProductBadge,
  ProductCardData,
  PublicProduct,
} from "@/types/catalog";

// Convierte un producto público de la API en los datos mínimos de tarjeta.
// Es el único mapper del catálogo: lo usan la Home, /productos y los
// relacionados del detalle, para que badge y categoría sean consistentes.
export function toCardData(
  product: PublicProduct,
  badge?: ProductBadge,
): ProductCardData {
  const compareAt =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? product.compareAtPrice
      : product.priceBase > product.price
        ? product.priceBase
        : null;

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    price: product.price,
    compareAtPrice: compareAt,
    discountPercent: product.discountPercent,
    sizes: product.sizes,
    colors: product.colors ?? [],
    stock: product.stock,
    combo: product.combo,
    categoryLabel: product.categoryLabel ?? product.categories[0]?.name ?? null,
    badge: badge ?? product.badge ?? null,
    available: product.available,
    image: getCoverImage(product),
  };
}
