"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Botón oficial de Google Identity Services (GIS).
//
// Estrategia de carga: `next/script` con `strategy="afterInteractive"` y el
// componente montado SOLO en /login y /registro. El script de Google se carga
// al montar el bloque social, pero no hay peticiones a Google hasta que el
// usuario interactúa con el botón. El botón propio está prohibido por las
// normas de marca de Google: se usa `renderButton` en un contenedor con altura
// reservada para no mover el layout (CLS 0).

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

type GoogleButtonProps = {
  clientId: string;
  disabled?: boolean;
  onCredential: (credential: string) => void;
};

type Status = "loading" | "ready" | "error";

export function GoogleButton({
  clientId,
  disabled = false,
  onCredential,
}: GoogleButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const credentialHandler = useRef(onCredential);

  const [status, setStatus] = useState<Status>("loading");
  const [slow, setSlow] = useState(false);

  // El callback cambia en cada render del formulario; el SDK se inicializa una
  // sola vez y siempre llama a la versión más reciente.
  useEffect(() => {
    credentialHandler.current = onCredential;
  }, [onCredential]);

  const renderOfficialButton = useCallback(() => {
    const google = window.google;
    const container = containerRef.current;
    if (!google || !container) return;

    // GIS acepta entre 200 y 400 px; se ajusta al ancho real del formulario.
    const width = Math.min(
      400,
      Math.max(200, Math.floor(container.getBoundingClientRect().width)),
    );

    container.replaceChildren();
    google.accounts.id.renderButton(container, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "continue_with",
      logo_alignment: "left",
      locale: "es",
      width,
    });
    setStatus("ready");
  }, []);

  const handleReady = useCallback(() => {
    const google = window.google;
    if (!google) {
      setStatus("error");
      return;
    }

    if (!initializedRef.current) {
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          const credential = response.credential?.trim();
          if (credential) credentialHandler.current(credential);
        },
        auto_select: false,
        cancel_on_tap_outside: true,
        ux_mode: "popup",
      });
      initializedRef.current = true;
    }

    renderOfficialButton();
  }, [clientId, renderOfficialButton]);

  useEffect(() => {
    if (status !== "loading") return;
    const timer = window.setTimeout(() => setSlow(true), 1000);
    return () => window.clearTimeout(timer);
  }, [status]);

  // El ancho del formulario cambia entre móvil y escritorio. Se vuelve a pintar
  // solo cuando el cambio es apreciable para no entrar en un bucle.
  useEffect(() => {
    if (status !== "ready") return;
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    let lastWidth = Math.floor(container.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const width = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (!width || Math.abs(width - lastWidth) < 8) return;
      lastWidth = width;
      renderOfficialButton();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [status, renderOfficialButton]);

  return (
    <div className={cn("w-full", disabled && "pointer-events-none opacity-60")}>
      <Script
        src={SCRIPT_SRC}
        strategy="afterInteractive"
        onReady={handleReady}
        onError={() => setStatus("error")}
      />

      <div className="relative flex min-h-11 w-full items-center justify-center">
        <div
          ref={containerRef}
          className="flex min-h-11 w-full justify-center"
          aria-hidden={status !== "ready"}
        />

        {status !== "ready" ? (
          <div
            className="absolute inset-0 flex items-center justify-center"
            aria-live="polite"
          >
            {status === "error" ? (
              <p className="text-center text-xs leading-relaxed text-terracotta-deep">
                No se pudo cargar el acceso con Google. Revisa tu conexión o el
                bloqueador de anuncios.
              </p>
            ) : (
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                {slow ? (
                  <>
                    <Loader2
                      className="h-4 w-4 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                    Cargando Google…
                  </>
                ) : (
                  <span className="sr-only">Cargando Google…</span>
                )}
              </span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
