"use client";

import { useEffect, useState } from "react";
import { getSessionClient } from "@/services/auth";
import { getDashboardRoute } from "@/lib/dashboard-route";
import type { AuthUser } from "@/types/auth";

// Ruta del dashboard para enlaces del cliente. Sonda la sesión una vez
// (mismo patrón que AccountButton) y devuelve `null` mientras no se sabe:
// el enlace cae a su fallback sin redirecciones prematuras.

export function useDashboardRoute(): {
  user: AuthUser | null;
  /** true mientras la sonda de sesión no termina. */
  loading: boolean;
  /** href según el rol, o null si aún no se sabe. */
  dashboardHref: string | null;
} {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    getSessionClient().then((session) => {
      if (active) {
        setUser(session);
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return {
    user,
    loading,
    dashboardHref: loading ? null : getDashboardRoute(user),
  };
}
