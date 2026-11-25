"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

type ProductDescriptionProps = {
  description: string;
  className?: string;
};

// Altura visible del bloque colapsado (~8 lineas de texto). Es una medida en
// px para poder animar `max-height` con Motion; el texto que sobre pasa se
// difumina con un degradado hacia el fondo de la pagina.
const COLLAPSED_MAX_HEIGHT = 224;
// Margen para no mostrar el boton cuando el texto apenas rebasa el limite.
const OVERFLOW_TOLERANCE = 4;

// Descripcion de producto con formato original del proveedor.
// - `whitespace-pre-line` conserva los saltos de linea y las secciones que
//   llegan en el texto plano, sin interpretar HTML.
// - Se colapsa a una altura maxima; el control "Leer mas / Leer menos" solo
//   aparece cuando el contenido realmente se desborda.
// - La transicion de apertura sigue el movimiento de UpBuy (0.45s, easeOut) y
//   se desactiva con `prefers-reduced-motion`.
export function ProductDescription({
  description,
  className,
}: ProductDescriptionProps) {
  const contentId = useId();
  const innerRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const [overflows, setOverflows] = useState(false);
  const shouldReduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    const element = innerRef.current;
    if (!element) return;

    const measure = () => {
      const fullHeight = Math.ceil(element.getBoundingClientRect().height);
      setContentHeight(fullHeight);
      setOverflows(fullHeight > COLLAPSED_MAX_HEIGHT + OVERFLOW_TOLERANCE);
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [description]);

  if (!description.trim()) return null;

  // Al expandir (o cuando no hay desbordamiento) el limite es la altura real
  // del contenido, asi nada queda recortado.
  const maxHeight =
    expanded || !overflows
      ? (contentHeight ?? COLLAPSED_MAX_HEIGHT)
      : COLLAPSED_MAX_HEIGHT;

  const showToggle = overflows;

  return (
    <div className={className}>
      <div className="relative">
        <motion.div
          id={contentId}
          initial={false}
          animate={{ maxHeight }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { duration: 0.45, ease: "easeOut" }
          }
          className="overflow-hidden"
        >
          <p
            ref={innerRef}
            className="max-w-prose text-sm leading-relaxed whitespace-pre-line text-coffee-deep sm:text-base"
          >
            {description}
          </p>
        </motion.div>

        {!expanded && showToggle ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background via-background/85 to-transparent"
          />
        ) : null}
      </div>

      {showToggle ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={contentId}
          className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-semibold text-carbon transition-colors hover:text-terracotta-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
        >
          {expanded ? "Leer menos" : "Leer más"}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "h-4 w-4 transition-transform duration-300 ease-out motion-reduce:transition-none",
              expanded && "rotate-180",
            )}
          />
        </button>
      ) : null}
    </div>
  );
}
