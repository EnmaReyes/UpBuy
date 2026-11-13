"use client";

import Link from "next/link";
import { ArrowRight, ShoppingBag, Trash2 } from "lucide-react";
import { cartKey, maxQuantityForStock, useCart } from "@/context/cart-context";
import { formatPrice } from "@/lib/format";
import { SafeImage } from "@/components/shared/SafeImage";
import { AddToCartButton } from "@/components/kokonutui/cart-button";

// Vista del carrito. El total que se muestra es la suma de precios del
// catálogo; el backend recalcula precio, stock y envío al crear el pedido.
export function CartView() {
  const { items, hydrated, count, subtotal, setQuantity, remove } = useCart();

  if (!hydrated) {
    return (
      <div
        aria-hidden="true"
        className="mt-10 h-40 animate-pulse rounded-xl border border-border bg-card"
      />
    );
  }

  if (items.length === 0) {
    return (
      <div className="mt-12 flex flex-col items-center gap-4 rounded-xl border border-border bg-card px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-coffee-deep">
          <ShoppingBag className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="font-heading text-xl font-semibold text-carbon">
          Tu carrito está vacío
        </h2>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Explora la colección y añade las piezas que te gusten.
        </p>
        <Link
          href="/productos"
          className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-carbon px-6 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
        >
          Ver la colección
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:gap-12">
      <div className="lg:col-span-8">
        <ul className="grid gap-4">
          {items.map((item) => {
            const key = cartKey(item);
            return (
              <li
                key={key}
                className="flex min-w-0 gap-4 rounded-xl border border-border bg-card p-4"
              >
                <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                  <SafeImage
                    src={item.image}
                    alt={item.name}
                    className="absolute inset-0 h-full w-full object-cover"
                    fallback={
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 bg-[linear-gradient(150deg,#EDE0CE_0%,#F5E9D7_48%,#D9C9B3_100%)]"
                      />
                    }
                  />
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {item.slug ? (
                        <Link
                          href={`/producto/${item.slug}`}
                          className="font-heading text-base leading-snug font-semibold text-carbon hover:text-terracotta-deep"
                        >
                          {item.name}
                        </Link>
                      ) : (
                        <p className="font-heading text-base leading-snug font-semibold text-carbon">
                          {item.name}
                        </p>
                      )}
                      {item.size ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Talla {item.size}
                        </p>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => remove(key)}
                      aria-label={`Quitar ${item.name} del carrito`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-terracotta-deep transition-colors hover:bg-terracotta/10"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-3">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                        {formatPrice(item.price * item.quantity)}
                      </p>
                      {item.quantity > 1 ? (
                        <p className="text-xs text-muted-foreground [font-variant-numeric:tabular-nums]">
                          {formatPrice(item.price)} c/u
                        </p>
                      ) : null}
                    </div>

                    <AddToCartButton
                      max={maxQuantityForStock(item.stock)}
                      name={item.name}
                      onQuantityChange={(next) =>
                        next <= 0 ? remove(key) : setQuantity(key, next)
                      }
                      quantity={item.quantity}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <Link
          href="/productos"
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-carbon transition-colors hover:text-terracotta-deep"
        >
          Seguir comprando
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <aside className="lg:col-span-4">
        <div className="rounded-xl border border-border bg-card p-6 lg:sticky lg:top-24">
          <h2 className="font-heading text-lg font-semibold text-carbon">Resumen</h2>

          <dl className="mt-4 grid gap-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">
                Subtotal ({count} {count === 1 ? "artículo" : "artículos"})
              </dt>
              <dd className="font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                {formatPrice(subtotal)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Envío</dt>
              <dd className="font-semibold text-terracotta-deep">Gratis</dd>
            </div>
          </dl>

          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <span className="font-heading text-base font-semibold text-carbon">
              Total estimado
            </span>
            <span className="font-heading text-lg font-bold text-carbon [font-variant-numeric:tabular-nums]">
              {formatPrice(subtotal)}
            </span>
          </div>

          <Link
            href="/checkout"
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-carbon px-6 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
          >
            Finalizar compra
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>

          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Envío gratis en Antioquia y a toda Colombia. El precio y la
            disponibilidad se confirman con el servidor al crear el pedido.
          </p>
        </div>
      </aside>
    </div>
  );
}