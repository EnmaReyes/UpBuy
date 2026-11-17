import Link from "next/link";
import type { ReactNode } from "react";
import type { LegalBlock, LegalSectionData } from "@/data/legal/types";

const bodyClass = "text-[17px] leading-[1.7] text-coffee-deep";

export function LegalSection({
  section,
  children,
}: {
  section: LegalSectionData;
  children?: ReactNode;
}) {
  return (
    <section
      id={section.id}
      aria-labelledby={`${section.id}-title`}
      className="scroll-mt-28 border-t border-border pt-10 first:border-t-0 first:pt-0"
    >
      <p className="font-heading text-xs font-bold tracking-[0.22em] text-terracotta-deep tabular-nums">
        {section.number}
      </p>
      <h2
        id={`${section.id}-title`}
        className="mt-2 font-heading text-[clamp(1.5rem,2.6vw,2rem)] leading-tight font-bold tracking-tight text-carbon"
      >
        {section.title}
      </h2>

      <div className="mt-5 space-y-4">
        {section.blocks.map((block, index) => (
          <LegalBlockView key={`${section.id}-${index}`} block={block} />
        ))}
      </div>

      {children ? <div className="mt-6">{children}</div> : null}
    </section>
  );
}

function LegalBlockView({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case "paragraph":
      return <p className={bodyClass}>{block.text}</p>;

    case "subheading":
      return (
        <h3 className="pt-2 font-heading text-lg font-semibold tracking-tight text-carbon">
          {block.text}
        </h3>
      );

    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag
          className={`${bodyClass} ml-5 space-y-2 ${
            block.ordered ? "list-decimal" : "list-disc"
          } marker:text-terracotta-deep`}
        >
          {block.items.map((item, index) => (
            <li key={index} className="pl-1">
              {item}
            </li>
          ))}
        </ListTag>
      );
    }

    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            {block.caption ? (
              <caption className="pb-3 text-left font-heading text-xs font-semibold tracking-[0.16em] text-coffee-deep uppercase">
                {block.caption}
              </caption>
            ) : null}
            <thead>
              <tr>
                {block.head.map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="border-b border-carbon/25 py-2.5 pr-4 align-bottom font-heading text-xs font-semibold tracking-wide text-carbon uppercase"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="py-3 pr-4 align-top leading-relaxed text-coffee-deep"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "links":
      return (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {block.items.map((link) => (
            <LegalAnchor key={link.href} href={link.href}>
              {link.label}
            </LegalAnchor>
          ))}
        </div>
      );

    case "note":
      return (
        <aside className="border-l-2 border-terracotta bg-muted/50 px-4 py-3">
          {block.title ? (
            <p className="font-heading text-sm font-semibold text-carbon">{block.title}</p>
          ) : null}
          <p className={`${bodyClass} text-base`}>{block.text}</p>
        </aside>
      );

    default:
      return null;
  }
}

function LegalAnchor({ href, children }: { href: string; children: ReactNode }) {
  const className =
    "inline-flex min-h-11 items-center text-sm font-semibold text-terracotta-deep underline decoration-terracotta/50 underline-offset-4 transition-colors hover:text-carbon focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

  if (href.startsWith("/") || href.startsWith("#")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
