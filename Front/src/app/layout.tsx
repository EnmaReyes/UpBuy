import type { Metadata } from "next";
import { Space_Grotesk, Manrope } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "UpBuy",
  description: "E-commerce de ropa y DTF personalizados",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${spaceGrotesk.variable} ${manrope.variable}`}>
      <head>
        {/* Si JavaScript no se ejecuta, el contenido animado no debe quedar
            invisible: se anulan los estados iniciales de opacidad/transform. */}
        <noscript>
          <style>{`[data-reveal],[data-animate]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </head>
      <body className="antialiased font-sans">{children}</body>
    </html>
  );
}
