"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Laptop, LogOut, ShieldAlert } from "lucide-react";
import {
  revokeAdminSession,
  revokeAllAdminSessions,
} from "@/services/admin/security.actions";
import { clearSessionMarker } from "@/lib/session-marker";
import { formatDateTime } from "@/lib/format";
import type { AdminSessionInfo } from "@/types/admin";

// Sesiones activas (ADM-S1).
//
// Cerrar una sesión distinta a la actual no afecta a este navegador; cerrar la
// actual (o todas) invalida la cookie y devuelve al login. La confirmación es
// explícita y en dos pasos dentro de la propia fila para evitar clics
// accidentales sin usar diálogos nativos del navegador.

function describeAgent(userAgent: string | null): string {
  if (!userAgent) return "Dispositivo desconocido";

  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\/|Opera/.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : null;

  const system = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iPod/.test(userAgent)
      ? "iOS"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;

  if (browser && system) return `${browser} · ${system}`;
  if (browser) return browser;
  if (system) return system;
  return "Dispositivo desconocido";
}

export function ActiveSessionsCard({
  sessions,
}: {
  sessions: AdminSessionInfo[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goToLogin = () => {
    clearSessionMarker();
    router.replace("/login?next=/admin/perfil/seguridad");
    router.refresh();
  };

  const onRevoke = async (session: AdminSessionInfo) => {
    setBusyId(session.id);
    setError(null);
    try {
      const result = await revokeAdminSession(session.id);
      if (result.current) {
        goToLogin();
        return;
      }
      setConfirmId(null);
      router.refresh();
    } catch {
      setError("No se pudo cerrar la sesión. Inténtalo de nuevo.");
    } finally {
      setBusyId(null);
    }
  };

  const onRevokeAll = async () => {
    setRevokingAll(true);
    setError(null);
    try {
      await revokeAllAdminSessions();
      goToLogin();
    } catch {
      setError("No se pudieron cerrar las sesiones. Inténtalo de nuevo.");
      setRevokingAll(false);
    }
  };

  return (
    <section
      aria-labelledby="active-sessions-title"
      className="rounded-xl border border-border bg-card p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-terracotta/10 text-terracotta-deep">
            <Laptop className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2
              id="active-sessions-title"
              className="font-heading text-base font-semibold text-carbon"
            >
              Sesiones activas
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {sessions.length === 1
                ? "Solo hay una sesión abierta: la de este navegador."
                : `${sessions.length} sesiones abiertas. Cierra las que no reconozcas.`}
            </p>
          </div>
        </div>
      </div>

      <ul className="mt-4 flex flex-col divide-y divide-border">
        {sessions.map((session) => {
          const confirming = confirmId === session.id;
          const busy = busyId === session.id;

          return (
            <li
              key={session.id}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-carbon">
                  {describeAgent(session.userAgent)}
                  {session.current ? (
                    <span className="rounded-full bg-carbon px-2 py-0.5 text-[10px] font-semibold tracking-wide text-cream uppercase">
                      Esta sesión
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-coffee-deep">
                  {session.ip ? `IP ${session.ip} · ` : ""}
                  Última actividad {formatDateTime(session.lastSeenAt ?? session.createdAt)}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Inició {formatDateTime(session.createdAt)} · vence{" "}
                  {formatDateTime(session.expiresAt)}
                </p>
              </div>

              {confirming ? (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => void onRevoke(session)}
                    disabled={busy}
                    className="inline-flex h-9 items-center rounded-lg bg-terracotta-deep px-3 text-xs font-semibold text-cream transition-colors hover:bg-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                  >
                    {busy ? "Cerrando…" : "Confirmar cierre"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    disabled={busy}
                    className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-xs font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmId(session.id)}
                  disabled={Boolean(busyId) || revokingAll}
                  aria-label={`Cerrar la sesión de ${describeAgent(session.userAgent)}`}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg border border-border bg-background px-3 text-xs font-semibold text-carbon transition-colors hover:border-terracotta hover:text-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60 sm:self-auto"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  Cerrar
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-sm text-terracotta-deep"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-4 border-t border-border pt-4">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-coffee-deep">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Cerrar todas las sesiones también cierra esta. Tendrás que iniciar
          sesión y verificar el segundo factor de nuevo.
        </p>

        {confirmAll ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onRevokeAll()}
              disabled={revokingAll}
              className="inline-flex h-10 items-center rounded-lg bg-terracotta-deep px-4 text-sm font-semibold text-cream transition-colors hover:bg-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
            >
              {revokingAll ? "Cerrando…" : "Sí, cerrar todas"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmAll(false)}
              disabled={revokingAll}
              className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmAll(true)}
            disabled={Boolean(busyId)}
            className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-carbon transition-colors hover:border-terracotta hover:text-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Cerrar todas las sesiones
          </button>
        )}
      </div>
    </section>
  );
}
