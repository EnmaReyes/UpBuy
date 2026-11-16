import { Home, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminProduct } from "@/types/admin";

// Insignias del catalogo. El color no es la unica senal: siempre hay texto.

const base =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap";

export type CatalogVisibility =
  | "visible"
  | "hidden"
  | "draft"
  | "archived";

export function productVisibility(product: AdminProduct): CatalogVisibility {
  if (product.status === "archived") return "archived";
  if (product.status === "draft") return "draft";
  return product.active ? "visible" : "hidden";
}

const LABELS: Record<CatalogVisibility, string> = {
  visible: "Visible",
  hidden: "Oculto",
  draft: "Borrador",
  archived: "Archivado",
};

const TONES: Record<CatalogVisibility, string> = {
  visible: "bg-emerald-100 text-emerald-900",
  hidden: "bg-amber-100 text-amber-900",
  draft: "bg-sky-100 text-sky-900",
  archived: "bg-muted text-coffee-deep",
};

export function VisibilityBadge({ product }: { product: AdminProduct }) {
  const state = productVisibility(product);
  return <span className={cn(base, TONES[state])}>{LABELS[state]}</span>;
}

export function FeaturedBadge() {
  return (
    <span className={cn(base, "bg-terracotta/10 text-terracotta-deep")}>
      <Star aria-hidden="true" className="h-3 w-3" />
      Destacado
    </span>
  );
}

/** Secciones de la portada donde está curado el producto. */
export function HomeSectionBadges({ sections }: { sections: string[] }) {
  if (sections.length === 0) return null;
  return (
    <span className={cn(base, "bg-coffee/10 text-coffee-deep")}>
      <Home aria-hidden="true" className="h-3 w-3" />
      Portada: {sections.join(" · ")}
    </span>
  );
}
