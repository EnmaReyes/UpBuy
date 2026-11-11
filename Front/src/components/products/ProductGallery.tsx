"use client";

import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

const GRADIENTS = [
  "linear-gradient(150deg,#EDE0CE 0%,#F5E9D7 48%,#D9C9B3 100%)",
  "linear-gradient(150deg,#D9C9B3 0%,#EDE0CE 55%,#F5E9D7 100%)",
  "linear-gradient(150deg,#F5E9D7 0%,#D9C9B3 60%,#B8A892 100%)",
  "linear-gradient(150deg,#E3D3BE 0%,#F5E9D7 45%,#C9B79E 100%)",
];

// Galería de marcadores: cuando el backend entregue `images`, este componente
// cambia a imágenes reales sin tocar el resto de la página de detalle.
export function ProductGallery({ productName }: { productName: string }) {
  const [active, setActive] = useState(0);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 lg:max-w-none">
      <div
        className="relative aspect-[4/5] overflow-hidden rounded-xl bg-[var(--gallery-gradient)]"
        style={{ "--gallery-gradient": GRADIENTS[active] } as CSSProperties}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_10%,rgba(211,84,0,0.10)_0%,rgba(245,233,215,0)_58%)]"
        />
        <span className="absolute inset-0 flex items-center justify-center p-8 text-center text-[10px] font-semibold tracking-[0.22em] text-coffee-deep/80 uppercase">
          {productName} · Vista {active + 1}
        </span>
        <span className="absolute bottom-4 left-4 rounded-full bg-cream/90 px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-carbon uppercase">
          Foto de producto
        </span>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {GRADIENTS.map((gradient, index) => (
          <button
            key={gradient}
            type="button"
            onClick={() => setActive(index)}
            aria-label={`Ver vista ${index + 1} de ${productName}`}
            aria-pressed={active === index}
            style={{ background: gradient }}
            className={cn(
              "relative aspect-square overflow-hidden rounded-lg border-2 transition-colors",
              active === index ? "border-carbon" : "border-transparent hover:border-coffee/40",
            )}
          >
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold tracking-[0.12em] text-coffee-deep/70 uppercase">
              {String(index + 1).padStart(2, "0")}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
