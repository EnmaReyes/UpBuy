"use client";

import { useEffect, useState } from "react";
import { getSessionClient } from "@/services/auth";
import type { AuthUser } from "@/types/auth";

// Sonda de sesión compartida.
//
// El navbar monta dos consumidores a la vez (AccountButton y
// useDashboardRoute) y cada uno pedía `GET /api/auth/me` por su cuenta: dos
// peticiones idénticas por visita con sesión. Aquí la promesa en vuelo se
// comparte y se libera al resolver, de modo que la siguiente navegación
// vuelve a preguntar (sin datos viejos).
let inFlight: Promise<AuthUser | null> | null = null;

export function probeSession(): Promise<AuthUser | null> {
  if (!inFlight) {
    inFlight = getSessionClient()
      .catch(() => null)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export function useSessionProbe(): {
  user: AuthUser | null;
  /** true mientras la sonda no termina. */
  loading: boolean;
} {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    probeSession().then((session) => {
      if (!active) return;
      setUser(session);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  return { user, loading };
}
