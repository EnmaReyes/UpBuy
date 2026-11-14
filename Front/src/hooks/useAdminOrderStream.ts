"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGetOptional } from "@/services/api/client";
import type {
  AdminRecentOrder,
  AdminRecentOrdersResult,
} from "@/types/admin";

// Avisos de compra en vivo (ADM-5).
//
// - Polling cada 30 s SOLO con la pestaña visible. Al ocultarla se cancela el
//   temporizador y al volver se consulta de inmediato.
// - La primera respuesta es la línea base: guarda los ids vistos y `serverTime`
//   sin mostrar avisos, para que recargar el panel no dispare alertas viejas.
// - `serverTime` sale del servidor, no del reloj del navegador, así que un
//   equipo desfasado no se salta compras.
// - La deduplicación es por `id` en un `Set` que sobrevive a cada render.

const POLL_MS = 30_000;
const MAX_ALERTS = 5;

export type AdminOrderStream = {
  alerts: AdminRecentOrder[];
  dismissAlert: (id: string) => void;
  dismissAll: () => void;
};

export function useAdminOrderStream(): AdminOrderStream {
  const [alerts, setAlerts] = useState<AdminRecentOrder[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const sinceRef = useRef<string | null>(null);
  const baselineRef = useRef(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const fetchRecent = async () => {
      if (!active || document.visibilityState !== "visible") return;

      const path = sinceRef.current
        ? `/api/admin/orders/recent?since=${encodeURIComponent(sinceRef.current)}`
        : "/api/admin/orders/recent";

      const data =
        await apiGetOptional<AdminRecentOrdersResult>(path);
      if (!active || !data) return;

      if (typeof data.serverTime === "string" && data.serverTime) {
        sinceRef.current = data.serverTime;
      }

      const fresh = data.orders.filter(
        (order) => !seenRef.current.has(order.id),
      );
      for (const order of data.orders) seenRef.current.add(order.id);

      if (baselineRef.current && fresh.length > 0) {
        // `recent` llega en orden ascendente; la pila muestra lo nuevo arriba.
        setAlerts((previous) =>
          [...fresh.slice().reverse(), ...previous].slice(0, MAX_ALERTS),
        );
        // La campana vuelve a pedir el contador de no leídas.
        window.dispatchEvent(new Event("upbuy:notifications-changed"));
      }

      // La primera consulta solo establece la línea base.
      baselineRef.current = true;
    };

    const schedule = () => {
      clearTimer();
      if (!active || document.visibilityState !== "visible") return;
      timer = setTimeout(async () => {
        await fetchRecent();
        schedule();
      }, POLL_MS);
    };

    const start = () => {
      if (!active || document.visibilityState !== "visible") return;
      clearTimer();
      void fetchRecent().finally(schedule);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        start();
      } else {
        clearTimer();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setAlerts((previous) => previous.filter((order) => order.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setAlerts([]);
  }, []);

  return { alerts, dismissAlert, dismissAll };
}
