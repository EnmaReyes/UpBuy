"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

let cachedQuery: MediaQueryList | null = null;

function getMediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  if (!cachedQuery) cachedQuery = window.matchMedia(QUERY);
  return cachedQuery;
}

function subscribe(callback: () => void) {
  const mediaQuery = getMediaQuery();
  if (!mediaQuery) return () => {};

  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return getMediaQuery()?.matches ?? false;
}

// El servidor (y la primera pasada de hidratación) siempre devuelven `false`.
// Así el HTML generado coincide exactamente con el primer render del cliente
// y no se produce un error de hidratación; React actualiza el valor real
// justo después de hidratar.
function getServerSnapshot(): boolean {
  return false;
}

// Versión hydration-safe de `useReducedMotion` de Motion.
// El hook de Motion lee la preferencia durante el render, por lo que devuelve
// `false` en el servidor y el valor real en el cliente: si esa diferencia
// altera el árbol renderizado, React registra un error de hidratación para
// los usuarios que prefieren menos movimiento.
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
