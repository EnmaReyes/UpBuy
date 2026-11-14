"use client";

/**
 * @author: @kokonutui (adaptado al panel UPBUY)
 * @description: Empty State
 * @version: 1.1.0
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 *
 * Estado vacío para secciones del panel sin datos todavía (sin campañas, sin
 * audiencia, sin registros).
 */

import { Inbox } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  title?: string;
  description?: string;
  /** Icono lucide-react de la sección. Por defecto, Inbox. */
  icon?: LucideIcon;
  action?: EmptyStateAction | null;
  className?: string;
}

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const REVEAL = {
  hidden: { opacity: 0, y: 6, filter: "blur(2px)" },
  shown: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.3, ease: EASE_OUT },
  },
};

export default function EmptyState({
  title = "Aún no hay nada aquí",
  description,
  icon: Icon = Inbox,
  action,
  className,
}: EmptyStateProps) {
  return (
    <MotionConfig reducedMotion="user">
      <div
        className={cn(
          "flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-border bg-card px-8 py-10 text-center",
          className,
        )}
      >
        <motion.span
          animate="shown"
          className="flex size-12 items-center justify-center rounded-full bg-muted text-coffee-deep"
          initial="hidden"
          variants={REVEAL}
        >
          <Icon aria-hidden="true" className="size-5" />
        </motion.span>

        <motion.div animate="shown" initial="hidden" transition={{ delayChildren: 0.05 }}>
          <motion.p
            className="mt-4 font-heading font-semibold text-[16px] tracking-tight text-carbon"
            variants={REVEAL}
          >
            {title}
          </motion.p>
          {description ? (
            <motion.p
              className="mx-auto mt-1 max-w-[360px] text-[13.5px] leading-snug text-coffee-deep"
              variants={REVEAL}
            >
              {description}
            </motion.p>
          ) : null}
          {action ? (
            <motion.div className="mt-5 flex justify-center" variants={REVEAL}>
              <button
                className="inline-flex h-11 items-center rounded-lg bg-carbon px-4 font-semibold text-sm text-cream transition-colors hover:bg-terracotta-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={action.onClick}
                type="button"
              >
                {action.label}
              </button>
            </motion.div>
          ) : null}
        </motion.div>
      </div>
    </MotionConfig>
  );
}
