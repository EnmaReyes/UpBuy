import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { DotFieldBackground } from "@/components/shared/DotFieldBackground";
import { Reveal } from "@/components/shared/Reveal";
import { LegalSection } from "@/components/legal/LegalSection";
import {
  LegalTableOfContents,
  type LegalTocItem,
} from "@/components/legal/LegalTableOfContents";
import type { LegalDocument } from "@/data/legal/types";

// Estructura editorial compartida por las tres páginas legales:
// cabecera oscura, índice sticky en escritorio, índice plegable en móvil y
// cuerpo de lectura con ancho controlado. Todo el contenido llega tipado.
export function LegalPageShell({
  document: doc,
  slots,
}: {
  document: LegalDocument;
  slots?: Record<string, ReactNode>;
}) {
  const toc: LegalTocItem[] = doc.sections.map((section) => ({
    id: section.id,
    number: section.number,
    title: section.title,
  }));

  return (
    <div className="bg-background" data-legal-doc>
      <section className="relative isolate overflow-hidden bg-carbon pt-32 pb-14 text-cream sm:pt-36 sm:pb-16 print:bg-white print:pt-0 print:pb-0 print:text-black">
        <div className="print:hidden" aria-hidden="true">
          <DotFieldBackground variant="legal" />
        </div>
        <div className="relative z-10 container-page">
          <Reveal>
            <p className="text-xs font-semibold tracking-[0.25em] text-terracotta uppercase print:text-black">
              {doc.eyebrow}
            </p>
            <h1 className="mt-4 max-w-4xl font-heading text-[clamp(1.9rem,4.6vw,3.5rem)] leading-[1.05] font-bold tracking-tight uppercase">
              {doc.title}
            </h1>
            <p className="mt-5 text-xs font-medium tracking-wide text-cream/60 uppercase print:text-black">
              Última actualización:{" "}
              <time dateTime={doc.updatedAt}>{doc.updatedLabel}</time>
            </p>
            <div className="mt-5 max-w-2xl space-y-3 text-sm leading-relaxed text-cream/70 sm:text-base print:text-black">
              {doc.intro.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <div className="container-page section-y print:py-0">
        <div className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-14">
          <aside className="hidden lg:block print:hidden">
            <div className="sticky top-28 max-h-[calc(100dvh-8rem)] overflow-y-auto pb-6">
              <LegalTableOfContents items={toc} />
            </div>
          </aside>

          <div className="min-w-0">
            <details className="group border-y border-border py-3 lg:hidden print:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-carbon focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta [&::-webkit-details-marker]:hidden">
                En esta página
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-coffee-deep transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <ol className="mt-3 space-y-1">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="flex min-h-11 items-center gap-3 border-l border-border pl-3 text-sm text-coffee-deep transition-colors hover:text-carbon focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                    >
                      <span className="shrink-0 font-heading text-[11px] font-semibold tracking-wide tabular-nums">
                        {item.number}
                      </span>
                      <span>{item.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </details>

            <article className="mt-10 max-w-[70ch] lg:mt-0">
              <div className="space-y-12">
                {doc.sections.map((section) => (
                  <LegalSection key={section.id} section={section}>
                    {section.slotKey ? slots?.[section.slotKey] : null}
                  </LegalSection>
                ))}
              </div>

              {doc.closing ? (
                <p className="mt-12 border-t border-border pt-6 text-sm leading-relaxed text-coffee-deep">
                  {doc.closing}
                </p>
              ) : null}
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
