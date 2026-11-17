"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cookie, X } from "lucide-react";
import { CookiePreferences } from "@/components/legal/CookiePreferences";
import {
  ALL_GRANTED,
  CONSENT_OPEN_EVENT,
  CONSENT_UPDATED_EVENT,
  DEFAULT_DENIED,
  readConsent,
  writeConsent,
  type ConsentCategories,
  type ConsentSource,
} from "@/lib/consent";

// Aviso de primera visita. No bloquea la lectura: se ancla al borde inferior y
// solo intercepta los clics dentro de su propia tarjeta. La decisión se guarda
// en `upbuy.consent.v1` desde `lib/consent.ts`.
export function CookieConsentBanner() {
  const pathname = usePathname();
  const autoOpened = useRef(false);
  const [open, setOpen] = useState(false);
  const [configuring, setConfiguring] = useState(false);

  useEffect(() => {
    if (pathname === "/preferencias-de-cookies") {
      setOpen(false);
      setConfiguring(false);
      return;
    }

    if (!autoOpened.current) {
      autoOpened.current = true;
      if (!readConsent()) setOpen(true);
    }
  }, [pathname]);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setConfiguring(true);
    };
    const onUpdated = () => setOpen(false);

    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    window.addEventListener(CONSENT_UPDATED_EVENT, onUpdated);

    return () => {
      window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
      window.removeEventListener(CONSENT_UPDATED_EVENT, onUpdated);
    };
  }, []);

  const decide = (categories: ConsentCategories, source: ConsentSource) => {
    writeConsent(categories, source);
    setOpen(false);
    setConfiguring(false);
  };

  if (!open) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[65] p-3 sm:p-4 print:hidden">
      <section
        role="region"
        aria-labelledby="cookie-banner-title"
        className="pointer-events-auto mx-auto max-h-[calc(100dvh-1.5rem)] max-w-3xl overflow-y-auto rounded-2xl border border-cream/15 bg-carbon p-5 text-cream shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cream/20 text-terracotta">
              <Cookie className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="cookie-banner-title"
                className="font-heading text-lg font-semibold tracking-tight"
              >
                Tu privacidad, a tu manera
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-cream/70">
                Usamos cookies necesarias para que la tienda funcione. Las de
                preferencias, analítica y marketing solo se activan si las
                autorizas; hoy no tenemos analítica ni publicidad instaladas.
                Lee la{" "}
                <Link
                  href="/preferencias-de-cookies"
                  className="font-semibold text-cream underline decoration-terracotta/60 underline-offset-4 transition-colors hover:text-terracotta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                >
                  Política de Cookies
                </Link>{" "}
                y los{" "}
                <Link
                  href="/terminos-y-condiciones"
                  className="font-semibold text-cream underline decoration-terracotta/60 underline-offset-4 transition-colors hover:text-terracotta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                >
                  Términos y Condiciones
                </Link>
                .
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar aviso de cookies"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-cream/70 transition-colors hover:bg-cream/10 hover:text-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => decide(ALL_GRANTED, "accept-all")}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-cream px-5 text-sm font-semibold text-carbon transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
          >
            Aceptar todas
          </button>
          <button
            type="button"
            onClick={() => decide(DEFAULT_DENIED, "reject-all")}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-cream/30 px-5 text-sm font-semibold text-cream transition-colors hover:bg-cream/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
          >
            Rechazar no necesarias
          </button>
          <button
            type="button"
            onClick={() => setConfiguring((value) => !value)}
            aria-expanded={configuring}
            aria-controls="cookie-banner-preferences"
            className="inline-flex min-h-11 items-center justify-center px-2 text-sm font-semibold text-cream/80 underline decoration-cream/30 underline-offset-4 transition-colors hover:text-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
          >
            {configuring ? "Ocultar preferencias" : "Configurar"}
          </button>
        </div>

        {configuring ? (
          <div
            id="cookie-banner-preferences"
            className="mt-5 border-t border-cream/15 pt-5"
          >
            <div className="rounded-xl bg-background p-4">
              <CookiePreferences
                variant="compact"
                onSaved={() => {
                  setOpen(false);
                  setConfiguring(false);
                }}
              />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
