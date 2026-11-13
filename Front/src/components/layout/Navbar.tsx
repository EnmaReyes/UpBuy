"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import {
  MorphicNavbar,
  type NavItem,
} from "@/components/kokonutui/morphic-navbar";
import { AccountButton } from "@/components/layout/AccountButton";
import { NotificationButton } from "@/components/layout/NotificationButton";
import { CartButton } from "@/components/cart/CartButton";

// Sección de la Home a la que lleva "Categorías" (rótulo "Encuentra tu estilo"
// y titular "Hecho para cada movimiento" en home/Categories.tsx).
const STYLE_SECTION_ID = "encuentra-tu-estilo";
const STYLE_SECTION_HASH = `#${STYLE_SECTION_ID}`;
const CATEGORIES_HREF = `/${STYLE_SECTION_HASH}`;

// No se incluye "Novedades" ni orden por precio: el backend no expone esos
// filtros (solo `q`, `category` y `featured`), así que el catálogo los resuelve
// con sus propias pills y búsqueda.
//
// "Categorías" no navega: hace scroll a la sección de la Home. Su clave lleva
// el hash para que el enlace sea válido y compartible, pero el `onNavigate`
// que se añade más abajo intercepta el clic.
const NAV_ITEMS: Record<string, NavItem> = {
  "/": { name: "Inicio" },
  "/productos": { name: "Tienda" },
  [CATEGORIES_HREF]: { name: "Categorías", ariaCurrent: "location" },
  "/nosotros": { name: "Nosotros" },
  "/contacto": { name: "Contacto" },
};

/** Desplaza la página a la sección de estilos respetando menos movimiento. */
function scrollToStyleSection() {
  const target = document.getElementById(STYLE_SECTION_ID);
  if (!target) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({
    behavior: reduce ? "auto" : "smooth",
    block: "start",
  });
}

