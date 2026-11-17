import type { Metadata } from "next";
import { CookiePreferences } from "@/components/legal/CookiePreferences";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { cookiesDocument } from "@/data/legal/cookies";

const title = "Política de Cookies y Preferencias — UPBUY";
const description =
  "Qué cookies y almacenamiento local usa UPBUY, cuáles son necesarias y cómo aceptar, rechazar o cambiar tus preferencias de cookies.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/preferencias-de-cookies" },
  robots: { index: true, follow: true },
  openGraph: {
    title,
    description,
    type: "article",
    locale: "es_CO",
    siteName: "UPBUY",
    modifiedTime: cookiesDocument.updatedAt,
  },
};

export default function PreferenciasDeCookiesPage() {
  return (
    <LegalPageShell
      document={cookiesDocument}
      slots={{ "cookie-preferences": <CookiePreferences /> }}
    />
  );
}
