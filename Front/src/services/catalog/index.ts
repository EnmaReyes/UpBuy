import { apiFetch, ApiError } from "@/services/api/client";
import type {
  CatalogQuery,
  Category,
  PaginatedProducts,
  ProductImageRef,
  PublicProduct,
} from "@/types/catalog";

// Servicio del catálogo público. Único punto que conoce las rutas del backend:
// si cambian, solo se toca este archivo.

const DEFAULT_LIMIT = 12;

export async function listProducts(
  query: CatalogQuery = {},
): Promise<PaginatedProducts> {
  return apiFetch<PaginatedProducts>("/api/products", {
    query: {
      q: query.q,
      category: query.category,
      featured: query.featured ? "true" : undefined,
      limit: query.limit ?? DEFAULT_LIMIT,
      offset: query.offset ?? 0,
    },
  });
}

/** Devuelve `null` si el producto no existe (404). Otros errores se propagan. */
export async function getProductBySlug(
  slug: string,
): Promise<PublicProduct | null> {
  try {
    return await apiFetch<PublicProduct>(
      `/api/products/${encodeURIComponent(slug)}`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) return null;
    throw error;
  }
}

export async function listCategories(): Promise<Category[]> {
  const data = await apiFetch<{ categories: Category[] }>("/api/categories");
  return data.categories ?? [];
}

/** Primera URL utilizable de las imágenes del producto. */
export function getCoverImage(product: {
  images?: ProductImageRef[];
}): string | null {
  const first = product.images?.[0];
  if (!first) return null;
  if (typeof first === "string") return first || null;
  return first.url ?? null;
}

/** Normaliza `images` a una lista de URLs válidas. */
export function getImageUrls(images?: ProductImageRef[]): string[] {
  if (!images) return [];
  return images
    .map((image) => (typeof image === "string" ? image : image?.url ?? null))
    .filter((url): url is string => Boolean(url));
}