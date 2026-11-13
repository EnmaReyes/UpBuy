"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// Carrito local.
//
// El carrito vive en el navegador (localStorage) porque el backend no expone
// un carrito persistente: los precios y el stock se validan al crear el pedido
// (`POST /api/orders`). Aquí solo se guarda lo mínimo para poder mostrar y
// armar ese pedido.
//
// La lectura del almacenamiento ocurre en un efecto para que el primer render
// coincida con el del servidor (sin errores de hidratación).

export type CartItem = {
  productId: string;
  slug: string | null;
  name: string;
  price: number;
  image: string | null;
  size: string | null;
  quantity: number;
  requiresSize: boolean;
  stock: number;
};

export type AddToCartInput = Omit<CartItem, "quantity"> & {
  quantity?: number;
};

type CartContextValue = {
  items: CartItem[];
  /** `true` cuando ya se leyó localStorage (evita parpadeos y desajustes). */
  hydrated: boolean;
  count: number;
  subtotal: number;
  add: (item: AddToCartInput) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};

const STORAGE_KEY = "upbuy.cart.v1";
export const MAX_QUANTITY = 20;

/** Tope de una linea: unidades reales del producto, con el limite por pedido. */
export const maxQuantityForStock = (stock: number) =>
  stock > 0 ? Math.min(Math.round(stock), MAX_QUANTITY) : MAX_QUANTITY;

const CartContext = createContext<CartContextValue | null>(null);

export function cartKey(item: { productId: string; size: string | null }) {
  return `${item.productId}::${item.size ?? ""}`;
}

const clampQuantity = (quantity: number, stock: number) => {
  return Math.max(
    1,
    Math.min(Math.round(quantity) || 1, maxQuantityForStock(stock)),
  );
};

const sanitize = (value: unknown): CartItem[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;

    if (typeof item.productId !== "string" || typeof item.name !== "string") {
      return [];
    }

    return [
      {
        productId: item.productId,
        slug: typeof item.slug === "string" ? item.slug : null,
        name: item.name,
        price: Number(item.price) || 0,
        image: typeof item.image === "string" ? item.image : null,
        size: typeof item.size === "string" ? item.size : null,
        quantity: clampQuantity(Number(item.quantity) || 1, Number(item.stock) || 0),
        requiresSize: Boolean(item.requiresSize),
        stock: Number(item.stock) || 0,
      },
    ];
  });
};

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(sanitize(JSON.parse(raw)));
    } catch {
      // Almacenamiento corrupto o bloqueado: se arranca con carrito vacío.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Sin almacenamiento el carrito funciona en memoria durante la sesión.
    }
  }, [items, hydrated]);

  const add = useCallback((input: AddToCartInput) => {
    setItems((current) => {
      const key = cartKey(input);
      const quantity = clampQuantity(input.quantity ?? 1, input.stock);
      const index = current.findIndex((item) => cartKey(item) === key);

      if (index === -1) {
        return [...current, { ...input, quantity }];
      }

      const next = [...current];
      next[index] = {
        ...next[index],
        ...input,
        quantity: clampQuantity(next[index].quantity + quantity, input.stock),
      };
      return next;
    });
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setItems((current) =>
      current.map((item) =>
        cartKey(item) === key
          ? { ...item, quantity: clampQuantity(quantity, item.stock) }
          : item,
      ),
    );
  }, []);

  const remove = useCallback((key: string) => {
    setItems((current) => current.filter((item) => cartKey(item) !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((total, item) => total + item.quantity, 0);
    const subtotal = items.reduce(
      (total, item) => total + item.price * item.quantity,
      0,
    );

    return {
      items,
      hydrated,
      count,
      subtotal,
      add,
      setQuantity,
      remove,
      clear,
    };
  }, [items, hydrated, add, setQuantity, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart debe usarse dentro de <CartProvider>");
  }
  return context;
}