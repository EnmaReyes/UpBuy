"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Minus, Plus, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "@/context/cart-context";

type PurchaseProduct = {
  productId: string;
  slug: string | null;
  name: string;
  price: number;
  image: string | null;
  sizes: string[];
  available: boolean;
  stock: number;
  combo: boolean;
};

// Panel de compra. La talla y la cantidad se eligen aquí y el producto se
// añade al carrito local. El precio y el stock definitivos los valida el
// backend al crear el pedido (FASE 5): el carrito nunca calcula el total final.
export function ProductPurchasePanel({ product }: { product: PurchaseProduct }) {
  const { add } = useCart();

  // La talla es una medida: solo se pide si el producto tiene tallas y no es
  // un combo. Es la misma regla que aplica el backend al crear el pedido.
  const sizes = product.combo ? [] : product.sizes;
  const requiresSize = sizes.length > 0;

  const [size, setSize] = useState<string | null>(
    sizes.length === 1 ? sizes[0] : null,
  );
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const needsSize = requiresSize && !size;
  const canAdd = product.available && !needsSize;

  const onAdd = () => {
    if (!canAdd) return;

    add({
      productId: product.productId,
      slug: product.slug,
      name: product.name,
      price: product.price,
      image: product.image,
      size: requiresSize ? size : null,
      requiresSize,
      stock: product.stock,
      quantity,
    });
    setAdded(true);
  };

  const buttonLabel = !product.available
    ? "Producto agotado"
    : needsSize
      ? "Selecciona tu talla"
      : added
        ? "Añadir otra unidad"
        : "Añadir al carrito";

  return (
    <div className="mt-7 flex flex-col gap-6">
      {sizes.length > 0 ? (
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold tracking-[0.18em] text-coffee-deep uppercase">
              Talla
            </p>
            <span className="text-xs text-muted-foreground">
              Guía de tallas disponible en tienda
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {sizes.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setSize(option);
                  setAdded(false);
                }}
                aria-pressed={size === option}
                disabled={!product.available}
                className={cn(
                  "flex h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  size === option
                    ? "border-carbon bg-carbon text-cream"
                    : "border-border bg-card text-carbon hover:border-carbon",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex h-12 w-fit items-center rounded-lg border border-border bg-card">
          <button
            type="button"
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            disabled={quantity <= 1}
            aria-label="Quitar una unidad"
            className="flex h-11 w-11 items-center justify-center text-carbon disabled:opacity-30"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <span
            className="w-9 text-center text-sm font-semibold [font-variant-numeric:tabular-nums]"
            aria-live="polite"
          >
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((value) => Math.min(20, value + 1))}
            disabled={quantity >= Math.min(20, product.stock || 20)}
            aria-label="Agregar una unidad"
            className="flex h-11 w-11 items-center justify-center text-carbon disabled:opacity-30"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={onAdd}
          aria-disabled={!canAdd}
          className={cn(
            "flex h-12 flex-1 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition-colors",
            canAdd
              ? "bg-carbon text-cream hover:bg-terracotta-deep"
              : "cursor-not-allowed bg-carbon/40 text-cream/80",
          )}
        >
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          {buttonLabel}
        </button>
      </div>

      {product.stock > 0 && product.stock <= 5 ? (
        <p className="text-xs font-medium text-terracotta-deep">
          Quedan {product.stock} {product.stock === 1 ? "unidad" : "unidades"}.
        </p>
      ) : null}

      {added ? (
        <p
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-coffee/25 bg-coffee/5 p-3 text-xs leading-relaxed text-coffee-deep"
        >
          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Añadido al carrito
          {size ? ` (talla ${size})` : ""}.
          <Link
            href="/carrito"
            className="font-semibold text-carbon underline underline-offset-4 hover:text-terracotta-deep"
          >
            Ver carrito
          </Link>
        </p>
      ) : null}
    </div>
  );
}