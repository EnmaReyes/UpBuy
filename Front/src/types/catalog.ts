// Tipos del catálogo público.
//
// Reflejan exactamente la forma que devuelve `GET /api/products` y
// `GET /api/products/:slug` (ver Back/Services/catalog/catalogQuery.service.js
// -> publicShape). Los campos internos (`cost`, `markup`) no existen aquí a
// propósito: el backend no los expone.

/** Las imágenes llegan como array de URLs, aunque se acepta { url } por si el
 *  backend cambia el JSONB a objetos. */
export type ProductImageRef =
  | string
  | { url?: string | null; position?: number; isPrimary?: boolean };

export type CategoryRef = {
  id: string;
  name: string;
  slug: string;
};

export type PublicProduct = {
  id: string;
  sku: string;
  slug: string | null;
  name: string;
  description: string | null;
  images: ProductImageRef[];
  promotionVideos?: string[];
  /** Precio final (ya con descuento aplicado). Entero en COP. */
  price: number;
  /** Precio base antes del descuento. Entero en COP. */
  priceBase: number;
  /** Precio "antes" para mostrar tachado. */
  compareAtPrice: number | null;
  discountPercent: number;
  currency: string;
  stock: number;
  available: boolean;
  sizes: string[];
  combo: boolean;
  featured: boolean;
  categories: CategoryRef[];
  createdAt: string;
  /** Calculado por el backend según la sección de la Home donde se muestra. */
  badge?: ProductBadge | null;
  /** Nombre de la primera categoría, ya resuelto por el backend. */
  categoryLabel?: string | null;
};

/** Insignia de tarjeta. Depende de la sección, no es un campo del producto. */
export type ProductBadge = "bestseller" | "nuevo" | null;

export type HomeSectionKey =
  | "featured"
  | "newArrivals"
  | "communityFavorites";

/** Categoría mínima que devuelve `GET /api/home`. */
export type HomeCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

/** Respuesta de `GET /api/home`: las tres secciones y las categorías. */
export type HomePayload = {
  sections: Record<HomeSectionKey, PublicProduct[]>;
  categories: HomeCategory[];
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  createdAt?: string;
  updatedAt?: string;
};

export type PaginatedProducts = {
  products: PublicProduct[];
  total: number;
  limit: number;
  offset: number;
};

/** Parámetros que acepta `GET /api/products`. No se inventan más. */
export type CatalogQuery = {
  q?: string;
  category?: string;
  featured?: boolean;
  /** Solo novedades: publicado dentro de los últimos 30 días. */
  onlyNew?: boolean;
  /** Orden por unidades vendidas de los últimos 90 días. */
  sort?: "best_sellers";
  limit?: number;
  offset?: number;
};

/** Datos mínimos que necesita `ProductCard`. Lo cumplen tanto el producto de
 *  la API como el mock de la Home. */
export type ProductCardData = {
  /** Identificador interno; sin el no se puede agregar al carrito. */
  id?: string;
  slug: string | null;
  name: string;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number;
  sizes: string[];
  /** Unidades disponibles. `undefined` deja el boton fuera de la tarjeta. */
  stock?: number;
  combo?: boolean;
  categoryLabel?: string | null;
  badge?: ProductBadge;
  available?: boolean;
  image?: string | null;
};