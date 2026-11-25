"use client";

import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { SafeImage } from "@/components/shared/SafeImage";

const GRADIENTS = [
  "linear-gradient(150deg,#EDE0CE 0%,#F5E9D7 48%,#D9C9B3 100%)",
  "linear-gradient(150deg,#D9C9B3 0%,#EDE0CE 55%,#F5E9D7 100%)",
  "linear-gradient(150deg,#F5E9D7 0%,#D9C9B3 60%,#B8A892 100%)",
  "linear-gradient(150deg,#E3D3BE 0%,#F5E9D7 45%,#C9B79E 100%)",
];

type ProductGalleryProps = {
  productName: string;
  /** URLs reales del producto. Vacío = marcador editorial. */
  images?: string[];
  /**
   * Disposición de los thumbnails:
   * - `"vertical"` (default): columna a la izquierda de la imagen grande en
   *   desktop; fila horizontal debajo de la imagen en móvil/tablet.
   * - `"horizontal"`: fila horizontal debajo de la imagen en todos los tamaños.
   */
  orientation?: "vertical" | "horizontal";
};

// Galería del detalle: usa las imágenes del backend cuando existen y cae a
// marcadores con la paleta de la marca cuando el producto aún no tiene fotos.
// En desktop con `orientation="vertical"` los thumbnails quedan en una columna
// a la izquierda de la imagen (layout tipo editorial de dos columnas).
export function ProductGallery({
  productName,
  images = [],
  orientation = "vertical",
}: ProductGalleryProps) {
  const [active, setActive] = useState(0);
  // Proporcion real (ancho / alto) de cada imagen. Las fotos del proveedor
  // llegan con dimensiones muy distintas, asi que el marco se ajusta a cada
  // una en vez de recortarlas con un `aspect-*` fijo.
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const realImages = images.filter(Boolean);

  if (realImages.length === 0) {
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
                "relative aspect-square overflow-hidden rounded-lg border-2 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-terracotta-deep focus-visible:outline-none",
                active === index
                  ? "border-carbon"
                  : "border-transparent hover:border-coffee/40",
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

  const safeActive = Math.min(active, realImages.length - 1);
  const vertical = orientation === "vertical";
  const activeUrl = realImages[safeActive];
  // Limites sanos: evita marcos gigantes con fotos muy verticales y marcos
  // casi invisibles con banners muy horizontales. La imagen siempre se muestra
  // completa con `object-contain`.
  const activeRatio = Math.min(Math.max(ratios[activeUrl] ?? 4 / 5, 3 / 5), 2);

  const thumbnails = realImages.map((url, index) => (
    <button
      key={`${url}-${index}`}
      type="button"
      onClick={() => setActive(index)}
      aria-label={`Ver vista ${index + 1} de ${productName}`}
      aria-pressed={safeActive === index}
      className={cn(
        "relative aspect-square w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-terracotta-deep focus-visible:outline-none",
        safeActive === index
          ? "border-carbon"
          : "border-transparent hover:border-coffee/40",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <SafeImage
        src={url}
        alt=""
        className="absolute inset-0 h-full w-full object-contain"
        fallback={
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(150deg,#EDE0CE_0%,#F5E9D7_48%,#D9C9B3_100%)]"
          />
        }
      />
    </button>
  ));

  return (
    <div
      className={
        vertical
          ? "mx-auto flex w-full max-w-md flex-col gap-3 lg:max-w-none lg:flex-row lg:gap-4"
          : "mx-auto flex w-full max-w-md flex-col gap-3"
      }
    >
      {/*
        El marco toma la proporcion real de la foto y se limita al alto de la
        ventana (`maxWidth` calculado con `vh`). Asi la imagen no se recorta,
        no se estira y no deja franjas vacias dentro del recuadro. El
        `flex-1 min-w-0` es lo que evita que colapse en el layout horizontal
        de desktop (antes medía 0 px porque solo tenia hijos absolutos).
      */}
      <div
        className="relative mx-auto w-full overflow-hidden rounded-xl bg-muted lg:order-2 lg:min-w-0 lg:flex-1"
        style={
          {
            aspectRatio: String(activeRatio),
            maxWidth: `calc(78vh * ${activeRatio})`,
          } as CSSProperties
        }
      >
        <SafeImage
          key={activeUrl}
          src={activeUrl}
          alt={`${productName} — vista ${safeActive + 1}`}
          eager
          onLoad={(event) => {
            const img = event.currentTarget;
            if (!img.naturalWidth || !img.naturalHeight) return;
            const ratio = img.naturalWidth / img.naturalHeight;
            setRatios((prev) =>
              prev[activeUrl] === ratio
                ? prev
                : { ...prev, [activeUrl]: ratio },
            );
          }}
          className="absolute inset-0 h-full w-full object-contain"
          fallback={<GalleryFallback />}
        />
      </div>

      {realImages.length > 1 ? (
        vertical ? (
          // Desktop: columna de thumbnails a la izquierda de la imagen. Móvil:
          // la misma fila se apila debajo de la imagen (columna).
          <div className="flex flex-wrap gap-2 lg:order-1 lg:shrink-0 lg:self-start lg:w-16 lg:flex lg:flex-col lg:gap-2 lg:flex-nowrap">
            {thumbnails}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">{thumbnails}</div>
        )
      ) : null}
    </div>
  );
}

// Respaldo cuando la foto del proveedor no carga.
function GalleryFallback() {
  return (
    <span className="absolute inset-0">
      <span
        aria-hidden="true"
        className="absolute inset-0 block bg-[linear-gradient(150deg,#EDE0CE_0%,#F5E9D7 48%,#D9C9B3 100%)]"
      />
      <span className="absolute inset-0 flex items-center justify-center p-8 text-center text-[10px] font-semibold tracking-[0.22em] text-coffee-deep/80 uppercase">
        Foto no disponible
      </span>
    </span>
  );
}
