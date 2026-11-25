"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";
import { SafeImage } from "@/components/shared/SafeImage";

// Videos de promocion en formato reels. Los enlaces de Google Drive se
// convierten al reproductor embebido (`file/d/<id>/preview`); la miniatura del
// mismo archivo (`thumbnail?id=<id>`) se usa como portada y para conocer la
// proporcion real del video. Asi el marco se ajusta a cada video en vez de
// forzar 9:16 y dejar franjas negras en los que son 3:4 o 16:9.
const DEFAULT_RATIO = 9 / 16;

function getDriveFileId(url: string): string | null {
  const byPath = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if (byPath) return byPath[1];

  const byQuery = url.match(/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([^&#]+)/);
  return byQuery ? byQuery[1] : null;
}

function toPlayableUrl(url: string): string {
  const id = getDriveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : url;
}

function toPosterUrl(url: string): string | null {
  const id = getDriveFileId(url);
  return id
    ? `https://drive.google.com/thumbnail?id=${id}&sz=w1600`
    : null;
}

function clampRatio(ratio: number): number {
  // Limites sanos para videos extremos; el contenido real suele estar entre
  // 9:16 y 16:9.
  return Math.min(Math.max(ratio, 9 / 16), 16 / 9);
}

export function ProductVideosReels({ urls }: { urls: string[] }) {
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const closeViewer = useCallback(() => setActiveIndex(null), []);

  if (!urls || urls.length === 0) return null;

  const activeUrl = activeIndex !== null ? urls[activeIndex] : null;
  const activeRatio = activeUrl
    ? clampRatio(ratios[activeUrl] ?? DEFAULT_RATIO)
    : DEFAULT_RATIO;

  return (
    <section
      className="mt-10 border-t border-border pt-10"
      aria-labelledby="material-promocion-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.25em] text-terracotta-deep uppercase">
            Contenido del producto
          </p>
          <h2
            id="material-promocion-title"
            className="mt-2 font-heading text-[clamp(1.5rem,3vw,2.25rem)] leading-tight font-bold tracking-tight text-carbon"
          >
            Material de promoción
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Mira el producto en movimiento. Toca un video para reproducirlo.
        </p>
      </div>

      <div className="mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {urls.map((url, index) => (
          <VideoReel
            key={`${url}-${index}`}
            url={url}
            index={index}
            ratio={clampRatio(ratios[url] ?? DEFAULT_RATIO)}
            onRatio={(ratio) =>
              setRatios((prev) =>
                prev[url] === ratio ? prev : { ...prev, [url]: ratio },
              )
            }
            onOpen={() => setActiveIndex(index)}
          />
        ))}
      </div>

      {activeIndex !== null && activeUrl ? (
        <VideoViewer
          url={activeUrl}
          index={activeIndex}
          total={urls.length}
          ratio={activeRatio}
          onClose={closeViewer}
        />
      ) : null}
    </section>
  );
}

function VideoReel({
  url,
  index,
  ratio,
  onRatio,
  onOpen,
}: {
  url: string;
  index: number;
  ratio: number;
  onRatio: (ratio: number) => void;
  onOpen: () => void;
}) {
  const poster = toPosterUrl(url);
  const label = `video de promoción ${index + 1}`;

  return (
    <div
      className="relative h-[22rem] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-muted shadow-sm sm:h-[26rem] lg:h-[30rem]"
      style={{ aspectRatio: String(ratio) }}
    >
      {poster ? (
        <SafeImage
          src={poster}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          fallback={<ReelPosterFallback />}
          onLoad={(event) => {
            const img = event.currentTarget;
            if (!img.naturalWidth || !img.naturalHeight) return;
            onRatio(img.naturalWidth / img.naturalHeight);
          }}
        />
      ) : (
        <ReelPosterFallback />
      )}

      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,11,11,0.18)_0%,rgba(11,11,11,0)_38%,rgba(11,11,11,0.72)_100%)]"
      />

      <span className="absolute top-3 left-3 rounded-full bg-cream/90 px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] text-carbon uppercase backdrop-blur">
        Reel {String(index + 1).padStart(2, "0")}
      </span>

      <button
        type="button"
        onClick={onOpen}
        aria-label={`Reproducir ${label}`}
        className="group absolute inset-0 flex items-center justify-center rounded-2xl focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-carbon focus-visible:outline-none"
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-cream/95 text-carbon shadow-lg transition-transform duration-200 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
          <Play className="h-7 w-7 translate-x-0.5 fill-current" aria-hidden="true" />
        </span>
      </button>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-3 left-3 text-xs font-medium text-cream/90"
      >
        Reproducir video
      </span>
    </div>
  );
}

function VideoViewer({
  url,
  index,
  total,
  ratio,
  onClose,
}: {
  url: string;
  index: number;
  total: number;
  ratio: number;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const title = `Video de promoción ${index + 1}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/90 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        aria-label="Cerrar video"
        className="absolute top-4 right-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-cream text-carbon shadow-lg transition-colors hover:bg-terracotta hover:text-cream focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-carbon focus-visible:outline-none"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative"
        style={{
          width: `min(92vw, calc(80vh * ${ratio}))`,
          aspectRatio: String(ratio),
        }}
      >
        <div className="h-full w-full overflow-hidden rounded-2xl border border-cream/15 bg-carbon shadow-2xl">
          <iframe
            src={toPlayableUrl(url)}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            loading="lazy"
            className="h-full w-full border-0"
          />
        </div>

        <p className="mt-3 text-center text-xs font-medium tracking-wide text-cream/70">
          Video {index + 1} de {total}
        </p>
      </div>
    </div>
  );
}

function ReelPosterFallback() {
  return (
    <span className="absolute inset-0">
      <span
        aria-hidden="true"
        className="absolute inset-0 block bg-[linear-gradient(150deg,#EDE0CE_0%,#F5E9D7_45%,#D9C9B3_100%)]"
      />
      <span className="absolute inset-0 flex items-center justify-center p-6 text-center text-[10px] font-semibold tracking-[0.22em] text-coffee-deep/80 uppercase">
        Vista previa no disponible
      </span>
    </span>
  );
}
