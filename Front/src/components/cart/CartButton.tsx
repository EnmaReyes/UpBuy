"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/context/cart-context";

// Icono del carrito con contador. El número solo aparece tras leer
// localStorage, para no provocar un desajuste de hidratación.
export function CartButton() {
  const { count, hydrated } = useCart();
  const hasItems = hydrated && count > 0;

  return (
    <Link
      href="/carrito"
      aria-label={
        hasItems
          ? `Carrito, ${count} ${count === 1 ? "producto" : "productos"}`
          : "Carrito"
      }
      title="Carrito"
      className="relative flex h-11 w-11 items-center justify-center rounded-xl text-cream transition-colors hover:bg-cream/10"
    >
      <ShoppingBag className="h-5 w-5" aria-hidden="true" />
      {hasItems ? (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-bold text-cream [font-variant-numeric:tabular-nums]"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}