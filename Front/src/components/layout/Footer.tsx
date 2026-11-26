import Link from "next/link";
import { CookieSettingsLink } from "@/components/layout/CookieSettingsLink";
import {
  FacebookIcon,
  InstagramIcon,
  WhatsAppIcon,
} from "@/components/icons/BrandIcons";
import {
  UPBUY_FACEBOOK_URL,
  UPBUY_INSTAGRAM_URL,
  UPBUY_WHATSAPP_URL,
} from "@/lib/contact";

type FooterLink = {
  label: string;
  href: string;
  cookieSettings?: boolean;
};

const FOOTER_LINKS: Record<string, FooterLink[]> = {
  Tienda: [
    { label: "Todos los productos", href: "/productos" },
    { label: "Novedades", href: "/productos?nuevos=1" },
    { label: "Femenino", href: "/productos?categoria=femenino" },
    { label: "Masculino", href: "/productos?categoria=masculino" },
    { label: "Calzados", href: "/productos?categoria=calzado" },
    { label: "Accesorios", href: "/productos?categoria=accesorios" },
  ],
  Ayuda: [
    { label: "Contacto", href: "/contacto" },
    { label: "Envíos", href: "/terminos-y-condiciones#envios" },
    {
      label: "Cambios y devoluciones",
      href: "/terminos-y-condiciones#cambios",
    },
  ],
  Políticas: [
    { label: "Términos y condiciones", href: "/terminos-y-condiciones" },
    { label: "Política de privacidad", href: "/politica-de-privacidad" },
    {
      label: "Preferencias de cookies",
      href: "/preferencias-de-cookies#preferencias",
      cookieSettings: true,
    },
  ],
};

const SOCIAL_LINKS = [
  {
    label: "Instagram",
    href: UPBUY_INSTAGRAM_URL,
    Icon: InstagramIcon,
  },
  {
    label: "Facebook",
    href: UPBUY_FACEBOOK_URL,
    Icon: FacebookIcon,
  },
  {
    label: "WhatsApp",
    href: UPBUY_WHATSAPP_URL,
    Icon: WhatsAppIcon,
  },
];

export function Footer() {
  return (
    <footer className="bg-carbon text-cream">
      <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-6 lg:px-10">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <p className="font-heading text-2xl font-bold tracking-tight">
              UPBUY
            </p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-cream/70">
              Marca de ropa con identidad propia. Diseños pensados para moverte
              con estilo, recomendado y comfy.
            </p>
            <div className="mt-6 flex items-center gap-2">
              {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                <SocialLink key={label} label={label} href={href}>
                  <Icon className="h-4 w-4" />
                </SocialLink>
              ))}
            </div>
          </div>

          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <nav key={title} aria-label={title}>
              <h3 className="font-heading text-sm font-semibold tracking-wide uppercase">
                {title}
              </h3>
              <ul className="mt-4 space-y-2">
                {links.map((link) => {
                  const linkClass =
                    "inline-flex min-h-11 items-center text-sm text-cream/70 transition-colors hover:text-terracotta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

                  return (
                    <li key={link.label}>
                      {link.cookieSettings ? (
                        <CookieSettingsLink className={linkClass}>
                          {link.label}
                        </CookieSettingsLink>
                      ) : (
                        <Link href={link.href} className={linkClass}>
                          {link.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-cream/10 pt-6 text-xs text-cream/50 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} UPBUY. Todos los derechos reservados.
          </p>
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
  // Los destinos son externos (redes sociales), así que se usa un <a> normal
  // en vez de <Link> y se abre en pestaña nueva.
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="flex h-11 w-11 items-center justify-center rounded-lg border border-cream/20 text-cream/80 transition-colors hover:border-terracotta hover:text-terracotta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
    >
      {children}
    </a>
  );
}
