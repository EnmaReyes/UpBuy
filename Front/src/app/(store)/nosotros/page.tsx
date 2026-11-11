import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/shared/Reveal";

export const metadata: Metadata = {
  title: "Nosotros — UPBUY",
  description:
    "UPBUY es ropa con identidad propia: piezas pensadas para acompañar el movimiento real, con materiales elegidos y una mirada editorial.",
  openGraph: {
    title: "Nosotros — UPBUY",
    description: "Ropa con identidad propia, pensada para el movimiento real.",
    type: "website",
    locale: "es_CO",
  },
};

const VALUES = [
  {
    number: "01",
    title: "Movimiento",
    description:
      "Diseñamos para el ritmo real: la calle, el trabajo, el entrenamiento y el descanso. Nada que estorbe, nada que sobre.",
  },
  {
    number: "02",
    title: "Carácter",
    description:
      "Siluetas que se reconocen sin gritar. Detalles medidos, estampados con intención y una paleta que combina con lo que ya tienes.",
  },
  {
    number: "03",
    title: "Duración",
    description:
      "Textiles y acabados elegidos para el uso diario. Preferimos una prenda que aguante cien lavadas a una que se vea bien una vez.",
  },
  {
    number: "04",
    title: "Identidad",
    description:
      "No vestimos a todo el mundo igual. Cada pieza está pensada para que la hagas tuya, no para que la imites.",
  },
];

const NUMBERS = [
  { value: "100%", label: "Piezas revisadas antes de publicarse" },
  { value: "6", label: "Tallas en las siluetas principales" },
  { value: "30", label: "Días para cambios y devoluciones" },
];

export default function NosotrosPage() {
  return (
    <div className="bg-background">
      <section className="bg-carbon pt-28 pb-16 text-cream sm:pt-32 lg:pb-24">
        <div className="container-page">
          <p className="text-xs font-semibold tracking-[0.25em] text-terracotta uppercase">
            Nosotros
          </p>
          <div className="mt-5 grid gap-8 lg:grid-cols-12 lg:items-end">
            <h1 className="font-heading text-[clamp(2.5rem,6vw,5rem)] leading-[1.02] font-bold tracking-tight uppercase lg:col-span-8">
              Ropa con{" "}
              <br />
              identidad propia
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-cream/70 sm:text-base lg:col-span-4">
              Nacimos de una idea simple: la ropa debe acompañar a quien la usa, no al
              contrario. Desde Colombia, diseñamos piezas que se sienten bien y se ven
              como tú.
            </p>
          </div>
        </div>
      </section>

      <section className="section-y">
        <div className="container-page">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
            <Reveal className="lg:col-span-6">
              <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-[linear-gradient(150deg,#1C1C1C_0%,#2A2A2A_55%,#3A2A20_100%)]">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-[radial-gradient(100%_80%_at_20%_10%,rgba(211,84,0,0.22)_0%,rgba(11,11,11,0)_60%)]"
                />
                <span className="absolute inset-0 flex items-center justify-center p-8 text-center text-[10px] font-medium tracking-[0.22em] text-cream/50 uppercase">
                  Fotografía de marca
                </span>
              </div>
            </Reveal>

            <Reveal className="lg:col-span-6" delay={0.1}>
              <p className="text-xs font-semibold tracking-[0.25em] text-terracotta-deep uppercase">
                Nuestra historia
              </p>
              <h2 className="mt-3 font-heading text-[clamp(1.75rem,3.5vw,3rem)] leading-tight font-bold tracking-tight text-carbon">
                Empezamos por lo que nos faltaba
              </h2>
              <div className="mt-5 space-y-4 text-sm leading-relaxed text-coffee-deep sm:text-base">
                <p>
                  UPBUY nació de una búsqueda personal: prendas cómodas, bien cortadas y con
                  personalidad, sin los precios de una marca de lujo ni el ruido de una
                  tendencia que dura una semana.
                </p>
                <p>
                  Trabajamos con talleres y proveedores que conocemos, probamos cada silueta
                  antes de publicarla y ajustamos lo que haga falta. No lanzamos una colección
                  para llenar un calendario: la lanzamos cuando está lista.
                </p>
                <p>
                  Hoy somos una marca pequeña con una idea grande: que lo que te pones sea una
                  extensión de cómo te mueves.
                </p>
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/productos"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-carbon px-7 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
                >
                  Ver la colección
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/contacto"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-border px-7 text-sm font-semibold text-carbon transition-colors hover:border-carbon"
                >
                  Hablar con nosotros
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section-y bg-muted">
        <div className="container-page">
          <Reveal>
            <p className="text-xs font-semibold tracking-[0.25em] text-terracotta-deep uppercase">
              Nuestro estándar
            </p>
            <h2 className="mt-3 max-w-2xl font-heading text-[clamp(1.75rem,3.5vw,3rem)] leading-tight font-bold tracking-tight text-carbon">
              Diseño pensado. Uso real.
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map((value, index) => (
              <Reveal key={value.number} delay={index * 0.07}>
                <div className="flex flex-col gap-3 border-t border-border pt-5">
                  <span className="font-heading text-sm font-bold tracking-[0.2em] text-coffee-deep">
                    {value.number}
                  </span>
                  <h3 className="font-heading text-xl font-semibold text-carbon">{value.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {value.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section-y bg-background">
        <div className="container-page">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
            <Reveal className="lg:col-span-5">
              <p className="text-xs font-semibold tracking-[0.25em] text-terracotta-deep uppercase">
                En números
              </p>
              <h2 className="mt-3 font-heading text-[clamp(1.75rem,3.5vw,3rem)] leading-tight font-bold tracking-tight text-carbon">
                Lo que cuidamos en cada pieza
              </h2>
            </Reveal>

            <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:col-span-7">
              {NUMBERS.map((item) => (
                <div key={item.value} className="bg-card px-6 py-8 text-center sm:text-left">
                  <p className="font-heading text-3xl font-bold tracking-tight text-carbon [font-variant-numeric:tabular-nums]">
                    {item.value}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed tracking-wide text-muted-foreground uppercase">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
