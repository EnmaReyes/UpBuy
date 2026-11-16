"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

type HomeCategory = {
  slug: string;
  name: string;
  description: string | null;
  /** Fotografia de la categoria. Todavia no existe en el catalogo: mientras
   *  tanto la tarjeta reserva el espacio con el marcador de imagen. */
  image?: string | null;
};

type CategoriesProps = {
  categories: HomeCategory[];
};

// Curva de easing de la referencia (salida suave y rapida al final).
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// Degradados del marcador de imagen: se alternan para que la retícula no se
// vea uniforme mientras llegan las fotografias reales. Son oscuros para que el
// texto superpuesto tenga contraste y el marcador se lea como una foto futura.
const PLACEHOLDERS = [
  "bg-[linear-gradient(150deg,#2A2520_0%,#141110_100%)]",
  "bg-[linear-gradient(150deg,#23201C_0%,#171310_100%)]",
  "bg-[linear-gradient(150deg,#2E241C_0%,#16110E_100%)]",
  "bg-[linear-gradient(150deg,#262019_0%,#131211_100%)]",
];

// Halos de color que se superponen al marcador: dan profundidad al espacio
// reservado para la fotografía.
const HALOS = [
  "bg-[radial-gradient(90%_70%_at_20%_10%,rgba(211,84,0,0.28)_0%,rgba(11,11,11,0)_60%)]",
  "bg-[radial-gradient(90%_70%_at_80%_15%,rgba(139,111,86,0.35)_0%,rgba(11,11,11,0)_60%)]",
  "bg-[radial-gradient(90%_70%_at_30%_85%,rgba(211,84,0,0.22)_0%,rgba(11,11,11,0)_60%)]",
  "bg-[radial-gradient(90%_70%_at_70%_80%,rgba(139,111,86,0.3)_0%,rgba(11,11,11,0)_60%)]",
];

// Categorias: retícula editorial de dos columnas, imagen a sangre con degradado
// inferior, título, texto breve y CTA. La entrada al viewport replica la
// referencia: opacidad + desplazamiento vertical con stagger entre tarjetas.
export function Categories({ categories }: CategoriesProps) {
  const shouldReduceMotion = usePrefersReducedMotion();

  return (
    <section
      id="encuentra-tu-estilo"
      className="section-y scroll-mt-24 bg-background"
    >
      <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8">
        {/* Encabezado: antetitulo + titular a la izquierda, CTA a la derecha. */}
        <motion.div
          data-reveal
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 48 }}
          whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.9, ease: EASE }}
          className="flex flex-col items-start gap-6 sm:flex-row sm:items-end sm:justify-between sm:gap-12"
        >
          <div className="flex flex-col items-start gap-4">
            <p className="text-xs font-semibold tracking-[0.25em] text-terracotta-deep uppercase">
              Encuentra tu estilo
            </p>
            <h2 className="font-heading text-[clamp(2rem,5.2vw,3.75rem)] leading-[0.95] font-bold tracking-tight text-carbon uppercase">
              Hecho para cada movimiento
            </h2>
          </div>

          <Link
            href="/productos"
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-full border border-carbon/30 px-8 text-xs font-semibold tracking-[0.18em] text-carbon uppercase transition-colors duration-200 hover:border-carbon hover:bg-carbon hover:text-cream focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Ver todas las categorías
          </Link>
        </motion.div>

        {/* Retícula de tarjetas de categoría. */}
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          {categories.map((category, index) => (
            <motion.div
              key={category.slug}
              data-reveal
              initial={shouldReduceMotion ? undefined : { opacity: 0, y: 50 }}
              whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{
                duration: 0.9,
                ease: EASE,
                delay: shouldReduceMotion ? 0 : index * 0.08,
              }}
            >
              <Link
                href={`/productos?categoria=${category.slug}`}
                className="group relative block h-[420px] overflow-hidden rounded-lg bg-carbon focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:h-[440px] lg:h-[560px]"
              >
                {/* Imagen: marcador reservado con el espacio ya ocupado. */}
                <div className="absolute inset-0 overflow-hidden">
                  {category.image ? (
                    <Image
                      src={category.image}
                      alt={`Categoría ${category.name}`}
                      fill
                      unoptimized
                      sizes="(min-width: 640px) 50vw, 100vw"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className={`absolute inset-0 ${PLACEHOLDERS[index % PLACEHOLDERS.length]} transition-transform duration-700 ease-out group-hover:scale-[1.06]`}
                    >
                      <div
                        className={`absolute inset-0 ${HALOS[index % HALOS.length]}`}
                      />
                    </div>
                  )}
                  {!category.image && (
                    <span className="absolute inset-x-0 top-10 flex justify-center">
                      <span className="rounded-full border border-cream/20 px-4 py-1.5 text-[10px] font-medium tracking-[0.22em] text-cream/50 uppercase">
                        Fotografía de categoría
                      </span>
                    </span>
                  )}
                </div>

                {/* Degradado inferior para que el texto contraste con la foto. */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_35%,rgba(0,0,0,0.72)_100%)]"
                />

                {/* Contenido superpuesto. */}
                <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3.5 px-8 pt-24 pb-10 text-center">
                  <h3 className="font-heading text-[clamp(1.5rem,3vw,1.75rem)] leading-tight font-bold tracking-tight text-white uppercase">
                    {category.name}
                  </h3>
                  <p className="max-w-md text-sm leading-relaxed font-light text-white/85 sm:text-[0.95rem]">
                    {category.description ?? "Explora la selección."}
                  </p>
                  <span className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-white px-8 text-xs font-semibold tracking-[0.12em] text-carbon uppercase transition-colors duration-200 group-hover:bg-cream">
                    Explorar
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
