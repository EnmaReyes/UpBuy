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
  description: "E-commerce tienda online de calzados y accesorios de moda.",
  // iOS convierte teléfonos/correos en enlaces automáticamente; eso cambia el
  // DOM antes de hidratar y provoca mismatches en la página de contacto.
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
    date: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `suppressHydrationWarning` es una defensa deliberada: extensiones del
    // navegador (Grammarly, traductores, gestores de contraseñas, etc.) añaden
    // atributos como `location="localhost"` a <body> antes de que React
    // hidrate. Sin esto, Next muestra el overlay de React hydration error.
    // Solo se suprime el warning del atributo en ESTOS DOS elementos; no
    // oculta errores de hidratación del resto del árbol.
    <html
      lang="es"
      className={`${spaceGrotesk.variable} ${manrope.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Si JavaScript no se ejecuta, el contenido animado no debe quedar
            invisible: se anulan los estados iniciales de opacidad/transform. */}
        <noscript>
          <style>{`[data-reveal],[data-animate]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </head>
      <body className="antialiased font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
