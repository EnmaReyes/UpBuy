import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import { Suspense } from "react";
import { ProductCard } from "@/components/products/ProductCard";
import { CatalogToolbar } from "@/components/products/CatalogToolbar";
import { Reveal } from "@/components/shared/Reveal";
import {
  CATEGORIES,
  PRODUCTS,
  getCategoryBySlug,
  type Product,
} from "@/lib/mock-data";

type ProductosPageProps = {
  searchParams: Promise<{ categoria?: string; orden?: string }>;
};

export const metadata: Metadata = {
  title: "Tienda — UPBUY",
  description:
    "Explora toda la colección UPBUY: camisetas, oversize, combos y accesorios con envío a toda Colombia.",
  openGraph: {
    title: "Tienda — UPBUY",
    description: "Camisetas, oversize, combos y accesorios. Envíos a toda Colombia.",
    type: "website",
    locale: "es_CO",
  },
};

function sortProducts(products: Product[], order: string | undefined): Product[] {
  const list = [...products];

  switch (order) {
    case "precio-asc":
      return list.sort((a, b) => a.price - b.price);
    case "precio-desc":
      return list.sort((a, b) => b.price - a.price);
    case "nuevos":
      return list.sort((a, b) => Number(b.newArrival) - Number(a.newArrival));
    case "destacados":
    default:
      return list.sort((a, b) => Number(b.featured) - Number(a.featured));
  }
}

export default async function ProductosPage({ searchParams }: ProductosPageProps) {
  const params = await searchParams;
  const categorySlug = typeof params.categoria === "string" ? params.categoria : undefined;
  const order = typeof params.orden === "string" ? params.orden : undefined;

  const activeCategory = categorySlug ? getCategoryBySlug(categorySlug) : undefined;
  const filtered = categorySlug
    ? PRODUCTS.filter((item) => item.category === categorySlug)
    : PRODUCTS;
  const products = sortProducts(filtered, order);

  const buildCategoryHref = (slug?: string) => {
    const query = new URLSearchParams();
    if (slug) query.set("categoria", slug);
    if (order && order !== "destacados") query.set("orden", order);
    const search = query.toString();
    return search ? `/productos?${search}` : "/productos";
  };

  return (
    <div className="bg-background">
      {/* Cabecera editorial del catálogo */}
      <section className="bg-carbon pt-28 pb-14 text-cream sm:pt-32 lg:pb-20">
        <div className="container-page">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-cream/60 uppercase transition-colors hover:text-cream"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Inicio
          </Link>

          <div className="mt-8 grid gap-6 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <p className="text-xs font-semibold tracking-[0.25em] text-terracotta uppercase">
                Tienda
              </p>
              <h1 className="mt-4 font-heading text-[clamp(2.25rem,5.5vw,4.5rem)] leading-[1.02] font-bold tracking-tight uppercase">
                {activeCategory ? activeCategory.name : "Toda la colección"}
              </h1>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-cream/70 sm:text-base lg:col-span-4">
              {activeCategory
                ? activeCategory.description
                : "Piezas pensadas para acompañar tu ritmo: cortes cómodos, materiales elegidos y una paleta que combina con todo."}
            </p>
          </div>
        </div>
      </section>

      <section className="section-y">
        <div className="container-page">
          {/* Filtros por categoría */}
          <nav aria-label="Filtrar por categoría" className="mb-8 flex flex-wrap gap-2">
            <CategoryPill href={buildCategoryHref()} active={!activeCategory}>
              Todo
            </CategoryPill>
            {CATEGORIES.map((category) => (
              <CategoryPill
                key={category.slug}
                href={buildCategoryHref(category.slug)}
                active={activeCategory?.slug === category.slug}
              >
                {category.name}
              </CategoryPill>
            ))}
          </nav>

          <Suspense
            fallback={
              <div className="flex items-center gap-2 border-b border-border pb-5 text-sm text-muted-foreground">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Cargando filtros…
              </div>
            }
          >
            <CatalogToolbar total={products.length} activeCategoryName={activeCategory?.name ?? null} />
          </Suspense>

          {products.length > 0 ? (
            <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
              {products.map((product, index) => (
                <Reveal key={product.id} delay={Math.min(index * 0.05, 0.25)}>
                  <ProductCard product={product} />
                </Reveal>
              ))}
            </div>
          ) : (
            <div className="mt-16 flex flex-col items-center gap-4 text-center">
              <p className="font-heading text-xl font-semibold text-carbon">
                No hay productos en esta categoría
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                Estamos preparando nuevas piezas. Mientras tanto, puedes ver la colección
                completa.
              </p>
              <Link
                href="/productos"
                className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-carbon px-6 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
              >
                Ver todo
              </Link>
            </div>
          )}

          <p className="mt-14 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
            Catálogo de demostración: los productos y precios mostrados son de referencia.
            La conexión con el catálogo real del backend está en curso.
          </p>
        </div>
      </section>
    </div>
  );
}

function CategoryPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "inline-flex h-10 items-center justify-center rounded-full bg-carbon px-4 text-sm font-semibold text-cream"
          : "inline-flex h-10 items-center justify-center rounded-full border border-border bg-card px-4 text-sm font-medium text-carbon transition-colors hover:border-terracotta hover:text-terracotta-deep"
      }
    >
      {children}
    </Link>
  );
}
