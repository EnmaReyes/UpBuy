"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  cartKey,
  maxQuantityForStock,
  useCart,
} from "@/context/cart-context";
import { AddToCartButton } from "@/components/kokonutui/cart-button";

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
  const { items, add, setQuantity, remove } = useCart();

  // La talla es una medida: solo se pide si el producto tiene tallas y no es
  // un combo. Es la misma regla que aplica el backend al crear el pedido.
  const sizes = product.combo ? [] : product.sizes;
  const requiresSize = sizes.length > 0;

  const [size, setSize] = useState<string | null>(
    sizes.length === 1 ? sizes[0] : null,
  );
  const [added, setAdded] = useState(false);

  const needsSize = requiresSize && !size;
  const stock = product.stock;
  const available = product.available && stock > 0;
  const canAdd = available && !needsSize;
  const max = maxQuantityForStock(stock);

  const lineSize = requiresSize ? size : null;
  const lineKey = cartKey({ productId: product.productId, size: lineSize });
  const current = items.find((item) => cartKey(item) === lineKey);
  const quantityInCart = current?.quantity ?? 0;

  const onQuantityChange = (next: number) => {
    if (!canAdd) return;

    if (next <= 0) {
      if (current) remove(lineKey);
      setAdded(false);
      return;
    }

    if (current) {
      setQuantity(lineKey, next);
    } else {
      add({
        productId: product.productId,
        slug: product.slug,
        name: product.name,
        price: product.price,
        image: product.image,
        size: lineSize,
        requiresSize,
        stock,
        quantity: next,
      });
    }
    setAdded(true);
  };

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {canAdd ? (
          <div className="flex h-12 items-center gap-3">
            <AddToCartButton
              max={max}
              name={product.name}
              onQuantityChange={onQuantityChange}
              quantity={quantityInCart}
            />
            <span className="text-xs leading-relaxed text-muted-foreground">
              {quantityInCart > 0
                ? `${quantityInCart} en el carrito`
                : "Elige la cantidad y añádela al carrito"}
            </span>
          </div>
        ) : (
          <button
            type="button"
            disabled
            className="flex h-12 flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-full bg-carbon/40 px-6 text-sm font-semibold text-cream/80"
          >
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            {!available ? "Producto agotado" : "Selecciona tu talla"}
          </button>
        )}
      </div>

      {stock > 0 && stock <= 5 ? (
        <p className="text-xs font-medium text-terracotta-deep">
          Quedan {stock} {stock === 1 ? "unidad" : "unidades"}.
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