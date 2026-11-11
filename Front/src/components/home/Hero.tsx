"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import GlitchText from "@/components/GlitchText";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/mock-data";

type HeroProps = {
  featured: Product;
};

// Hero editorial: titular grande con GlitchText, texto comercial breve y dos CTAs.
// La imagen es un marcador preparado para la fotografía comercial real.
export function Hero({ featured }: HeroProps) {
  const shouldReduceMotion = usePrefersReducedMotion();

  const container = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
  };

  const item = {
    hidden: { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: "easeOut" as const },
    },
  };

  return (
    <section className="relative isolate overflow-hidden bg-carbon text-cream">
      {/* Fondo editorial sutil */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_80%_10%,rgba(211,84,0,0.18)_0%,rgba(11,11,11,0)_60%)]"
      />

      <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-4 pt-28 pb-16 sm:px-6 sm:pt-32 lg:grid-cols-12 lg:gap-8 lg:px-10 lg:pt-36 lg:pb-24">
        <motion.div
          variants={shouldReduceMotion ? undefined : container}
          initial={shouldReduceMotion ? undefined : "hidden"}
          animate={shouldReduceMotion ? undefined : "visible"}
          className="lg:col-span-6"
        >
          <motion.p
            data-animate
            variants={shouldReduceMotion ? undefined : item}
            className="text-xs font-semibold tracking-[0.25em] text-terracotta uppercase"
          >
            La nueva generación de ropa
          </motion.p>

          <motion.h1
            data-animate
            variants={shouldReduceMotion ? undefined : item}
            className="mt-5 font-heading text-[clamp(2.5rem,6vw,5rem)] leading-[1.02] font-bold tracking-tight uppercase"
          >
            <GlitchText
              mode="slices"
              speed={0.35}
              intensity={0.32}
              offset={6}
              trigger="always"
              shadowColors={["#D35400", "#8B6F56"]}
              color="#F5E9D7"
              className="font-heading text-[clamp(2.25rem,7.5vw,5rem)] leading-[1.02] font-bold tracking-tight uppercase"
            >
              Muévete a tu manera
            </GlitchText>
          </motion.h1>

          <motion.p
            data-animate
            variants={shouldReduceMotion ? undefined : item}
            className="mt-6 max-w-xl text-base leading-relaxed text-cream/75 sm:text-lg"
          >
            Prendas con identidad propia: siluetas modernas, materiales elegidos para
            durar y detalles que cuentan quién eres. Hechas para acompañar cada movimiento
            de tu día.
          </motion.p>

          <motion.div
            data-animate
            variants={shouldReduceMotion ? undefined : item}
            className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Link
              href="/productos"
              className="inline-flex h-12 items-center justify-center rounded-full bg-terracotta-deep px-7 text-sm font-semibold text-cream transition-colors hover:bg-[#8F3900] focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-carbon"
            >
              Explorar colección
            </Link>
            <Link
              href="/nosotros"
              className="inline-flex h-12 items-center justify-center rounded-full border border-cream/30 px-7 text-sm font-semibold text-cream transition-colors hover:border-cream hover:bg-cream/10 focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-carbon"
            >
              Conocer la marca
            </Link>
          </motion.div>
        </motion.div>

        <motion.div
          data-animate
          initial={shouldReduceMotion ? undefined : { opacity: 0, scale: 1.04 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="lg:col-span-6"
        >
          {/* Marcador de imagen principal: se reemplaza por la fotografía comercial. */}
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-cream/10 bg-[linear-gradient(145deg,#1C1C1C_0%,#2A2A2A_55%,#3A2A20_100%)] sm:aspect-[16/10] lg:aspect-[4/5]">
            <div
              aria-hidden="true"
              className="absolute -right-16 -bottom-16 h-64 w-64 rounded-full bg-terracotta/20 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(90%_70%_at_20%_10%,rgba(245,233,215,0.10)_0%,rgba(11,11,11,0)_60%)]"
            />

            <div className="absolute inset-0 flex items-center justify-center p-6">
              <span className="rounded-full border border-cream/20 px-4 py-1.5 text-[10px] font-medium tracking-[0.22em] text-cream/50 uppercase">
                Fotografía principal
              </span>
            </div>

            {/* Producto destacado superpuesto, como en la referencia editorial. */}
            <Link
              href={`/producto/${featured.slug}`}
              className="absolute inset-x-4 bottom-4 flex items-center gap-4 rounded-xl bg-cream/95 p-3 pr-5 text-carbon transition-colors hover:bg-cream sm:inset-x-6 sm:bottom-6"
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(140deg,#EDE0CE_0%,#D9C9B3_100%)]">
                <span className="text-[8px] font-semibold tracking-[0.14em] text-coffee-deep uppercase">
                  Foto
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold tracking-[0.2em] text-coffee-deep uppercase">
                  Producto destacado
                </p>
                <p className="mt-1 truncate font-heading text-base font-semibold">
                  {featured.name}
                </p>
                <p className="text-sm font-semibold [font-variant-numeric:tabular-nums]">
                  {formatPrice(featured.price)}
                </p>
              </div>
              <ArrowUpRight className="h-5 w-5 shrink-0 text-coffee-deep" aria-hidden="true" />
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
