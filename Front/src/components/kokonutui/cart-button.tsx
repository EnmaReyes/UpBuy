"use client";

/**
 * @author: @dorianbaffier
 * @description: Cart Button
 * @version: 1.0.0
 * @date: 2026-10-22
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import {
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** Pill widths: "Add +" at rest, "− n +" once something is in the cart. */
const WIDTH_CLOSED = 80;
const WIDTH_OPEN = 108;
/** Press and hold + or −: wait, then repeat faster and faster. */
const HOLD_DELAY = 380;
const REPEAT_FIRST = 150;
const REPEAT_FASTEST = 55;
/** How long "Limit n per order" stays up. */
const LIMIT_FOR = 1600;

export interface AddToCartButtonProps {
  /** Controlled quantity. Leave out to let the button keep its own. */
  quantity?: number;
  defaultQuantity?: number;
  /** Most of this item one order can hold. */
  max?: number;
  /** Item name, used in the button labels for screen readers. */
  name?: string;
  label?: string;
  onQuantityChange?: (quantity: number) => void;
  className?: string;
}

/**
 * "Add +" that opens into a "− n +" stepper in place. The + never moves, so a
 * second tap lands where the first did. At one, − turns into a bin; holding
 * + or − repeats, and a hold on − stops at one rather than emptying the line.
 */
