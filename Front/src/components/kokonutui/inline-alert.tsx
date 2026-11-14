"use client";

/**
 * @author: @kokonutui (adaptado al panel UPBUY)
 * @description: Inline Alert
 * @version: 1.1.0
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 *
 * Aviso en línea para estados de configuración faltante o errores de una
 * sección del panel. Reemplaza los bloques de error escritos a mano.
 */

import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type InlineAlertTone = "warning" | "danger" | "info" | "success";

export interface InlineAlertProps {
  title: string;
  message?: ReactNode;
  tone?: InlineAlertTone;
  /** Acción opcional (un solo botón, al final del aviso). */
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const TONE_STYLES: Record<InlineAlertTone, { box: string; icon: string }> = {
  warning: {
    box: "border-terracotta/30 bg-terracotta/5 text-terracotta-deep",
    icon: "bg-terracotta",
  },
  danger: {
    box: "border-terracotta/40 bg-terracotta/10 text-terracotta-deep",
    icon: "bg-terracotta-deep",
  },
  info: {
    box: "border-coffee/30 bg-coffee/5 text-coffee-deep",
    icon: "bg-coffee",
  },
  success: {
    box: "border-coffee/30 bg-coffee/5 text-coffee-deep",
    icon: "bg-coffee-deep",
  },
};

export default function InlineAlert({
  title,
  message,
  tone = "warning",
  action,
  className,
}: InlineAlertProps) {
  const styles = TONE_STYLES[tone];
  const Icon = tone === "info" ? Info : tone === "success" ? CircleCheck : CircleAlert;

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        aria-live={tone === "danger" ? "assertive" : "polite"}
        className={cn(
          "flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-start sm:gap-3",
          styles.box,
          className,
        )}
        initial={{ opacity: 0, y: 4 }}
        role={tone === "danger" ? "alert" : "status"}
        transition={{ duration: 0.25, ease: EASE_OUT }}
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-white",
            styles.icon,
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[14px] leading-5 text-carbon">{title}</p>
          {message ? (
            <p className="mt-0.5 text-[13px] leading-relaxed">{message}</p>
          ) : null}
        </div>

        {action ? (
          <button
            className="mt-1 inline-flex h-9 shrink-0 items-center rounded-lg border border-current/30 px-3 text-[13px] font-semibold text-carbon transition-colors hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={action.onClick}
            type="button"
          >
            {action.label}
          </button>
        ) : null}
      </motion.div>
    </MotionConfig>
  );
}
