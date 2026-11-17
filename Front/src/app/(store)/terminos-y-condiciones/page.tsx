import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { termsDocument } from "@/data/legal/terms";

const title = "Términos y Condiciones — UPBUY";
const description =
  "Condiciones de uso y compra de UPBUY: precios, pagos, envíos, retracto, cambios, garantía y atención al cliente en Colombia y Argentina.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/terminos-y-condiciones" },
  robots: { index: true, follow: true },
  openGraph: {
    title,
    description,
    type: "article",
    locale: "es_CO",
    siteName: "UPBUY",
    modifiedTime: termsDocument.updatedAt,
  },
};

export default function TerminosYCondicionesPage() {
  return <LegalPageShell document={termsDocument} />;
}