export function AddToCartButton({
  quantity,
  defaultQuantity = 0,
  max = 9,
  name = "producto",
  label = "Añadir",
  onQuantityChange,
  className,
}: AddToCartButtonProps) {
  const [ownQuantity, setOwnQuantity] = useState(defaultQuantity);
  const value = quantity ?? ownQuantity;
  const [direction, setDirection] = useState(1);
  const [limitHits, setLimitHits] = useState(0);
  const [showLimit, setShowLimit] = useState(false);
  const reduceMotion = usePrefersReducedMotion();

  const valueRef = useRef(value);
  valueRef.current = value;
  const holdRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // A touch press waiting to turn out a tap, a hold, or the start of a scroll.
  const touchRef = useRef<number | null>(null);
  const limitRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const addRef = useRef<HTMLButtonElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<"add" | "plus" | null>(null);

  const open = value > 0;

  const commit = useCallback(
    (next: number) => {
      const clamped = Math.min(max, Math.max(0, next));
      if (clamped === valueRef.current) {
        return;
      }
      setDirection(clamped > valueRef.current ? 1 : -1);
      valueRef.current = clamped;
      if (quantity === undefined) {
        setOwnQuantity(clamped);
      }
      onQuantityChange?.(clamped);
    },
    [max, quantity, onQuantityChange]
  );

  const hitLimit = useCallback(() => {
    setLimitHits((hits) => hits + 1);
    setShowLimit(true);
    clearTimeout(limitRef.current);
    limitRef.current = setTimeout(() => setShowLimit(false), LIMIT_FOR);
  }, []);

  /** One step; returns false when the step can't happen. */
  const step = useCallback(
    (delta: number) => {
      if (delta > 0 && valueRef.current >= max) {
        hitLimit();
        return false;
      }
      if (delta < 0 && valueRef.current === 1) {
        // The last one out: hand focus back to "Add" if it was on −.
        focusNext.current = "add";
      }
      commit(valueRef.current + delta);
      return true;
    },
    [commit, hitLimit, max]
  );

  const stopHold = useCallback(() => {
    clearTimeout(holdRef.current);
    touchRef.current = null;
  }, []);

  // A touch that was neither cancelled by a scroll nor held long enough to
  // repeat counts as one tap when the finger lifts.
  const endPress = () => {
    const delta = touchRef.current;
    stopHold();
    if (delta !== null) {
      step(delta);
    }
  };

  const startHold = (delta: number) => (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    stopHold();
    let interval = REPEAT_FIRST;
    const tick = () => {
      // A hold on − stops at one: emptying the line takes its own tap.
      if (delta < 0 && valueRef.current <= 1) {
        return;
      }
      if (!step(delta)) {
        return;
      }
      interval = Math.max(REPEAT_FASTEST, interval * 0.82);
      holdRef.current = setTimeout(tick, interval);
    };
    // In a list, a finger landing on + may be starting a scroll, so touch
    // waits for the lift (or the hold) instead of stepping on contact.
    if (event.pointerType === "touch") {
      touchRef.current = delta;
      holdRef.current = setTimeout(() => {
        touchRef.current = null;
        if (step(delta)) {
          holdRef.current = setTimeout(tick, REPEAT_FIRST);
        }
      }, HOLD_DELAY);
      return;
    }
    if (!step(delta)) {
      return;
    }
    holdRef.current = setTimeout(tick, HOLD_DELAY);
  };

  // Mouse presses step on pointerdown, touch on release; Enter and Space
  // arrive as a click.
  const keyStep = (delta: number) => (event: MouseEvent) => {
    if (event.detail === 0) {
      step(delta);
    }
  };

  const add = () => {
    focusNext.current = "plus";
    setDirection(1);
    commit(1);
  };

  useEffect(() => {
    if (focusNext.current === "plus" && value > 0) {
      plusRef.current?.focus();
    }
    if (focusNext.current === "add" && value === 0) {
      // After the press settles, or the browser drops focus on the removed −.
      requestAnimationFrame(() => addRef.current?.focus());
    }
    focusNext.current = null;
    if (value === 0) {
      clearTimeout(holdRef.current);
    }
  }, [value]);

  useEffect(
    () => () => {
      clearTimeout(holdRef.current);
      clearTimeout(limitRef.current);
    },
    []
  );

  const atMax = value >= max;
  const fade = reduceMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: EASE_OUT };

  return (
    <div className={cn("relative inline-flex", className)}>
      <AnimatePresence>
        {showLimit && (
          <motion.span
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-none absolute right-0 bottom-full mb-2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 font-medium text-[11px] text-white dark:bg-zinc-100 dark:text-zinc-900"
            exit={{ opacity: 0, y: 2 }}
            initial={{ opacity: 0, y: 4 }}
            role="status"
            transition={fade}
          >
            Máximo {max} por pedido
          </motion.span>
        )}
      </AnimatePresence>

      <motion.div
        animate={{ width: open ? WIDTH_OPEN : WIDTH_CLOSED }}
        className={cn(
          "relative h-9 overflow-hidden rounded-full ring-1 transition-colors duration-200 motion-reduce:transition-none",
          open
            ? "bg-zinc-900 text-white ring-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:ring-zinc-100"
            : "bg-white text-zinc-900 shadow-xs ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-800 dark:hover:bg-zinc-800/70"
        )}
        initial={false}
        transition={{ ...fade, duration: reduceMotion ? 0 : 0.32 }}
      >
        <AnimatePresence initial={false}>
          {!open && (
            <motion.span
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-3.5 z-10 flex items-center font-medium text-sm"
              exit={{ opacity: 0, x: -6, filter: "blur(2px)" }}
              initial={{ opacity: 0, x: -6, filter: "blur(2px)" }}
              key="label"
              transition={fade}
            >
              {label}
            </motion.span>
          )}
        </AnimatePresence>

        {open ? (
          <fieldset className="contents">
            <legend className="sr-only">{`Cantidad de ${name}`}</legend>
            <motion.button
              animate={{ opacity: 1, x: 0 }}
              aria-label={value === 1 ? `Quitar ${name}` : `Una unidad menos de ${name}`}
              className="absolute inset-y-0 left-0 flex w-9 items-center justify-center rounded-full outline-none transition-colors duration-150 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-inset active:bg-white/20 dark:active:bg-black/10 dark:focus-visible:ring-black/30 dark:hover:bg-black/5"
              initial={{ opacity: 0, x: 16 }}
              onClick={keyStep(-1)}
              onLostPointerCapture={stopHold}
              onPointerCancel={stopHold}
              onPointerDown={startHold(-1)}
              onPointerUp={endPress}
              transition={fade}
              type="button"
            >
              <MinusGlyph bin={value === 1} reduceMotion={reduceMotion} />
            </motion.button>

            <motion.output
              animate={{ opacity: 1, x: 0 }}
              aria-live="polite"
              className="absolute inset-y-0 right-9 left-9 flex items-center justify-center overflow-hidden font-semibold text-sm tabular-nums"
              initial={{ opacity: 0, x: 12 }}
              transition={fade}
            >
              <span className="sr-only">{`${value} de ${name} en el carrito`}</span>
              <motion.span
                animate={
                  limitHits > 0 && !reduceMotion
                    ? { x: [0, -3, 3, -2, 2, 0] }
                    : undefined
                }
                aria-hidden
                className="flex"
                key={limitHits}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <RollingText
                  direction={direction}
                  reduceMotion={reduceMotion}
                  text={String(value)}
                />
              </motion.span>
            </motion.output>

            <button
              aria-disabled={atMax}
              aria-label={`Una unidad más de ${name}`}
              className={cn(
                "absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-full outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-inset dark:focus-visible:ring-black/30",
                atMax
                  ? "text-white/40 dark:text-zinc-900/35"
                  : "hover:bg-white/10 active:bg-white/20 dark:active:bg-black/10 dark:hover:bg-black/5"
              )}
              onClick={keyStep(1)}
              onLostPointerCapture={stopHold}
              onPointerCancel={stopHold}
              onPointerDown={startHold(1)}
              onPointerUp={endPress}
              ref={plusRef}
              type="button"
            >
              <Plus aria-hidden className="size-4" />
            </button>
          </fieldset>
        ) : (
          <button
            aria-label={`${label} ${name} al carrito`}
            className="absolute inset-0 flex items-center justify-end rounded-full outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-inset dark:focus-visible:ring-white/25"
            onClick={add}
            ref={addRef}
            type="button"
          >
            <span className="flex w-9 items-center justify-center">
              <Plus aria-hidden className="size-4" />
            </span>
          </button>
        )}
      </motion.div>
    </div>
  );
}

