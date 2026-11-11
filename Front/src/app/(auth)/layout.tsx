import Link from "next/link";
import { ArrowLeft, Package, ShieldCheck, Truck } from "lucide-react";

// Layout de autenticación: panel de marca a la izquierda, formulario a la
// derecha. Sin navbar ni footer de tienda para no distraer del objetivo.

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh grid-cols-1 bg-background lg:grid-cols-2">
      <aside className="relative isolate hidden overflow-hidden bg-carbon p-12 text-cream lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(110%_80%_at_20%_10%,rgba(211,84,0,0.28)_0%,rgba(11,11,11,0)_60%)]"
        />

        <Link
          href="/"
          className="font-heading text-2xl font-bold tracking-tight text-cream"
        >
          UPBUY
        </Link>

        <div className="max-w-md">
          <p className="text-sm font-semibold tracking-[0.25em] text-terracotta uppercase">
            Tu cuenta
          </p>
          <h2 className="mt-4 font-heading text-[clamp(2rem,3.2vw,2.75rem)] leading-[1.08] font-bold tracking-tight">
            Guarda tus datos una vez y compra más rápido.
          </h2>
          <ul className="mt-8 grid gap-4">
            <Feature icon={Truck} text="Direcciones guardadas para el envío" />
            <Feature icon={Package} text="Historial de pedidos y su estado" />
            <Feature icon={ShieldCheck} text="Compra protegida y pago seguro" />
          </ul>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-cream/60 uppercase transition-colors hover:text-cream"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Volver a la tienda
        </Link>
      </aside>

      <main className="flex flex-col">
        <div className="flex items-center justify-between p-6 lg:hidden">
          <Link
            href="/"
            className="font-heading text-xl font-bold tracking-tight text-carbon"
          >
            UPBUY
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase transition-colors hover:text-carbon"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Tienda
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pb-16 lg:pb-6">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </main>
    </div>
  );
}

function Feature({ icon: Icon, text }: { icon: typeof Truck; text: string }) {
  return (
    <li className="flex items-center gap-3 text-sm text-cream/80">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cream/15">
        <Icon className="h-4 w-4 text-terracotta" aria-hidden="true" />
      </span>
      {text}
    </li>
  );
}
