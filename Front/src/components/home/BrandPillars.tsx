"use client";

import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";
import ShapeHero, { type HeroShape } from "@/components/kokonutui/shape-hero";

// Atributos de marca que caen como píldoras sobre el hero (Shape Hero de Kokonut UI).
// El orden alterna longitudes para que la pila quede equilibrada.
const ATTRIBUTES = [
  "Movimiento",
  "Carácter",
  "Duración",
  "Identidad",
  "Estilo",
  "Ergonomía",
  "Variedad",
  "Confianza",
  "Comodidad",
  "Calidad",
  "Rendimiento",
  "Versatilidad",
  "Innovación",
  "Libertad",
  "Actitud",
  "Diseño",
  "Resistencia",
  "Autenticidad",
] as const;

// Tamaños generosos: en móvil crecen un paso para llenar la pila sin desbordar.
const SIZES = [
  "h-10 px-5 text-sm sm:h-11 sm:px-6 sm:text-base",
  "h-11 px-6 text-sm sm:h-12 sm:px-7 sm:text-base",
  "h-12 px-6 text-base sm:h-14 sm:px-8 sm:text-lg",
  "h-11 px-5 text-sm sm:h-12 sm:px-6 sm:text-base",
  "h-10 px-5 text-sm sm:h-11 sm:px-6 sm:text-base",
  "h-12 px-7 text-base sm:h-13 sm:px-8 sm:text-base",
];

// Variaciones de color de la paleta UPBUY: terracota como acento, no como base.
const STYLES = [
  "border border-terracotta/60 bg-[#171310] text-cream",
  "bg-terracotta text-white shadow-[0_10px_30px_-12px_rgba(211,84,0,0.8)]",
  "border border-cream/25 bg-carbon text-cream",
  "bg-cream text-carbon",
  "border border-coffee/50 bg-[#1C1611] text-cream/90",
  "border border-terracotta/40 bg-terracotta/15 text-cream",
];

// Círculos decorativos intercalados, como en la composición original de Kokonut UI.
const CIRCLES: HeroShape[] = [
  {
    id: "circulo-carbon",
    className: "size-11 bg-[#211B17] sm:size-14",
  },
  {
    id: "circulo-crema",
    className: "size-10 bg-cream/90 sm:size-12",
  },
  {
    id: "circulo-terracota",
    className: "size-12 bg-terracotta sm:size-16",
  },
  {
    id: "circulo-borde",
    className: "size-10 border border-terracotta/50 bg-carbon sm:size-12",
  },
  {
    id: "circulo-terracota-suave",
    className: "size-9 bg-terracotta/30 sm:size-11",
  },
  {
    id: "circulo-crema-borde",
    className: "size-11 border border-cream/25 bg-[#1C1611] sm:size-14",
  },
];

const SHAPES: HeroShape[] = [
  ...ATTRIBUTES.map((label, index) => ({
    id: `atributo-${label.toLowerCase()}`,
    content: label,
    className: [
      "font-heading font-semibold tracking-tight",
      SIZES[index % SIZES.length],
      STYLES[index % STYLES.length],
    ].join(" "),
  })),
  ...CIRCLES,
];

// Sección de marca: sustituye los cuatro pilares por el Shape Hero oficial
// (caída, apilado y arrastre de píldoras) adaptado a la identidad UPBUY.
export function BrandPillars() {
  return (
    <ShapeHero
      as="h2"
      className="min-h-[840px] bg-carbon px-5 pt-14 pb-20 text-cream sm:min-h-[740px] sm:px-6 sm:pt-20 sm:pb-24 lg:min-h-[720px] lg:pt-24"
      eyebrow={
        <p className="inline-flex items-center gap-2 rounded-full border border-terracotta/40 bg-terracotta/10 px-4 py-1.5 text-[0.7rem] font-semibold tracking-[0.22em] text-cream uppercase">
          <span className="size-1.5 rounded-full bg-terracotta" aria-hidden="true" />
          La marca
        </p>
      }
      title={
        <span className="font-heading font-bold tracking-tight">
          Más que productos,{" "}
          <span className="text-terracotta">un estilo</span> que te mueve.
        </span>
      }
      description={
        <span className="block text-pretty text-sm leading-relaxed text-cream/75 sm:text-base">
          En UPBUY reunimos estilo, comodidad y funcionalidad para acompañarte en cada momento.
          Descubre productos seleccionados para quienes buscan calidad, versatilidad y
          personalidad en cada elección.
        </span>
      }
      actions={
        <>
          <Link
            href="/productos"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-terracotta px-7 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-[#B84800] focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-carbon focus-visible:outline-none"
          >
            Explorar productos
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link
            href="/contacto"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-cream/35 px-7 text-sm font-semibold text-cream transition-colors duration-150 ease-out hover:border-cream/70 hover:bg-cream/10 focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-carbon focus-visible:outline-none"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Contáctanos
          </Link>
        </>
      }
      shapes={SHAPES}
      // Suficiente área en móvil para que las 18 píldoras entren en la pila.
      fill={0.55}
    />
  );
}
