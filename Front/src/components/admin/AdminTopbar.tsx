"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, LogOut, Menu, UserRound } from "lucide-react";
import { logout } from "@/services/auth";
import { getUnreadCount } from "@/services/notifications";
import { hasSessionMarker } from "@/lib/session-marker";
import { ADMIN_ROLE_LABELS, type AdminProfile } from "@/types/admin";

// Barra superior del panel: menú móvil, campana y menú de cuenta.
// El nombre y el rol salen de `GET /api/admin/me` (server-side), nunca del JWT.

const SECTION_TITLES: { prefix: string; title: string }[] = [
  { prefix: "/admin/perfil", title: "Perfil" },
  { prefix: "/admin/pedidos", title: "Pedidos" },
  { prefix: "/admin/ventas", title: "Ventas" },
  { prefix: "/admin/proveedores", title: "Proveedores" },
  { prefix: "/admin/usuarios", title: "Usuarios" },
  { prefix: "/admin/difusion", title: "Difusión" },
  { prefix: "/admin", title: "Dashboard" },
];

function sectionTitle(pathname: string): string {
  return (
    SECTION_TITLES.find(
      (item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`),
    )?.title ?? "Panel"
  );
}

function displayName(admin: AdminProfile): string {
  const full = [admin.name, admin.lastName].filter(Boolean).join(" ").trim();
  return full || admin.username || admin.email;
}

function initials(admin: AdminProfile): string {
  const source = admin.name?.trim() || admin.username || admin.email;
  const parts = source.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "U").concat(parts[1]?.[0] ?? "").toUpperCase();
}

export function AdminTopbar({
  admin,
  onMenuClick,
}: {
  admin: AdminProfile;
  onMenuClick: () => void;
}) {
  const pathname = usePathname() ?? "";
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!hasSessionMarker()) return;
    let active = true;
    const load = () => {
      getUnreadCount().then((count) => {
        if (active) setUnread(count);
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

  const onLogout = async () => {
    try {
      await logout();
    } catch {
      // Aunque falle, se sale igual: la cookie se limpia cuando pueda.
    }
    window.location.assign("/login");
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Abrir menú del panel"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-carbon transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="min-w-0">
        <p className="truncate font-heading text-sm font-semibold text-carbon">
          {sectionTitle(pathname)}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {ADMIN_ROLE_LABELS[admin.role] ?? admin.role}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <Link
          href="/cuenta/notificaciones"
          aria-label={
            unread > 0
              ? `Notificaciones, ${unread} sin leer`
              : "Notificaciones"
          }
          title="Notificaciones"
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-coffee-deep transition-colors hover:bg-muted hover:text-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-bold text-cream [font-variant-numeric:tabular-nums]"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Link>

        <details className="group relative">
          <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-sm text-carbon transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-carbon text-xs font-bold text-cream"
            >
              {initials(admin)}
            </span>
            <span className="hidden max-w-40 truncate font-medium sm:inline">
              {displayName(admin)}
            </span>
            <ChevronDown
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>

          <div className="absolute right-0 mt-2 w-64 rounded-xl border border-border bg-card p-2 shadow-xl">
            <div className="border-b border-border px-3 py-2">
              <p className="truncate text-sm font-semibold text-carbon">
                {displayName(admin)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {admin.email}
              </p>
              <p className="mt-1 text-[11px] font-semibold tracking-wide text-terracotta-deep uppercase">
                {ADMIN_ROLE_LABELS[admin.role] ?? admin.role}
              </p>
            </div>

            <Link
              href="/admin/perfil"
              className="mt-1 flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-carbon transition-colors hover:bg-muted"
            >
              <UserRound className="h-4 w-4" aria-hidden="true" />
              Mi perfil
            </Link>

            <button
              type="button"
              onClick={onLogout}
              className="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-carbon transition-colors hover:bg-muted"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Cerrar sesión
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
