"use client";

import DotField from "@/components/kokonutui/dot-field";
import { UPBUY_DOT_COLOR } from "@/lib/brand";

export { UPBUY_DOT_COLOR };

export type DotFieldVariant =
  | "tienda"
  | "nosotros"
  | "contacto"
  | "perfil"
  | "carrito";

// Configuracion centralizada por Hero. `spacing` es la distancia entre puntos
// en escritorio; el componente la aumenta solo en tablet y movil.
const PRESETS: Record<
  DotFieldVariant,
  { opacity: number; spacing: number; seed: number }
> = {
  // Ambiental y elegante, sin competir con el titulo del catalogo.
  tienda: { opacity: 0.52, spacing: 20, seed: 7 },
  // Identidad de marca con presencia equilibrada.
  nosotros: { opacity: 0.62, spacing: 18, seed: 11 },
  // Muy discreto: el contenido de contacto manda.
  contacto: { opacity: 0.48, spacing: 22, seed: 17 },
  // El mas visible de todos: estetica premium en el area de cuenta.
  perfil: { opacity: 0.85, spacing: 15, seed: 23 },
  // Acompana el resumen del carrito sin distraer.
  carrito: { opacity: 0.42, spacing: 22, seed: 31 },
};

// Capa de fondo decorativa para los Hero. Se apoya en el componente original
// de Kokonut UI (ondas y shockwave incluidos): aqui solo se fija el color, la
// intensidad y el encuadre. El contenido del Hero debe ir por encima.
export function DotFieldBackground({ variant }: { variant: DotFieldVariant }) {
  const preset = PRESETS[variant];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 isolate overflow-hidden"
    >
      <DotField
        className="pointer-events-auto h-full min-h-0 w-full bg-transparent"
        spacing={preset.spacing}
        seed={preset.seed}
        color={UPBUY_DOT_COLOR}
        opacity={preset.opacity}
      >
        {null}
      </DotField>
    </div>
  );
}
