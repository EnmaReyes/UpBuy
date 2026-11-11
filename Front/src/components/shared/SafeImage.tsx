"use client";

import { useState } from "react";

// Imagen con respaldo.
//
// Las fotos vienen del CDN del proveedor y algunas pueden fallar (404, dominio
// caído). En vez de dejar el icono de imagen rota, se cambia al marcador que
// pase el consumidor (`fallback`) o se oculta.
export function SafeImage({
  src,
  alt,
  className,
  fallback = null,
  eager = false,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) return <>{fallback}</>;

  return (
    // El dominio del proveedor no está fijado, por eso no se usa next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}