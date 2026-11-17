import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { privacyDocument } from "@/data/legal/privacy";

const title = "Política de Privacidad — UPBUY";
const description =
  "Conoce qué datos personales recoge UPBUY, para qué los usa, cuánto tiempo los conserva y cómo ejercer tus derechos en Colombia y Argentina.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/politica-de-privacidad" },
  robots: { index: true, follow: true },
  openGraph: {
    title,
    description,
    type: "article",
    locale: "es_CO",
    siteName: "UPBUY",
    modifiedTime: privacyDocument.updatedAt,
  },
};

export default function PoliticaDePrivacidadPage() {
  return <LegalPageShell document={privacyDocument} />;
}
