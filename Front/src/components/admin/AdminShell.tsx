"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";
import type { AdminProfile } from "@/types/admin";

// Shell del panel: sidebar fija en escritorio y drawer accesible en móvil.
// El layout del servidor ya validó la sesión; aquí solo se pinta.

export function AdminShell({
  admin,
  children,
}: {
  admin: AdminProfile;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-[#F7F2EA]">
      <a
        href="#admin-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-carbon focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-cream"
      >
        Saltar al contenido
      </a>

      {/* Sidebar de escritorio */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-carbon p-5 lg:flex">
        <AdminSidebar permissions={admin.permissions} />
      </aside>

      {/* Drawer móvil */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-carbon/60"
          />
          <aside
            id="admin-mobile-menu"
            className="relative flex h-full w-72 max-w-[85vw] flex-col bg-carbon p-5 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Cerrar menú"
              className="absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-lg text-cream/70 transition-colors hover:bg-cream/10 hover:text-cream"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <AdminSidebar
              permissions={admin.permissions}
              onNavigate={() => setMenuOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <AdminTopbar admin={admin} onMenuClick={() => setMenuOpen(true)} />
        <main id="admin-content" className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
