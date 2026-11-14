import type { Metadata } from "next";
import Link from "next/link";
import { confirmUnsubscribe } from "@/services/campaigns";

// Baja pública de difusión (ADM-7). Página noindex que el correo de campañas
// enlaza: /baja?token=<JWT firmado por usuario>. La baja la aplica el
// backend; aquí solo confirmamos el resultado.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Baja de promociones — UPBUY",
  robots: { index: false, follow: false },
};

export default async function BajaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = await confirmUnsubscribe(token ?? "");

  return (
    <main className="bg-cream pt-28">
      <section className="container-page pb-20">
        <div className="mx-auto max-w-[560px] rounded-2xl bg-white p-8 shadow-sm">
          <p className="font-heading text-sm font-bold tracking-[0.3em] text-terracotta">
            UPBUY
          </p>
          <h1 className="mt-4 font-heading text-2xl font-bold tracking-tight text-carbon">
            {result.ok ? "Baja confirmada" : "No se pudo procesar la baja"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-coffee-deep">
            {result.ok
              ? "Dejaste de recibir promociones de UPBUY a este correo. Los avisos operativos (estado de tus pedidos) no se ven afectados."
              : result.message}
          </p>
          <Link
            className="mt-6 inline-flex h-11 items-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            href="/"
          >
            Volver a la tienda
          </Link>
        </div>
      </section>
    </main>
  );
}
