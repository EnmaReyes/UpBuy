"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { getUnreadCount } from "@/services/notifications";
import { hasSessionMarker } from "@/lib/session-marker";

// Campana del navbar con contador de no leídas.
//
// Solo se muestra si el navegador tiene el marcador de sesión, así que las
// visitas anónimas no hacen peticiones ni ven el icono. El contador se
// refresca al navegar, al volver a la pestaña y cuando la bandeja marca o
// elimina algo (evento `upbuy:notifications-changed`).
export function NotificationButton() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!hasSessionMarker()) {
      setVisible(false);
      setCount(0);
      return;
    }

    setVisible(true);
    let active = true;

    const load = () => {
      getUnreadCount().then((value) => {
        if (active) setCount(value);
      });
    };

    load();
    window.addEventListener("upbuy:notifications-changed", load);
    window.addEventListener("focus", load);

    return () => {
      active = false;
      window.removeEventListener("upbuy:notifications-changed", load);
      window.removeEventListener("focus", load);
    };
  }, [pathname]);

  if (!visible) return null;

  const label =
    count > 0
      ? `Notificaciones, ${count} sin leer`
      : "Notificaciones";

  return (
    <Link
      href="/cuenta/notificaciones"
      aria-label={label}
      title={label}
      className="relative flex h-10 w-10 items-center justify-center rounded-lg text-cream transition-colors hover:bg-cream/10"
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {count > 0 ? (
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
