"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  cartKey,
  maxQuantityForStock,
  useCart,
} from "@/context/cart-context";
import { AddToCartButton } from "@/components/kokonutui/cart-button";

type PurchaseVariant = {
  id: string;
  size: string | null;
  color: string | null;
  stock: number;
  available: boolean;
  sku: string | null;
};

type PurchaseProduct = {
  productId: string;
  slug: string | null;
  name: string;
  price: number;
  image: string | null;
  sizes: string[];
  colors: string[];
  variants: PurchaseVariant[];
  available: boolean;
  stock: number;
  combo: boolean;
};

// Paleta de referencia para los swatches. Un color que no esté aquí se
// dibuja con un círculo neutro: nunca se inventa un hex.
const COLOR_SWATCHES: Record<string, string> = {
  NEGRO: "#0B0B0B",
  BLANCO: "#FFFFFF",
  CREMA: "#F5E9D7",
  BEIGE: "#D9C9B3",
  GRIS: "#7F8C8D",
  ROJO: "#C0392B",
  VINOTINTO: "#6B1E2E",
  BURDEOS: "#6B1E2E",
  ROSA: "#E91E63",
  ROSADO: "#E91E63",
  NARANJA: "#D35400",
  TERRACOTA: "#D35400",
  AMARILLO: "#F1C40F",
  VERDE: "#1E7A46",
  AZUL: "#2C3E50",
  "AZUL MARINO": "#1B2A49",
  MARINO: "#1B2A49",
  MORADO: "#6C3483",
  CAFE: "#6E4B3A",
  MARRON: "#6E4B3A",
};

const normalize = (value: string | null | undefined) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const swatchColor = (value: string) => COLOR_SWATCHES[normalize(value)] ?? null;

const sameValue = (a: string | null | undefined, b: string | null | undefined) =>
  normalize(a) === normalize(b) && normalize(a) !== "";

// Panel de compra. El color y la talla se eligen aquí y el producto se añade
// al carrito local. El precio y el stock definitivos los valida el backend al
// crear el pedido: el carrito nunca calcula el total final.
export function ProductPurchasePanel({ product }: { product: PurchaseProduct }) {
  const { items, add, setQuantity, remove } = useCart();
  const router = useRouter();

  const sizes = product.combo ? [] : product.sizes;
  const colors = product.combo ? [] : product.colors;
  const variants = product.combo ? [] : product.variants;

  const requiresSize = sizes.length > 0;
  const requiresColor = colors.length > 0;
  const hasVariants = variants.length > 0;

  const [size, setSize] = useState<string | null>(
    sizes.length === 1 ? sizes[0] : null,
  );
  const [color, setColor] = useState<string | null>(
    colors.length === 1 ? colors[0] : null,
  );
  const [added, setAdded] = useState(false);

  // Tallas disponibles para el color elegido (según las variantes reales).
  const sizeAvailable = (option: string) => {
    if (!hasVariants || !requiresColor || !color) return true;
    const variant = variants.find(
      (item) => sameValue(item.color, color) && sameValue(item.size, option),
    );
    return Boolean(variant && variant.available && variant.stock > 0);
  };

  const selectedVariant = hasVariants
    ? variants.find(
        (item) =>
          (!requiresColor || sameValue(item.color, color)) &&
          (!requiresSize || sameValue(item.size, size)),
      ) ?? null
    : null;

  const needsSize = requiresSize && !size;
  const needsColor = requiresColor && !color;

  // Stock de la combinación elegida. Sin variantes se usa el stock agregado.
  const stock = hasVariants ? selectedVariant?.stock ?? 0 : product.stock;
  const combinationAvailable = hasVariants
    ? Boolean(selectedVariant?.available && selectedVariant.stock > 0)
    : product.available && product.stock > 0;
  const available = combinationAvailable && !needsSize && !needsColor;
  const canAdd = available;
  const max = maxQuantityForStock(hasVariants ? stock : product.stock);

  const lineSize = requiresSize ? size : null;
  const lineColor = requiresColor ? color : null;
  const lineKey = cartKey({
    productId: product.productId,
    size: lineSize,
    color: lineColor,
  });
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
        color: lineColor,
        requiresSize,
        requiresColor,
        stock,
        quantity: next,
      });
    }
    setAdded(true);
  };

  // Compra directa: deja una unidad de esta variante en el carrito y va al
  // checkout sin obligar a pasar por la pagina del carrito. El backend valida
  // precio, stock, sesión y perfil; aquí no se decide nada de autenticación.
  const onBuyNow = () => {
    if (!canAdd) return;

    if (!current) {
      add({
        productId: product.productId,
        slug: product.slug,
        name: product.name,
        price: product.price,
        image: product.image,
        size: lineSize,
        color: lineColor,
        requiresSize,
        requiresColor,
        stock,
        quantity: 1,
      });
    }

    router.push("/checkout");
  };

  const selectColor = (next: string) => {
    setColor(next);
    // Si la talla elegida no existe en el nuevo color, se limpia.
    if (requiresSize && size && hasVariants) {
      const stillValid = variants.some(
        (item) => sameValue(item.color, next) && sameValue(item.size, size),
      );
      if (!stillValid) setSize(null);
    }
    setAdded(false);
  };

  const placeholder = !product.available
    ? "Producto agotado"
    : needsColor && needsSize
      ? "Selecciona color y talla"
      : needsColor
        ? "Selecciona tu color"
        : needsSize
          ? "Selecciona tu talla"
          : "Combinación agotada";

  const selectionLabel = [
    lineColor ? `color ${lineColor}` : null,
    lineSize ? `talla ${lineSize}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mt-7 flex flex-col gap-6">
      {colors.length > 0 ? (
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-coffee-deep uppercase">
            Color
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {colors.map((option) => {
              const selected = sameValue(color, option);
              const hex = swatchColor(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => selectColor(option)}
                  aria-pressed={selected}
                  aria-label={`Color: ${option}`}
                  className={cn(
                    "flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors",
                    selected
                      ? "border-carbon bg-carbon text-cream"
                      : "border-border bg-card text-carbon hover:border-carbon",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="h-5 w-5 shrink-0 rounded-full border border-black/15"
                    style={{
                      backgroundColor: hex ?? "transparent",
                      backgroundImage: hex
                        ? undefined
                        : "linear-gradient(135deg, #EDE0CE 0%, #D9C9B3 100%)",
                    }}
                  />
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

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
            {sizes.map((option) => {
              const enabled = sizeAvailable(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setSize(option);
                    setAdded(false);
                  }}
                  aria-pressed={size === option}
                  disabled={!product.available || !enabled}
                  className={cn(
                    "flex h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    size === option
                      ? "border-carbon bg-carbon text-cream"
                      : "border-border bg-card text-carbon hover:border-carbon",
                  )}
                >
                  {option}
                </button>
              );
            })}
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
            {placeholder}
          </button>
        )}
      </div>

      {canAdd ? (
        <button
          type="button"
          onClick={onBuyNow}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-terracotta px-6 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta sm:w-auto"
        >
          Comprar ahora
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}

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
          {selectionLabel ? ` (${selectionLabel})` : ""}.
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
