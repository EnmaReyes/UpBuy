import type { Metadata } from "next";
import { Clock, Mail } from "lucide-react";
import { ContactForm } from "@/components/shared/ContactForm";
import { Reveal } from "@/components/shared/Reveal";
import { DotFieldBackground } from "@/components/shared/DotFieldBackground";
import { WhatsAppIcon } from "@/components/icons/BrandIcons";
import {
  UPBUY_WHATSAPP_DISPLAY,
  UPBUY_WHATSAPP_URL,
} from "@/lib/contact";

export const metadata: Metadata = {
  title: "Contacto — UPBUY",
  description:
    "Escríbenos por dudas de pedidos, tallas, cambios o colaboraciones. Atención de lunes a viernes.",
  openGraph: {
    title: "Contacto — UPBUY",
    description: "Dudas de pedidos, tallas, cambios o colaboraciones. Hablemos.",
    type: "website",
    locale: "es_CO",
  },
};

const FAQ = [
  {
    question: "¿Cuánto tarda un envío?",
    answer:
      "El plazo estándar en Colombia es de 2 a 5 días hábiles después de la confirmación del pago. El costo y la fecha exacta se muestran en el checkout, que se habilitará con el backend.",
  },
  {
    question: "¿Puedo cambiar una talla?",
    answer:
      "Sí. Aceptamos cambios de talla, color o referencia dentro de los 15 días calendario posteriores a la entrega, siempre que la prenda esté sin uso, conserve sus etiquetas y haya stock disponible. El envío de retorno corre por cuenta del cliente y el cambio no genera reembolso de dinero.",
  },
  {
    question: "¿Cómo funcionan las devoluciones y los reembolsos?",
    answer:
      "Las devoluciones no son automáticas: se revisan con un asesor para validar el motivo y el estado del producto. Solo se reembolsa el dinero cuando el producto no llega dentro de los 10 días hábiles siguientes al despacho, cuando se ejerce el retracto legal, cuando la garantía lo determina o cuando el producto no está disponible y el cliente elige el reembolso.",
  },
  {
    question: "¿Cómo sé qué talla elegir?",
    answer:
      "Cada ficha incluye las medidas de referencia. Si estás entre dos tallas, te recomendamos elegir la mayor para un ajuste más cómodo en siluetas amplias.",
  },
  {
    question: "¿Hacen envíos internacionales?",
    answer:
      "Por ahora enviamos dentro de Colombia. La disponibilidad internacional depende de los proveedores y se anunciará cuando esté confirmada.",
  },
];

export default function ContactoPage() {
  return (
    <div className="bg-background">
      <section className="relative isolate overflow-hidden bg-carbon pt-32 pb-32 text-cream sm:pt-36 lg:pb-40">
        <DotFieldBackground variant="contacto" />
        <div className="relative z-10 container-page">
          <p className="text-xs font-semibold tracking-[0.25em] text-terracotta uppercase">
            Contacto
          </p>
          <div className="mt-5 grid gap-6 lg:grid-cols-12 lg:items-end">
            <h1 className="font-heading text-[clamp(2.5rem,6vw,5rem)] leading-[1.02] font-bold tracking-tight uppercase lg:col-span-8">
              Hablemos
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-cream/70 sm:text-base lg:col-span-4">
              Dudas de tallas, pedidos, cambios o una idea para colaborar. Respondemos de
              lunes a viernes.
            </p>
          </div>
        </div>
      </section>

      <section className="section-y">
        <div className="container-page">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
            <Reveal className="lg:col-span-5">
              <h2 className="font-heading text-2xl font-semibold text-carbon">
                Canales de atención
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Escríbenos por el canal que te quede más cómodo:
              </p>

              <div className="mt-7 flex flex-col gap-3">
                <ContactCard
                  icon={Mail}
                  label="Correo"
                  value="upbuy.official@gmail.com"
                    href="mailto:upbuy.official@gmail.com"
                  detail="Respuesta en 1–2 días hábiles"
                />
                <ContactCard
                  icon={WhatsAppIcon}
                  label="WhatsApp"
                  value={UPBUY_WHATSAPP_DISPLAY}
                  detail="Atención de lunes a viernes"
                  href={UPBUY_WHATSAPP_URL}
                  external
                />
                <ContactCard
                  icon={Clock}
                  label="Horario"
                  value="8:00 a 18:00"
                  detail="Zona horaria de Colombia (GMT-5)"
                />
              </div>

              <a
                href={UPBUY_WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-carbon px-5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
              >
                <WhatsAppIcon className="h-4 w-4" aria-hidden="true" />
                Escríbenos por WhatsApp
              </a>

              <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
                Al abrir el chat se te redirige a WhatsApp con nuestro número
                oficial; no necesitas guardar el contacto antes de escribir.
              </p>
            </Reveal>

            <Reveal className="lg:col-span-7" delay={0.1}>
              <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
                <h2 className="font-heading text-2xl font-semibold text-carbon">
                  Escríbenos
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Cuéntanos qué necesitas y te respondemos por correo.
                </p>
                <div className="mt-6">
                  <ContactForm />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-background py-16 sm:py-20">
        <div className="container-page">
          <Reveal>
            <p className="text-xs font-semibold tracking-[0.25em] text-terracotta-deep uppercase">
              Preguntas frecuentes
            </p>
            <h2 className="mt-3 font-heading text-[clamp(1.5rem,3vw,2.25rem)] leading-tight font-bold tracking-tight text-carbon">
              Antes de escribirnos
            </h2>
          </Reveal>

          <div className="mt-8 max-w-3xl">
            {FAQ.map((item) => (
              <details key={item.question} className="group border-b border-border py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-carbon">
                  {item.question}
                  <span
                    aria-hidden="true"
                    className="text-lg leading-none text-coffee-deep transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ContactCard({
  icon: Icon,
  label,
  value,
  detail,
  href,
  external = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
  href?: string;
  external?: boolean;
}) {
  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-carbon text-cream">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <p className="text-[10px] font-semibold tracking-[0.18em] text-coffee-deep uppercase">
          {label}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-carbon">{value}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        {...(external
          ? { target: "_blank", rel: "noopener noreferrer" }
          : undefined)}
        className="flex items-start gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-terracotta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
      >
        {content}
      </a>
    );
  }

  return (
    <div className="flex items-start gap-4 rounded-lg border border-border bg-card p-4">
      {content}
    </div>
  );
}