// Navbar transparente/integrada al Hero. Al hacer scroll toma fondo sólido.
// La navegación de escritorio es Split Nav de Kokonut UI; en móvil se abre un
// drawer lateral con las mismas opciones.
//
// El drawer se renderiza FUERA del <header>: el header usa backdrop-blur, que
// crea un containing block y dejaría el panel fijo encerrado en el header
// (altura de 64px en vez de pantalla completa).
export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // El drawer resuelve su enlace activo por ruta, pero "Categorías" es una
  // sección de la Home: al llegar a ella la ruta sigue siendo "/", así que se
  // recuerda el enlace pulsado para no resaltar "Inicio".
  const [activeOverride, setActiveOverride] = useState<string | null>(null);
  const shouldReduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    // Al cambiar de ruta manda la ruta, salvo que se haya llegado a la sección
    // de estilos (clic desde otra página, enlace compartido o recarga).
    setActiveOverride(
      pathname === "/" && window.location.hash === STYLE_SECTION_HASH
        ? CATEGORIES_HREF
        : null,
    );
  }, [pathname]);

  // En la Home el navbar se integra al Hero oscuro; en el resto de páginas
  // arranca sólido para que el texto claro no quede sobre fondos crema.
  const solid = scrolled || menuOpen || pathname !== "/";

  const goToStyleSection = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      // Con modificador (nueva pestaña, descarga...) manda el navegador.
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return;
      }

      event.preventDefault();
      setMenuOpen(false);

      if (pathname === "/") {
        scrollToStyleSection();
        // replaceState: el scroll no debe crear una entrada de historial.
        window.history.replaceState(null, "", STYLE_SECTION_HASH);
        return;
      }

      // Navegación cliente del App Router: el efecto de abajo completa el
      // scroll cuando la Home ya está montada.
      router.push(CATEGORIES_HREF);
    },
    [pathname, router],
  );

  const navItems = useMemo(() => {
    const items: Record<string, NavItem> = { ...NAV_ITEMS };
    const categories = items[CATEGORIES_HREF];
    if (categories) {
      items[CATEGORIES_HREF] = { ...categories, onNavigate: goToStyleSection };
    }
    return items;
  }, [goToStyleSection]);

  // Al llegar a la Home con el hash en la URL (clic desde otra ruta, enlace
  // compartido o recarga) se hace el scroll aquí. El efecto corre después del
  // commit, cuando la sección ya existe; el frame extra deja asentar el layout.
  useEffect(() => {
    if (pathname !== "/" || window.location.hash !== STYLE_SECTION_HASH) {
      return;
    }
    const frame = requestAnimationFrame(scrollToStyleSection);
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
          solid
            ? "bg-carbon/95 backdrop-blur-sm border-b border-cream/10"
            : "bg-transparent",
        )}
      >
        <div className="mx-auto grid h-16 max-w-[1440px] grid-cols-[auto_1fr_auto] items-center gap-3 px-4 sm:px-6 lg:px-10 md:grid-cols-[1fr_auto_1fr]">
          <Link
            href="/"
            aria-label="UPBUY — Inicio"
            className="group flex shrink-0 items-center gap-1.5 justify-self-start"
          >
            <span className="font-heading text-lg font-bold tracking-tight text-cream sm:text-xl">
              UPBUY
            </span>
            <span
              aria-hidden="true"
              className="mb-2 size-1.5 rounded-full bg-terracotta transition-transform duration-200 group-hover:scale-125 motion-reduce:transition-none"
            />
          </Link>

          {/* Split Nav de Kokonut UI: píldoras que se separan alrededor del
              enlace activo, con hover animado, scrub y proyección de flick. */}
          <div className="hidden min-w-0 justify-center md:col-start-2 md:flex">
            <MorphicNavbar
              className="px-0 py-0"
              defaultPath=""
              items={navItems}
            />
          </div>

          <div className="col-start-3 flex items-center justify-end gap-0.5 sm:gap-2">
            <IconButton label="Buscar" href="/productos">
              <Search className="h-5 w-5" aria-hidden="true" />
            </IconButton>
            <AccountButton />
            <NotificationButton />
            <CartButton />
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="menu-movil"
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-cream transition-colors hover:bg-cream/10 md:hidden"
            >
              {menuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="menu-movil"
            initial={
              shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: "100%" }
            }
            animate={{ opacity: 1, x: 0 }}
            exit={
              shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: "100%" }
            }
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed inset-y-0 right-0 z-[60] flex w-[min(20rem,calc(100vw-2rem))] flex-col overflow-y-auto bg-carbon p-6 shadow-xl md:hidden"
          >
            <div className="mb-8 flex items-center justify-between">
              <span className="font-heading text-lg font-bold tracking-tight text-cream">
                UPBUY
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Cerrar menú"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-cream hover:bg-cream/10"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <nav className="flex flex-col gap-1" aria-label="Navegación móvil">
              {Object.entries(navItems).map(([href, item]) => {
                const active = (activeOverride ?? pathname) === href;

                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={(event) => {
                      const plainClick =
                        event.button === 0 &&
                        !event.metaKey &&
                        !event.ctrlKey &&
                        !event.shiftKey &&
                        !event.altKey;
                      if (plainClick) {
                        setActiveOverride(href);
                      }
                      item.onNavigate?.(event);
                      setMenuOpen(false);
                    }}
                    className={cn(
                      "flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 text-base font-medium transition-colors",
                      active
                        ? "bg-cream text-carbon"
                        : "text-cream/85 hover:bg-cream/10 hover:text-cream",
                    )}
                  >
                    {item.name}
                    {active ? (
                      <span
                        aria-hidden="true"
                        className="size-1.5 rounded-full bg-terracotta-deep"
                      />
                    ) : null}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-6 border-t border-cream/10 pt-4">
              <Link
                href="/cuenta/perfil"
                className="flex min-h-11 items-center rounded-xl px-3 text-base font-medium text-cream/85 transition-colors hover:bg-cream/10 hover:text-cream"
              >
                Mi cuenta
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function IconButton({
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
      className="flex h-11 w-11 items-center justify-center rounded-xl text-cream transition-colors hover:bg-cream/10"
    >
      {children}
    </Link>
  );
}
