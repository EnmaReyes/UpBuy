"use client";

import { useState } from "react";
import { Check, Minus, Plus, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/mock-data";

// Panel de compra. La selección de talla/color y la cantidad ya funcionan; el
// carrito real es FASE 5 y depende del backend, así que el botón explica el
// estado en lugar de simular una compra.
export function ProductPurchasePanel({ product }: { product: Product }) {
  const [size, setSize] = useState<string | null>(
    product.sizes.length === 1 ? product.sizes[0] : null,
  );
  const [color, setColor] = useState(product.colors[0]?.name ?? null);
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState(false);

  const canAdd = Boolean(size);

  const onAdd = () => {
    if (!canAdd) return;
    setNotice(true);
  };

  return (
    <div className="mt-7 flex flex-col gap-6">
      {/* Color */}
      {product.colors.length > 0 ? (
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold tracking-[0.18em] text-coffee-deep uppercase">
              Color
            </p>
            <p className="text-xs text-muted-foreground">{color}</p>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {product.colors.map((option) => (
              <button
                key={option.name}
                type="button"
                onClick={() => setColor(option.name)}
                aria-label={`Color ${option.name}`}
                aria-pressed={color === option.name}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors",
                  color === option.name ? "border-carbon" : "border-transparent hover:border-coffee/40",
                )}
              >
                <span
                  aria-hidden="true"
                  className="h-6 w-6 rounded-full border border-black/10"
                  style={{ backgroundColor: option.hex }}
                />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Talla */}
      <div>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold tracking-[0.18em] text-coffee-deep uppercase">
            Talla
          </p>
          <span className="text-xs text-muted-foreground">Guía de tallas disponible en tienda</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {product.sizes.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setSize(option);
                setNotice(false);
              }}
              aria-pressed={size === option}
              className={cn(
                "flex h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors",
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

      {/* Cantidad + CTA */}
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
            onClick={() => setQuantity((value) => Math.min(10, value + 1))}
            disabled={quantity >= 10}
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
          {canAdd ? "Añadir al carrito" : "Selecciona tu talla"}
        </button>
      </div>

      {notice ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-terracotta/25 bg-terracotta/5 p-3 text-xs leading-relaxed text-coffee-deep"
        >
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-terracotta-deep" aria-hidden="true" />
          Carrito en preparación: el backend todavía está cerrando la conexión de proveedores.
          La pieza ({size}, {color}, {quantity} {quantity === 1 ? "unidad" : "unidades"}) no se
          agregó a ningún pedido.
        </p>
      ) : null}
    </div>
  );
}
