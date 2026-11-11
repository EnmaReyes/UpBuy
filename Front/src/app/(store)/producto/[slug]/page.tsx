import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronRight,
  RefreshCcw,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { ProductCard } from "@/components/products/ProductCard";
import { ProductGallery } from "@/components/products/ProductGallery";
import { ProductPurchasePanel } from "@/components/products/ProductPurchasePanel";
import { Reveal } from "@/components/shared/Reveal";
import { formatPrice } from "@/lib/format";
import { PRODUCTS, getProductBySlug, getRelatedProducts } from "@/lib/mock-data";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return PRODUCTS.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);

  if (!product) {
    return { title: "Producto no encontrado — UPBUY" };
  }

  return {
    title: `${product.name} — UPBUY`,
    description: product.description,
    openGraph: {
      title: `${product.name} — UPBUY`,
      description: product.description,
      type: "website",
      locale: "es_CO",
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const related = getRelatedProducts(product.slug, 4);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.longDescription,
    sku: product.sku,
    category: product.categoryLabel,
    offers: {
      "@type": "Offer",
      priceCurrency: "COP",
      price: product.price,
      availability: "https://schema.org/InStock",
    },
  };

  return (
    <div className="bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="container-page pt-28 pb-4 sm:pt-32">
        <nav aria-label="Ruta de navegación" className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/" className="transition-colors hover:text-carbon">
            Inicio
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <Link href="/productos" className="transition-colors hover:text-carbon">
            Tienda
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <Link
            href={`/productos?categoria=${product.category}`}
            className="transition-colors hover:text-carbon"
          >
            {product.categoryLabel}
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <span className="text-carbon">{product.name}</span>
        </nav>
      </div>

      <section className="pb-16 sm:pb-20 lg:pb-24">
        <div className="container-page">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-7">
              <ProductGallery productName={product.name} />
            </div>

            <div className="lg:col-span-5">
              <div className="lg:sticky lg:top-24">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/productos?categoria=${product.category}`}
                    className="text-xs font-semibold tracking-[0.18em] text-coffee-deep uppercase hover:text-terracotta-deep"
                  >
                    {product.categoryLabel}
                  </Link>
                  {product.badge === "bestseller" ? (
                    <span className="rounded-full bg-carbon px-3 py-1 text-[10px] font-semibold text-cream">
                      Más vendido
                    </span>
                  ) : null}
                  {product.badge === "nuevo" ? (
                    <span className="rounded-full border border-carbon/20 px-3 py-1 text-[10px] font-semibold text-carbon">
                      Nuevo
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
                  {product.compareAtPrice ? (
                    <>
                      <span className="text-base text-muted-foreground line-through [font-variant-numeric:tabular-nums]">
                        {formatPrice(product.compareAtPrice)}
                      </span>
                      <span className="rounded-full bg-terracotta-deep px-2.5 py-1 text-[10px] font-semibold text-cream">
                        -{product.discountPercent}%
                      </span>
                    </>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Precio en pesos colombianos (COP). Impuestos incluidos.
                </p>

                <p className="mt-5 text-sm leading-relaxed text-coffee-deep sm:text-base">
                  {product.longDescription}
                </p>

                <ProductPurchasePanel product={product} />

                <div className="mt-7 grid gap-3 border-t border-border pt-6">
                  <BenefitLine icon={Truck} title="Envío a toda Colombia" detail="Estándar en 2–5 días hábiles. Gratis desde $150.000." />
                  <BenefitLine icon={RefreshCcw} title="Cambios en 30 días" detail="Sobre prendas sin uso y con etiquetas originales." />
                  <BenefitLine icon={ShieldCheck} title="Compra protegida" detail="Pago seguro y seguimiento del pedido." />
                </div>

                <div className="mt-7 border-t border-border pt-2">
                  <details className="group border-b border-border py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-carbon">
                      Detalles del producto
                      <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden="true" />
                    </summary>
                    <ul className="mt-3 space-y-2 pl-1">
                      {product.details.map((detail) => (
                        <li key={detail} className="flex gap-2 text-sm text-muted-foreground">
                          <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-terracotta" />
                          {detail}
                        </li>
                      ))}
                    </ul>
                  </details>

                  <details className="group border-b border-border py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-carbon">
                      Envíos y devoluciones
                      <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden="true" />
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      Enviamos a todo el país. El costo final y el plazo se confirman en el
                      checkout con los datos de entrega. Los cambios se gestionan dentro de los
                      30 días posteriores a la compra.
                    </p>
                  </details>

                  <details className="group border-b border-border py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-carbon">
                      Cuidado de la prenda
                      <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden="true" />
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      Lavar en frío y del revés. No usar secadora. Planchar a baja temperatura
                      evitando el estampado. Secar a la sombra para conservar el color.
                    </p>
                  </details>
                </div>

                <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">
                  Referencia SKU {product.sku}. Ficha de demostración: el catálogo real se
                  conectará cuando el backend publique el contrato de productos.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

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
                <ProductCard product={item} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>
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
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-terracotta-deep" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-carbon">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
