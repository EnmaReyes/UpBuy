"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type LegalTocItem = {
  id: string;
  number: string;
  title: string;
};

// Índice de la página legal. Es cliente solo por el resaltado de la sección
// activa: el HTML inicial es idéntico al del servidor y no lee almacenamiento,
// así que la hidratación no cambia el árbol.
export function LegalTableOfContents({
  items,
  className,
}: {
  items: LegalTocItem[];
  className?: string;
}) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((section): section is HTMLElement => section !== null);

    if (sections.length === 0 || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;

        const topmost = visible.reduce((current, entry) =>
          entry.boundingClientRect.top < current.boundingClientRect.top
            ? entry
            : current,
        );
        setActiveId(topmost.target.id);
      },
      { rootMargin: "-96px 0px -62% 0px", threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="Contenido de la página" className={className}>
      <p className="font-heading text-xs font-semibold tracking-[0.2em] text-coffee-deep uppercase">
        En esta página
      </p>
      <ol className="mt-4 border-l border-border">
        {items.map((item) => {
          const active = item.id === activeId;

          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={active ? "location" : undefined}
                onClick={() => setActiveId(item.id)}
                className={cn(
                  "flex min-h-11 items-start gap-2.5 border-l-2 py-2 pr-2 pl-3 text-sm leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta",
                  active
                    ? "border-terracotta-deep font-semibold text-carbon"
                    : "border-transparent text-coffee-deep hover:border-coffee/40 hover:text-carbon",
                )}
              >
                <span className="mt-0.5 shrink-0 font-heading text-[11px] font-semibold tracking-wide tabular-nums">
                  {item.number}
                </span>
                <span>{item.title}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
