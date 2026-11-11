import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import { SafeImage } from "@/components/shared/SafeImage";
import type { ProductCardData } from "@/types/catalog";

type ProductCardProps = {
  product: ProductCardData;
  className?: string;
  priority?: boolean;
};

// Tarjeta de producto editorial.
// - Si el producto trae imagen real se muestra; si no, un marcador con la
//   paleta de la marca (las fotografías comerciales todavía no existen).
// - `priority` reserva la carga temprana de la primera fila.
export function ProductCard({ product, className, priority }: ProductCardProps) {
  const hasDiscount = Boolean(
    product.compareAtPrice && product.discountPercent > 0,
  );
  const soldOut = product.available === false;
  const href = product.slug ? `/producto/${product.slug}` : "/productos";

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl bg-card text-card-foreground",
        className,
      )}
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
        <SafeImage
          src={product.image}
          alt={product.name}
          eager={priority}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          fallback={<ProductImagePlaceholder />}
        />

        <Link
          href={href}
          aria-label={`Ver ${product.name}`}
          className="absolute inset-0 z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        />

        <div className="absolute top-3 left-3 z-20 flex flex-col items-start gap-2">
          {hasDiscount ? (
            <span className="rounded-full bg-terracotta-deep px-3 py-1 text-[11px] font-semibold text-cream">
              -{product.discountPercent}%
            </span>
          ) : null}
          {soldOut ? (
            <span className="rounded-full bg-carbon px-3 py-1 text-[11px] font-semibold text-cream">
              Agotado
            </span>
          ) : null}
          {!soldOut && product.badge === "bestseller" ? (
            <span className="rounded-full bg-carbon px-3 py-1 text-[11px] font-semibold text-cream">
              Más vendido
            </span>
          ) : null}
          {!soldOut && product.badge === "nuevo" ? (
            <span className="rounded-full bg-cream px-3 py-1 text-[11px] font-semibold text-carbon">
              Nuevo
            </span>
          ) : null}
        </div>

        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex translate-y-2 items-center justify-between rounded-lg bg-carbon/90 px-4 py-3 text-cream opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
          <span className="text-[11px] font-semibold tracking-[0.18em] uppercase">
            Ver detalle
          </span>
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        {product.categoryLabel ? (
          <span className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {product.categoryLabel}
          </span>
        ) : null}

        <h3 className="font-heading text-base leading-snug font-semibold text-carbon sm:text-lg">
          <Link
            href={href}
            className="hover:text-terracotta-deep focus-visible:underline focus-visible:outline-none"
          >
            {product.name}
          </Link>
        </h3>

        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <div className="flex flex-col">
            <span className="text-base font-semibold text-carbon [font-variant-numeric:tabular-nums]">
              {formatPrice(product.price)}
            </span>
            {hasDiscount && product.compareAtPrice ? (
              <span className="text-sm text-muted-foreground line-through [font-variant-numeric:tabular-nums]">
                {formatPrice(product.compareAtPrice)}
              </span>
            ) : null}
          </div>

          {product.sizes.length > 0 ? (
            <span className="text-[11px] font-medium tracking-wide text-coffee-deep uppercase">
              {product.sizes.length > 1
                ? `${product.sizes.length} tallas`
                : product.sizes[0]}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

// Marcador editorial: se muestra cuando el producto no tiene foto o cuando la
// del proveedor no carga.
function ProductImagePlaceholder() {
  return (
    <span className="absolute inset-0">
      <span
        aria-hidden="true"
        className="absolute inset-0 block bg-[linear-gradient(150deg,#EDE0CE_0%,#F5E9D7_48%,#D9C9B3_100%)]"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 block bg-[radial-gradient(120%_90%_at_20%_10%,rgba(211,84,0,0.10)_0%,rgba(245,233,215,0)_58%)]"
      />
      <span className="absolute inset-0 flex items-center justify-center p-6">
        <span className="rounded-full border border-coffee/25 px-4 py-1.5 text-center text-[10px] font-semibold tracking-[0.22em] text-coffee-deep uppercase">
          Foto de producto
        </span>
      </span>
    </span>
  );
}