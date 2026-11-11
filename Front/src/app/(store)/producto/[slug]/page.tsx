import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, RefreshCcw, ShieldCheck, Truck } from "lucide-react";
import { ProductCard } from "@/components/products/ProductCard";
import { ProductGallery } from "@/components/products/ProductGallery";
import { ProductPurchasePanel } from "@/components/products/ProductPurchasePanel";
import { CatalogUnavailable } from "@/components/products/CatalogStates";
import { Reveal } from "@/components/shared/Reveal";
import { formatPrice } from "@/lib/format";
import {
  getCoverImage,
  getImageUrls,
  getProductBySlug,
  listProducts,
} from "@/services/catalog";
import type { PublicProduct } from "@/types/catalog";

export const dynamic = "force-dynamic";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const product = await getProductBySlug(slug);
    if (!product) return { title: "Producto no encontrado — UPBUY" };

    const title = `${product.name} — UPBUY`;
    const description =
      product.description ??
      "Prenda UPBUY con identidad propia. Envío a toda Colombia.";

    return {
      title,
      description,
      alternates: { canonical: `/producto/${slug}` },
      openGraph: {
        title,
        description,
        type: "website",
        locale: "es_CO",
        images: getCoverImage(product) ? [getCoverImage(product)!] : undefined,
      },
    };
  } catch {
    return { title: "Producto — UPBUY" };
  }
}

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

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;

  let product: PublicProduct | null;
  try {
    product = await getProductBySlug(slug);
  } catch {
    return (
      <div className="container-page section-y">
        <CatalogUnavailable />
      </div>
    );
  }

  if (!product) {
    notFound();
  }

  const primaryCategory = product.categories[0] ?? null;

  // Relacionados: mismo catálogo, misma categoría si existe. No hay endpoint
  // dedicado de "relacionados", así que se consulta el listado y se excluye el
  // producto actual.
  let related: PublicProduct[] = [];
  try {
    const result = await listProducts({
      category: primaryCategory?.slug,
      limit: 5,
    });
    related = result.products
      .filter((item) => item.id !== product.id)
      .slice(0, 4);
  } catch {
    related = [];
  }

  const compareAt =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? product.compareAtPrice
      : product.discountPercent > 0 && product.priceBase > product.price
        ? product.priceBase
        : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    sku: product.sku,
    category: primaryCategory?.name,
    image: getImageUrls(product.images),
    offers: {
      "@type": "Offer",
      priceCurrency: product.currency || "COP",
      price: product.price,
      availability: product.available
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };

  return (
    <div className="bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="container-page pt-28 pb-4 sm:pt-32">
        <nav
          aria-label="Ruta de navegación"
          className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Link href="/" className="transition-colors hover:text-carbon">
            Inicio
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <Link href="/productos" className="transition-colors hover:text-carbon">
            Tienda
          </Link>
          {primaryCategory ? (
            <>
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
              <Link
                href={`/productos?categoria=${primaryCategory.slug}`}
                className="transition-colors hover:text-carbon"
              >
                {primaryCategory.name}
              </Link>
            </>
          ) : null}
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <span className="text-carbon">{product.name}</span>
        </nav>
      </div>

      <section className="pb-16 sm:pb-20 lg:pb-24">
        <div className="container-page">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-7">
              <ProductGallery
                productName={product.name}
                images={getImageUrls(product.images)}
              />
            </div>

            <div className="lg:col-span-5">
              <div className="lg:sticky lg:top-24">
                <div className="flex flex-wrap items-center gap-2">
                  {primaryCategory ? (
                    <Link
                      href={`/productos?categoria=${primaryCategory.slug}`}
                      className="text-xs font-semibold tracking-[0.18em] text-coffee-deep uppercase hover:text-terracotta-deep"
                    >
                      {primaryCategory.name}
                    </Link>
                  ) : null}
                  {product.combo ? (
                    <span className="rounded-full border border-carbon/20 px-3 py-1 text-[10px] font-semibold text-carbon">
                      Combo
                    </span>
                  ) : null}
                  {!product.available ? (
                    <span className="rounded-full bg-carbon px-3 py-1 text-[10px] font-semibold text-cream">
                      Agotado
                    </span>
                  ) : null}
                </div>

                <h1 className="mt-4 font-heading text-[clamp(2rem,4vw,3rem)] leading-[1.05] font-bold tracking-tight text-carbon">
                  {product.name}
                </h1>

                <div className="mt-4 flex flex-wrap items-baseline gap-3">
                  <span className="text-2xl font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                    {formatPrice(product.price)}
                  </span>
                  {compareAt ? (
                    <>
                      <span className="text-base text-muted-foreground line-through [font-variant-numeric:tabular-nums]">
                        {formatPrice(compareAt)}
                      </span>
                      {product.discountPercent > 0 ? (
                        <span className="rounded-full bg-terracotta-deep px-2.5 py-1 text-[10px] font-semibold text-cream">
                          -{product.discountPercent}%
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Precio en pesos colombianos ({product.currency || "COP"}). Impuestos
                  incluidos.
                </p>

                {product.description ? (
                  <p className="mt-5 text-sm leading-relaxed text-coffee-deep sm:text-base">
                    {product.description}
                  </p>
                ) : null}

                <ProductPurchasePanel
                  product={{
                    productId: product.id,
                    slug: product.slug,
                    name: product.name,
                    price: product.price,
                    image: getCoverImage(product),
                    sizes: product.sizes,
                    available: product.available,
                    stock: product.stock,
                    combo: product.combo,
                  }}
                />

                <div className="mt-7 grid gap-3 border-t border-border pt-6">
                  <BenefitLine
                    icon={Truck}
                    title="Envío a toda Colombia"
                    detail="El costo y el plazo se confirman en el checkout con los datos de entrega."
                  />
                  <BenefitLine
                    icon={RefreshCcw}
                    title="Cambios en 30 días"
                    detail="Sobre prendas sin uso y con etiquetas originales."
                  />
                  <BenefitLine
                    icon={ShieldCheck}
                    title="Compra protegida"
                    detail="Pago seguro y seguimiento del pedido."
                  />
                </div>

                <div className="mt-7 border-t border-border pt-2">
                  <details className="group border-b border-border py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-carbon">
                      Ficha del producto
                      <ChevronRight
                        className="h-4 w-4 transition-transform group-open:rotate-90"
                        aria-hidden="true"
                      />
                    </summary>
                    <dl className="mt-3 grid gap-2 text-sm">
                      <SpecRow label="Referencia" value={product.sku} />
                      {primaryCategory ? (
                        <SpecRow label="Categoría" value={primaryCategory.name} />
                      ) : null}
                      {product.sizes.length > 0 ? (
                        <SpecRow
                          label="Tallas"
                          value={product.sizes.join(" · ")}
                        />
                      ) : null}
                      <SpecRow
                        label="Disponibilidad"
                        value={
                          product.available
                            ? `${product.stock} ${product.stock === 1 ? "unidad" : "unidades"}`
                            : "Sin stock"
                        }
                      />
                    </dl>
                  </details>

                  <details className="group border-b border-border py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-carbon">
                      Envíos y devoluciones
                      <ChevronRight
                        className="h-4 w-4 transition-transform group-open:rotate-90"
                        aria-hidden="true"
                      />
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      Enviamos a todo el país. El costo final y el plazo se confirman
                      en el checkout con los datos de entrega. Los cambios se gestionan
                      dentro de los 30 días posteriores a la compra.
                    </p>
                  </details>

                  <details className="group border-b border-border py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-carbon">
                      Cuidado de la prenda
                      <ChevronRight
                        className="h-4 w-4 transition-transform group-open:rotate-90"
                        aria-hidden="true"
                      />
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      Lavar en frío y del revés. No usar secadora. Planchar a baja
                      temperatura evitando el estampado. Secar a la sombra para conservar
                      el color.
                    </p>
                  </details>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {related.length > 0 ? (
        <section className="border-t border-border bg-background py-16 sm:py-20">
          <div className="container-page">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <Reveal>
                <p className="text-xs font-semibold tracking-[0.25em] text-terracotta-deep uppercase">
                  Combina bien con
                </p>
                <h2 className="mt-3 font-heading text-[clamp(1.5rem,3vw,2.25rem)] leading-tight font-bold tracking-tight text-carbon">
                  También te puede gustar
                </h2>
              </Reveal>
              <Link
                href="/productos"
                className="text-sm font-semibold text-carbon transition-colors hover:text-terracotta-deep"
              >
                Ver toda la colección
              </Link>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
              {related.map((item, index) => (
                <Reveal key={item.id} delay={index * 0.06}>
                  <ProductCard product={toCardData(item)} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="font-medium text-carbon">{value}</dd>
    </div>
  );
}

function BenefitLine({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Truck;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3">
      <Icon
        className="mt-0.5 h-5 w-5 shrink-0 text-terracotta-deep"
        aria-hidden="true"
      />
      <div>
        <p className="text-sm font-semibold text-carbon">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}