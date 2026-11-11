import { cn } from "@/lib/utils";

// Campos y mensajes compartidos por los formularios de autenticación y cuenta.

export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={id}
        className="text-xs font-semibold tracking-[0.14em] text-coffee-deep uppercase"
      >
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {error ? (
        <p className="text-xs font-medium text-terracotta-deep">{error}</p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "h-12 w-full rounded-lg border border-border bg-card px-4 text-sm text-carbon placeholder:text-muted-foreground focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

export function FormMessage({
  kind,
  children,
}: {
  kind: "error" | "success";
  children: React.ReactNode;
}) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg border p-3 text-sm leading-relaxed",
        kind === "error"
          ? "border-terracotta/30 bg-terracotta/5 text-terracotta-deep"
          : "border-coffee/30 bg-coffee/5 text-coffee-deep",
      )}
    >
      {children}
    </p>
  );
}

export function SubmitButton({
  pending,
  children,
  className,
}: {
  pending: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex h-12 items-center justify-center rounded-lg bg-carbon px-6 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {pending ? "Procesando…" : children}
    </button>
  );
}
