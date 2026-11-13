"use client";

import { useEffect, useId, useRef, useState } from "react";
import { KeyRound, ShieldCheck, X } from "lucide-react";
import { apiSend, ApiError } from "@/services/api/client";
import { cn } from "@/lib/utils";

// Diálogo de step-up para acciones destructivas (ADM-S3).
//
// El backend responde `403 { code: "STEP_UP_REQUIRED" }` en reembolsos,
// cancelaciones, despublicaciones y gestión de administradores cuando el
// segundo factor tiene más de `ADMIN_STEP_UP_MINUTES` minutos. El panel abre
// este diálogo, pide un TOTP o un código de respaldo, y reintenta la acción
// original con `onVerified`.
//
// No ejecuta la acción: solo refresca `admin_sessions.mfaAt` en
// `POST /api/auth/admin/step-up`.

export type StepUpResult = {
  ok: boolean;
  method: "totp" | "backup_code";
  mfaAt: string;
  maxAgeMinutes: number;
};

type StepUpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llama tras validar el código. El panel reintenta la acción aquí. */
  onVerified?: (result: StepUpResult) => void | Promise<void>;
  /** Etiqueta corta de la acción, p. ej. "Reembolsar pedido". */
  actionLabel?: string;
  description?: string;
};

export function StepUpDialog({
  open,
  onOpenChange,
  onVerified,
  actionLabel,
  description,
}: StepUpDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Limpia el código cada vez que se abre y enfoca el campo.
  useEffect(() => {
    if (!open) return;
    setCode("");
    setError(null);
    setPending(false);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Escape cierra el diálogo; el foco no abandona el documento.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, pending, onOpenChange]);

  if (!open) return null;

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Escribe el código de tu aplicación de autenticación.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      const result = await apiSend<StepUpResult>("/api/auth/admin/step-up", {
        method: "POST",
        body: { code: trimmed },
      });
      await onVerified?.(result);
      onOpenChange(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "MFA_INVALID_CODE") {
        setError(
          "El código no es válido o ya se usó. Prueba con el siguiente código de tu app.",
        );
      } else if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError("No se pudo verificar el código. Intenta de nuevo.");
      }
      setPending(false);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-carbon/60 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onOpenChange(false);
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-terracotta/10 text-terracotta-deep">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2
                id={titleId}
                className="font-heading text-lg font-semibold text-carbon"
              >
                Confirma tu identidad
              </h2>
              <p
                id={descriptionId}
                className="mt-1 text-sm leading-relaxed text-coffee-deep"
              >
                {description ||
                  (actionLabel
                    ? `Para ${actionLabel.toLowerCase()} necesitamos un código reciente.`
                    : "Esta acción exige un código de verificación reciente.")}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            aria-label="Cerrar"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-coffee-deep transition-colors hover:bg-muted hover:text-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3">
          <label
            htmlFor="step-up-code"
            className="text-xs font-semibold tracking-[0.14em] text-coffee-deep uppercase"
          >
            Código de verificación
          </label>

          <div className="relative">
            <KeyRound
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              id="step-up-code"
              name="code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="one-time-code"
              inputMode="text"
              maxLength={20}
              placeholder="123456 o XXXXX-XXXXX"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "step-up-error" : undefined}
              disabled={pending}
              className={cn(
                "h-12 w-full rounded-lg border border-border bg-background pr-4 pl-10 text-sm tracking-[0.18em] text-carbon placeholder:tracking-normal placeholder:text-muted-foreground focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
                error && "border-terracotta",
              )}
            />
          </div>

          {error ? (
            <p
              id="step-up-error"
              role="alert"
              className="rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-sm leading-relaxed text-terracotta-deep"
            >
              {error}
            </p>
          ) : null}

          <p className="text-xs leading-relaxed text-muted-foreground">
            Usa el código de 6 dígitos de tu app de autenticación. Si perdiste
            el dispositivo, puedes usar uno de tus códigos de respaldo.
          </p>

          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Verificando…" : "Verificar y continuar"}
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