/** − at two or more; a bin at one, since the next tap empties the line. */
function MinusGlyph({
  bin,
  reduceMotion,
}: {
  bin: boolean;
  reduceMotion: boolean;
}) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        className="flex"
        exit={{ opacity: 0, scale: 0.6, filter: "blur(2px)" }}
        initial={{ opacity: 0, scale: 0.6, filter: "blur(2px)" }}
        key={bin ? "bin" : "minus"}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.16 }}
      >
        {bin ? (
          <Trash2 aria-hidden className="size-3.5" />
        ) : (
          <Minus aria-hidden className="size-4" />
        )}
      </motion.span>
    </AnimatePresence>
  );
}

/** Each character rolls on its own, keyed by its place from the right. */
function RollingText({
  text,
  direction,
  reduceMotion,
}: {
  text: string;
  direction: number;
  reduceMotion: boolean;
}) {
  const places = text.split("").map((char, index) => ({
    char,
    place: text.length - index,
  }));
  return (
    <span className="inline-flex overflow-hidden tabular-nums">
      {places.map(({ char, place }) => (
        <span className="relative inline-block" key={place}>
          <AnimatePresence custom={direction} initial={false} mode="popLayout">
            <motion.span
              animate={{ y: 0, opacity: 1 }}
              className="inline-block"
              custom={direction}
              exit={reduceMotion ? { opacity: 0 } : "out"}
              initial={reduceMotion ? { opacity: 0 } : "in"}
              key={char}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.24, ease: EASE_OUT }
              }
              variants={{
                in: (dir: number) => ({ y: dir * 12, opacity: 0 }),
                out: (dir: number) => ({ y: dir * -12, opacity: 0 }),
              }}
            >
              {char}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}
