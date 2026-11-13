"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  LayoutDashboard,
  Mail,
  Package,
  ShieldCheck,
  TrendingUp,
  Truck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminPermission } from "@/types/admin";

// Navegación del panel. Cada sección se filtra por permisos efectivos; las
// fases que aún no tienen página se muestran como «Pronto» para no dejar
// enlaces rotos.

type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: AdminPermission;
  available: boolean;
};

const NAV_ITEMS: AdminNavItem[] = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: LayoutDashboard,
    permission: "orders.read",
    available: true,
  },
  {
    href: "/admin/pedidos",
    label: "Pedidos",
    icon: Package,
    permission: "orders.read",
    available: true,
  },
  {
    href: "/admin/ventas",
    label: "Ventas",
    icon: TrendingUp,
    permission: "orders.read",
    available: false,
  },
  {
    href: "/admin/proveedores",
    label: "Proveedores",
    icon: Truck,
    permission: "providers.manage",
    available: false,
  },
  {
    href: "/admin/usuarios",
    label: "Usuarios",
    icon: Users,
    permission: "users.read",
    available: false,
  },
  {
    href: "/admin/difusion",
    label: "Difusión",
    icon: Mail,
    permission: "campaigns.read",
    available: false,
  },
  {
    href: "/cuenta/notificaciones",
    label: "Notificaciones",
    icon: Bell,
    available: true,
  },
  {
    href: "/admin/perfil",
    label: "Perfil",
    icon: UserRound,
    available: true,
  },
  {
    href: "/admin/perfil/seguridad",
    label: "Seguridad",
    icon: ShieldCheck,
    permission: "audit.read",
    available: false,
  },
];

export function AdminSidebar({
  permissions,
  onNavigate,
}: {
  permissions: AdminPermission[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? "";

  const visible = NAV_ITEMS.filter((item) => {
    if (!item.permission) return true;
    return permissions.includes(item.permission);
  });

  return (
    <div className="flex h-full flex-col gap-6">
      <Link
        href="/admin"
        onClick={onNavigate}
        className="font-heading text-xl font-bold tracking-[0.18em] text-cream"
      >
        UPBUY
        <span className="mt-0.5 block text-[10px] font-semibold tracking-[0.3em] text-terracotta">
          PANEL
        </span>
      </Link>

      <nav aria-label="Secciones del panel" className="flex-1">
        <ul className="flex flex-col gap-1">
          {visible.map((item) => {
            const active =
              item.available &&
              (item.href === "/admin"
                ? pathname === "/admin"
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`));
            const Icon = item.icon;

            if (!item.available) {
              return (
                <li key={item.href}>
                  <span
                    aria-disabled="true"
                    className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-cream/40"
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1">{item.label}</span>
                    <span className="rounded-full border border-cream/15 px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase">
                      Pronto
                    </span>
                  </span>
                </li>
              );
            }

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none",
                    active
                      ? "bg-terracotta text-cream"
                      : "text-cream/75 hover:bg-cream/10 hover:text-cream",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <p className="text-[11px] leading-relaxed text-cream/40">
        El acceso depende de tu rol. La API vuelve a validar cada permiso.
      </p>
    </div>
  );
}
