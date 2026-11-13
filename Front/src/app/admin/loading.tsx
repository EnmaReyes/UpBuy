// Estado de carga del panel (ADM-1). Usa `animate-pulse` sin movimiento
// brusco y respeta `prefers-reduced-motion` mediante `motion-reduce:animate-none`.
export default function AdminLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="flex flex-col gap-6 motion-reduce:animate-none"
    >
      <span className="sr-only">Cargando el panel…</span>

      <div className="h-8 w-48 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl border border-border bg-card motion-reduce:animate-none"
          />
        ))}
      </div>

      <div className="h-64 animate-pulse rounded-xl border border-border bg-card motion-reduce:animate-none" />
    </div>
  );
}
