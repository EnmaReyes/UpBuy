import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-carbon px-6 text-center text-cream">
      <p className="font-heading text-[clamp(3rem,10vw,6rem)] leading-none font-bold text-terracotta">
        404
      </p>
      <h1 className="font-heading text-2xl font-semibold">Esta página no existe</h1>
      <p className="max-w-md text-sm text-cream/70">
        El enlace que buscas no está disponible o cambió de lugar.
      </p>
      <Link
        href="/"
        className="inline-flex h-12 items-center justify-center rounded-lg bg-terracotta-deep px-7 text-sm font-semibold text-cream transition-colors hover:bg-[#8F3900]"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
