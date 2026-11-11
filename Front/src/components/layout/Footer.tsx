import Link from "next/link";
import { Camera, Play, Music2 } from "lucide-react";

const FOOTER_LINKS = {
  Tienda: [
    { label: "Todos los productos", href: "/productos" },
    { label: "Novedades", href: "/productos?orden=nuevos" },
    { label: "Camisetas", href: "/productos?categoria=camisetas" },
    { label: "Oversize", href: "/productos?categoria=oversize" },
    { label: "Combos", href: "/productos?categoria=combos" },
  ],
  Ayuda: [
    { label: "Contacto", href: "/contacto" },
    { label: "Envíos", href: "/nosotros" },
    { label: "Cambios y devoluciones", href: "/nosotros" },
  ],
  Políticas: [
    { label: "Términos y condiciones", href: "/nosotros" },
    { label: "Privacidad", href: "/nosotros" },
  ],
};

export function Footer() {
  return (
    <footer className="bg-carbon text-cream">
      <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-6 lg:px-10">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <p className="font-heading text-2xl font-bold tracking-tight">UPBUY</p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-cream/70">
              Marca de ropa con identidad propia. Diseños pensados para moverte con estilo,
              recomendado y comfy.
            </p>
            <div className="mt-6 flex items-center gap-2">
              <SocialLink label="Instagram" href="/contacto">
                <Camera className="h-4 w-4" />
              </SocialLink>
              <SocialLink label="TikTok" href="/contacto">
                <Music2 className="h-4 w-4" />
              </SocialLink>
              <SocialLink label="YouTube" href="/contacto">
                <Play className="h-4 w-4" />
              </SocialLink>
            </div>
          </div>

          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <nav key={title} aria-label={title}>
              <h3 className="font-heading text-sm font-semibold tracking-wide uppercase">{title}</h3>
              <ul className="mt-4 space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-cream/70 transition-colors hover:text-terracotta"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-cream/10 pt-6 text-xs text-cream/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} UPBUY. Todos los derechos reservados.</p>
          <p>Colombia · COP · Español</p>
        </div>
      </div>
    </footer>
  );
}

function SocialLink({
  children,
  href,
  label,
}: {
  children: React.ReactNode;
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-lg border border-cream/20 text-cream/80 transition-colors hover:border-terracotta hover:text-terracotta"
    >
      {children}
    </Link>
  );
}
