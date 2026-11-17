"use client";

import { Loader2 } from "lucide-react";

// Botón de Facebook. Es propio porque el SDK no impone un botón con marca
// registrada como Google: el azul de la marca se usa solo en el icono y en el
// borde al enfocar, nunca como fondo completo. El SVG es local (lucide-react no
// incluye logos) para no agregar dependencias.

type FacebookButtonProps = {
  pending: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export function FacebookButton({
  pending,
  disabled = false,
  onClick,
}: FacebookButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      aria-label="Continuar con Facebook"
      aria-busy={pending}
      className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon transition-colors hover:border-[#1877F2] hover:bg-cream/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <Loader2
          className="h-4 w-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 shrink-0"
          aria-hidden="true"
          focusable="false"
        >
          <path
            fill="#1877F2"
            d="M24 12.073C24 5.446 18.627.073 12 .073S0 5.446 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z"
          />
        </svg>
      )}
      {pending ? "Conectando…" : "Continuar con Facebook"}
    </button>
  );
}
