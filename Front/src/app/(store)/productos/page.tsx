import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProductCard } from "@/components/products/ProductCard";
import { CatalogToolbar } from "@/components/products/CatalogToolbar";
import { CatalogPagination } from "@/components/products/CatalogPagination";
import {
  CatalogEmpty,
  CatalogUnavailable,
} from "@/components/products/CatalogStates";
import { Reveal } from "@/components/shared/Reveal";
import {
  getCoverImage,
  listCategories,
  listProducts,
} from "@/services/catalog";
import { ApiError } from "@/services/api/client";
import type { Category, PublicProduct } from "@/types/catalog";

const PAGE_SIZE = 12;

// El catálogo depende de la query string y del backend en vivo.
export const dynamic = "force-dynamic";

type ProductosPageProps = {
  searchParams: Promise<{
    q?: string;
    categoria?: string;
    destacados?: string;
    pagina?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Tienda — UPBUY",
  description:
    "Explora toda la colección UPBUY: prendas con identidad propia y envío a toda Colombia.",
  alternates: { canonical: "/productos" },
};

function toCardData(product: PublicProduct) {
  const base =
    product.discountPercent > 0 && product.priceBase > product.price
      ? product.priceBase
      : null;
  const compareAt =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? product.compareAtPrice
      : base;

  return {
    slug: product.slug,
    name: product.name,
    price: product.price,
    compareAtPrice: compareAt,
    discountPercent: product.discountPercent,
    sizes: product.sizes,
    categoryLabel: product.categories[0]?.name ?? null,
    badge: null,
    available: product.available,
    image: getCoverImage(product),
  };
}

export default async function ProductosPage({ searchParams }: ProductosPageProps) {
  const params = await searchParams;
  const q = typeof params.q === "string" && params.q.trim() ? params.q.trim() : null;
  const categorySlug =
    typeof params.categoria === "string" && params.categoria.trim()
      ? params.categoria.trim()
      : null;
  const featured = params.destacados === "1";
  const page = Math.max(1, Number(params.pagina) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [categoriesResult, productsResult] = await Promise.allSettled([
    listCategories(),
    listProducts({
      q: q ?? undefined,
      category: categorySlug ?? undefined,
      featured: featured || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
  ]);

  const categories: Category[] =
    categoriesResult.status === "fulfilled" ? categoriesResult.value : [];
  const activeCategory = categorySlug
    ? categories.find((category) => category.slug === categorySlug)
    : undefined;

  const buildCategoryHref = (slug?: string) => {
    const query = new URLSearchParams();
    if (slug) query.set("categoria", slug);
    if (q) query.set("q", q);
    if (featured) query.set("destacados", "1");
    const search = query.toString();
    return search ? `/productos?${search}` : "/productos";
  };

  return (
    <div className="bg-background">
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
              {activeCategory?.description ??
                "Piezas pensadas para acompañar tu ritmo: cortes cómodos, materiales elegidos y una paleta que combina con todo."}
            </p>
          </div>
        </div>
      </section>

      <section className="section-y">
        <div className="container-page">
          {/* Encabezado de sección para no saltar de h1 a h3 en las tarjetas. */}
          <h2 className="sr-only">Resultados del catálogo</h2>

          {categories.length > 0 ? (
            <nav
              aria-label="Filtrar por categoría"
              className="mb-8 flex flex-wrap gap-2"
            >
              <CategoryPill href={buildCategoryHref()} active={!activeCategory}>
                Todo
              </CategoryPill>
              {categories.map((category) => (
                <CategoryPill
                  key={category.id}
                  href={buildCategoryHref(category.slug)}
                  active={activeCategory?.slug === category.slug}
                >
                  {category.name}
                </CategoryPill>
              ))}
            </nav>
          ) : null}

          {productsResult.status === "rejected" ? (
            <CatalogUnavailable
              detail={
                productsResult.reason instanceof ApiError
                  ? productsResult.reason.message
                  : undefined
              }
            />
          ) : (
            <>
              <CatalogToolbar
                total={productsResult.value.total}
                activeCategoryName={activeCategory?.name ?? null}
                q={q}
                categorySlug={categorySlug}
                featured={featured}
              />

              {productsResult.value.products.length > 0 ? (
                <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
                  {productsResult.value.products.map((product, index) => (
                    <Reveal
                      key={product.id}
                      delay={Math.min(index * 0.05, 0.25)}
                    >
                      <ProductCard
                        product={toCardData(product)}
                        priority={index < 4}
                      />
                    </Reveal>
                  ))}
                </div>
              ) : (
                <CatalogEmpty
                  title="No encontramos productos"
                  description={
                    q || featured || categorySlug
                      ? "Prueba con otros filtros o revisa la colección completa."
                      : "Todavía no hay productos publicados. Estamos preparando la primera colección."
                  }
                />
              )}

              <CatalogPagination
                page={page}
                pageSize={PAGE_SIZE}
                total={productsResult.value.total}
                query={{
                  q: q ?? undefined,
                  categoria: categorySlug ?? undefined,
                  destacados: featured ? "1" : undefined,
                }}
              />
            </>
          )}
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