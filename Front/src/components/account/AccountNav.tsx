"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MapPin, Package, UserRound, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

// Navegación del área de cuenta.
const ITEMS = [
  { href: "/cuenta/perfil", label: "Perfil", icon: UserRound },
  { href: "/cuenta/direcciones", label: "Direcciones", icon: MapPin },
  { href: "/cuenta/pedidos", label: "Pedidos", icon: Package },
  { href: "/cuenta/notificaciones", label: "Notificaciones", icon: Bell },
];

export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones de la cuenta">
      <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-2.5 rounded-lg px-4 text-sm font-medium transition-colors",
                  active
                    ? "bg-carbon text-cream"
                    : "text-carbon hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
