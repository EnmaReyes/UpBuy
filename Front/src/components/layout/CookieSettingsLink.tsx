"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { CONSENT_OPEN_EVENT } from "@/lib/consent";

const COOKIE_PREFERENCES_HREF = "/preferencias-de-cookies#preferencias";

// Enlace del pie de página. Si el usuario ya está en la página de cookies, el
// ancla lo lleva al panel; en cualquier otra página reabre el aviso sin
// recargar. Sin JavaScript sigue siendo un enlace válido a la política.
export function CookieSettingsLink({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0 ||
      pathname === "/preferencias-de-cookies"
    ) {
      return;
    }

    event.preventDefault();
    window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
  };

  return (
    <Link href={COOKIE_PREFERENCES_HREF} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}
