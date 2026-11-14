"use client";

import { useEffect, useMemo, useRef } from "react";
import { ShoppingBag } from "lucide-react";
import NotificationStack, {
  type StackNotification,
} from "@/components/kokonutui/notification-stack";
import { useAdminOrderStream } from "@/hooks/useAdminOrderStream";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import {
  browserAlertsEnabled,
  browserAlertsSupported,
} from "@/lib/admin-browser-alerts";
import { formatDateTime, formatPrice } from "@/lib/format";
import type { AdminRecentOrder } from "@/types/admin";

// Avisos de compra en vivo dentro del panel. El flujo de datos vive en
// `useAdminOrderStream`; aquí solo se pinta la pila y, si el administrador lo
// activó con un gesto, se lanza la notificación del navegador. Nunca suena.

function clientName(order: AdminRecentOrder): string {
  const user = order.user;
  const fromUser =
    user && [user.name, user.lastName].filter(Boolean).join(" ").trim();
  return fromUser || order.recipientName || user?.email || "Cliente sin nombre";
}

export function PurchaseAlerts() {
  const { alerts, dismissAlert } = useAdminOrderStream();
  const reducedMotion = usePrefersReducedMotion();
  const notifiedRef = useRef<Set<string>>(new Set());

  // Aviso opcional del sistema operativo. Apagado por defecto y sin sonido.
  useEffect(() => {
    const canNotify =
      browserAlertsSupported() &&
      browserAlertsEnabled() &&
      window.Notification.permission === "granted";

    if (!canNotify) {
      // Si está apagado, los avisos actuales no deben dispararse después al
      // activarlo: solo las compras que lleguen desde ese momento.
      for (const order of alerts) notifiedRef.current.add(order.id);
      return;
    }

    for (const order of alerts) {
      if (notifiedRef.current.has(order.id)) continue;
      notifiedRef.current.add(order.id);
      try {
        new window.Notification("Nueva compra en UPBUY", {
          body: `${order.orderNumber} · ${formatPrice(order.total)} · ${clientName(order)}`,
          tag: `upbuy-order-${order.id}`,
          silent: true,
        });
      } catch {
        // El navegador puede bloquear la notificación aunque el permiso exista.
      }
    }
  }, [alerts]);

  const items = useMemo<StackNotification[]>(
    () =>
      alerts.map((order) => ({
        id: order.id,
        app: "Compra web",
        title: `Nueva compra ${order.orderNumber}`,
        body: `${formatPrice(order.total)} · ${clientName(order)}`,
        time: formatDateTime(order.createdAt),
        href: `/admin/pedidos/${order.id}`,
        actionLabel: "Ver pedido",
        icon: (
          <span className="flex size-8 items-center justify-center rounded-lg bg-terracotta text-cream">
            <ShoppingBag className="size-4" aria-hidden="true" />
          </span>
        ),
      })),
    [alerts],
  );

  if (alerts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-50 w-[calc(100vw-2rem)] max-w-sm sm:right-6 sm:bottom-6"
    >
      <div className="pointer-events-auto">
        <NotificationStack
          notifications={items}
          onDismiss={dismissAlert}
          disableMotion={reducedMotion}
        />
      </div>
    </div>
  );
}
