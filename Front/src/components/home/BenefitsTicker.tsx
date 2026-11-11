"use client";

import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

const MESSAGES = [
  "Envío a toda Colombia",
  "Cambios en 30 días",
  "Compra segura",
  "Nuevas colecciones",
  "Diseño con identidad",
];

// Franja de beneficios con marquesina continua.
// Se duplica la lista para que el bucle sea continuo; con reduced-motion
// se muestra una sola fila estática.
export function BenefitsTicker() {
  const shouldReduceMotion = usePrefersReducedMotion();

  if (shouldReduceMotion) {
    return (
      <div className="border-y border-cream/10 bg-carbon py-3">
        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-1 text-xs font-medium tracking-[0.18em] text-cream/70 uppercase">
          {MESSAGES.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </div>
    );
  }

  const loop = [...MESSAGES, ...MESSAGES];

  return (
    <div
      className="overflow-hidden border-y border-cream/10 bg-carbon py-3"
      aria-label="Beneficios de la tienda"
    >
      <div className="flex w-max animate-[marquee_28s_linear_infinite] items-center gap-8 motion-reduce:animate-none">
        {loop.map((message, index) => (
          <span
            key={`${message}-${index}`}
            className="flex items-center gap-8 text-xs font-medium tracking-[0.18em] text-cream/70 uppercase"
          >
            {message}
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-terracotta" />
          </span>
        ))}
      </div>
    </div>
  );
}
