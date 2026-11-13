"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { User } from "lucide-react";
import { getSessionClient } from "@/services/auth";
import type { AuthUser } from "@/types/auth";

// Acceso a la cuenta en el navbar.
//
// La sesión se consulta en el cliente para que las páginas públicas (Home,
// catálogo) sigan siendo estáticas. Mientras no se sabe, se muestra el estado
// "sin sesión": el único cambio es el texto, nunca el tamaño ni el layout.
export function AccountButton({ className }: { className?: string }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;

    getSessionClient().then((session) => {
      if (active) setUser(session);
    });

    return () => {
      active = false;
    };
  }, []);

  const label = user ? firstName(user) : "Ingresar";
  const href = user ? "/cuenta/perfil" : "/login";
  // El nombre accesible debe contener el texto visible (regla
  // `label-content-name-mismatch`), por eso concatena `label`.
  const ariaLabel = user ? `Mi cuenta — ${label}` : "Ingresar";

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={
        className ??
        "flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-2 text-cream transition-colors hover:bg-cream/10"
      }
    >
      <User className="h-5 w-5 shrink-0" aria-hidden="true" />
      {/* La etiqueta aparece solo cuando hay sitio para ella: en 1024-1279 px
          ensancharía las acciones y descentraría el Split Nav. */}
      <span className="hidden text-xs font-semibold tracking-wide uppercase xl:inline">
        {label}
      </span>
    </Link>
  );
}

function firstName(user: AuthUser): string {
  const name = user.name?.trim();
  if (name) return name.split(/\s+/)[0];
  return user.username?.trim() || "Mi cuenta";
}