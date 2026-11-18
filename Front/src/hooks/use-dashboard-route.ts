"use client";

import { getDashboardRoute } from "@/lib/dashboard-route";
import { useSessionProbe } from "@/hooks/use-session-probe";

// Ruta del dashboard para enlaces del cliente. Comparte la sonda de sesión con
// AccountButton (una sola petición por carga) y devuelve `null` mientras no se
// sabe: el enlace cae a su fallback sin redirecciones prematuras.

export function useDashboardRoute(): {
  user: ReturnType<typeof useSessionProbe>["user"];
  /** true mientras la sonda de sesión no termina. */
  loading: boolean;
  /** href según el rol, o null si aún no se sabe. */
  dashboardHref: string | null;
} {
  const { user, loading } = useSessionProbe();

  return {
    user,
    loading,
    dashboardHref: loading ? null : getDashboardRoute(user),
  };
}
