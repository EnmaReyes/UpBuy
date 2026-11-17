"use client";

import { useEffect, useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_DENIED,
  ALL_GRANTED,
  CONSENT_STORAGE_KEY,
  readConsent,
  writeConsent,
  type ConsentCategories,
  type ConsentCategory,
  type ConsentSource,
} from "@/lib/consent";

type OptionalCategory = Exclude<ConsentCategory, "necessary">;

const CATEGORY_ROWS: Array<{
  key: ConsentCategory;
  title: string;
  description: string;
}> = [
  {
    key: "necessary",
    title: "Estrictamente necesarias",
    description:
      "Sesión, seguridad, carrito y registro de tu decisión. Sin ellas la tienda no puede funcionar.",
  },
  {
    key: "preferences",
    title: "Preferencias",
    description:
      "Idioma, país, moneda o última categoría vista. Hoy no hay cookies de esta categoría activas.",
  },
  {
    key: "analytics",
    title: "Analítica",
    description:
      "Medición agregada del uso del sitio. Hoy no hay herramientas de analítica instaladas.",
  },
  {
    key: "marketing",
    title: "Marketing",
    description:
      "Remarketing y medición de campañas. Hoy no hay píxeles ni cookies publicitarias activas.",
  },
];

function formatConsentDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function CookiePreferences({
  variant = "page",
  onSaved,
}: {
  variant?: "page" | "compact";
  onSaved?: () => void;
}) {
  const compact = variant === "compact";
  const idPrefix = compact ? "cookies-compact" : "cookies-page";

  const [categories, setCategories] = useState<ConsentCategories>({
    ...DEFAULT_DENIED,
  });
  const [mounted, setMounted] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const stored = readConsent();
    if (stored) {
      setCategories(stored.categories);
      setSavedAt(stored.updatedAt);
    }
  }, []);

  const toggle = (key: OptionalCategory) => {
    setCategories((current) => ({ ...current, [key]: !current[key] }));
    setStatus(null);
  };

  const save = (source: ConsentSource, next: ConsentCategories) => {
    const record = writeConsent(next, source);
    setCategories(record.categories);
    setSavedAt(record.updatedAt);
    setStatus(
      source === "reject-all"
        ? "Preferencias guardadas: solo quedan activas las cookies necesarias."
        : source === "accept-all"
          ? "Preferencias guardadas: autorizaste todas las categorías."
          : "Preferencias guardadas en este navegador.",
    );
    onSaved?.();
  };

  return (
    <div
      id={compact ? undefined : "preferencias"}
      className={cn("scroll-mt-28", !compact && "rounded-xl border border-border bg-card p-5 sm:p-6")}
    >
      {compact ? null : (
        <div className="flex items-start gap-3">
          <ShieldCheck
            className="mt-0.5 h-5 w-5 shrink-0 text-terracotta-deep"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm leading-relaxed text-coffee-deep">
              Tu elección se guarda en este navegador bajo la clave{" "}
              <code className="font-sans text-xs font-semibold text-carbon">
                {CONSENT_STORAGE_KEY}
              </code>
              . Puedes cambiarla cuando quieras.
            </p>
            {mounted && savedAt ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Última decisión guardada: {formatConsentDate(savedAt)}.
              </p>
            ) : null}
          </div>
        </div>
      )}

      <div className={cn("grid gap-2", compact ? "mt-0" : "mt-5")}>
        {CATEGORY_ROWS.map((row) => {
          const isNecessary = row.key === "necessary";
          const checked = categories[row.key];

          return (
            <button
              key={row.key}
              type="button"
              role="switch"
              aria-checked={checked}
              aria-labelledby={`${idPrefix}-${row.key}-title`}
              aria-describedby={`${idPrefix}-${row.key}-description`}
              disabled={isNecessary}
              onClick={() => {
                if (!isNecessary) toggle(row.key as OptionalCategory);
              }}
              className={cn(
                "flex min-h-11 w-full items-start justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta",
                isNecessary
                  ? "cursor-not-allowed"
                  : "cursor-pointer hover:border-coffee/50",
              )}
            >
              <span className="min-w-0">
                <span
                  id={`${idPrefix}-${row.key}-title`}
                  className="block text-sm font-semibold text-carbon"
                >
                  {row.title}
                </span>
                <span
                  id={`${idPrefix}-${row.key}-description`}
                  className="mt-0.5 block text-xs leading-relaxed text-coffee-deep"
                >
                  {row.description}
                </span>
              </span>

              <span
                aria-hidden="true"
                className={cn(
                  "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors motion-reduce:transition-none",
                  checked
                    ? "border-terracotta-deep bg-terracotta-deep"
                    : "border-coffee/30 bg-coffee/40",
                  isNecessary && "opacity-80",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 rounded-full bg-cream shadow-sm transition-transform motion-reduce:transition-none",
                    checked ? "translate-x-6" : "translate-x-1",
                  )}
                />
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={() => save("save", categories)}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-carbon px-5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
        >
          Guardar preferencias
        </button>
        <button
          type="button"
          onClick={() => save("accept-all", ALL_GRANTED)}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-5 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
        >
          Aceptar todas
        </button>
        <button
          type="button"
          onClick={() => save("reject-all", DEFAULT_DENIED)}
          className="inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold text-coffee-deep underline decoration-coffee/40 underline-offset-4 transition-colors hover:text-carbon focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
        >
          Rechazar no necesarias
        </button>
      </div>

      {status ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-4 flex items-start gap-2 border-l-2 border-terracotta bg-muted/50 px-3 py-2 text-xs leading-relaxed text-coffee-deep"
        >
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-terracotta-deep" aria-hidden="true" />
          {status}
        </p>
      ) : null}
    </div>
  );
}
