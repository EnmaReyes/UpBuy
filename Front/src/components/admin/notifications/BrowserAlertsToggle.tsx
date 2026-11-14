"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff } from "lucide-react";
import {
  browserAlertsEnabled,
  browserAlertsSupported,
  setBrowserAlertsEnabled,
} from "@/lib/admin-browser-alerts";

// Preferencia de notificaciones del navegador. Apagada por defecto: solo se
// pide permiso con un clic explícito y se guarda en localStorage (`upbuy.*`).

export function BrowserAlertsToggle() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setSupported(browserAlertsSupported());
    setEnabled(browserAlertsEnabled());
  }, []);

  if (!supported) return null;

  const onClick = async () => {
    setMessage(null);

    if (enabled) {
      setBrowserAlertsEnabled(false);
      setEnabled(false);
      setMessage("Avisos del navegador desactivados.");
      return;
    }

    setPending(true);
    try {
      const permission = await window.Notification.requestPermission();
      if (permission === "granted") {
        setBrowserAlertsEnabled(true);
        setEnabled(true);
        setMessage("Avisos del navegador activados.");
      } else {
        setBrowserAlertsEnabled(false);
        setEnabled(false);
        setMessage(
          "El navegador no dio permiso. Puedes habilitarlo desde la configuración del sitio.",
        );
      }
    } catch {
      setMessage("No se pudo pedir permiso al navegador.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-sm font-semibold text-carbon">
            Avisos del navegador
          </p>
          <p className="mt-1 max-w-md text-sm text-coffee-deep">
            Opcional. Muestra una notificación del sistema cuando entra una
            compra web, incluso si el panel no tiene el foco. No reproduce
            sonido.
          </p>
        </div>
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          aria-pressed={enabled}
          className={[
            "inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
            enabled
              ? "border-carbon bg-carbon text-cream hover:bg-terracotta-deep"
              : "border-border bg-background text-carbon hover:border-carbon",
          ].join(" ")}
        >
          {enabled ? (
            <BellRing className="h-4 w-4" aria-hidden="true" />
          ) : (
            <BellOff className="h-4 w-4" aria-hidden="true" />
          )}
          {pending
            ? "Pidiendo permiso…"
            : enabled
              ? "Desactivar avisos"
              : "Activar avisos"}
        </button>
      </div>
      {message ? (
        <p role="status" className="mt-2 text-xs text-coffee-deep">
          {message}
        </p>
      ) : null}
    </div>
  );
}
