"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, ShoppingBag, User, Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "cn";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

const NAV_ITEMS = [
  { label: "Inicio", href: "/" },
  { label: "Tienda", href: "/productos" },
  { label: "Novedades", href: "/productos?orden=nuevos" },
  { label: "Categorías", href: "/productos" },
  { label: "Nosotros", href: "/nosotros" },
  { label: "Contacto", href: "/contacto" },
];

// Navbar transparente/integrada al Hero. Al hacer scroll toma fondo sólido.
// En móvil se abre un drawer lateral. El carrito aún no tiene estado (FASE 5).
//
// El drawer se renderiza FUERA del <header>: el header usa backdrop-blur, que
// crea un containing block y dejaría el panel fijo encerrado en el header
// (altura de 64px en vez de pantalla completa).
export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const shouldReduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // En la Home el navbar se integra al Hero oscuro; en el resto de páginas
  // arranca sólido para que el texto claro no quede sobre fondos crema.
  const solid = scrolled || menuOpen || pathname !== "/";

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
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <Link href="/" className="font-heading text-xl font-bold tracking-tight text-cream">
            UPBUY
          </Link>

          <nav className="hidden md:flex items-center gap-6" aria-label="Navegación principal">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "text-sm font-medium text-cream/80 transition-colors hover:text-cream",
                  pathname === item.href &&
                    "text-cream underline underline-offset-4 decoration-terracotta",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1 sm:gap-2">
            <IconButton label="Buscar" href="/productos">
              <Search className="h-5 w-5" />
            </IconButton>
            <IconButton label="Cuenta de usuario" href="/cuenta/perfil">
              <User className="h-5 w-5" />
            </IconButton>
            <IconButton label="Carrito" href="/carrito">
              <ShoppingBag className="h-5 w-5" />
            </IconButton>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-cream transition-colors hover:bg-cream/10 md:hidden"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: "100%" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed inset-y-0 right-0 z-[60] w-72 overflow-y-auto bg-carbon p-6 shadow-xl md:hidden"
          >
            <div className="mb-8 flex items-center justify-between">
              <span className="font-heading text-lg font-bold text-cream">UPBUY</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Cerrar menú"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-cream hover:bg-cream/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col gap-2" aria-label="Navegación móvil">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-lg px-3 py-3 text-base font-medium text-cream/90 transition-colors hover:bg-cream/10 hover:text-cream"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
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
      className="flex h-10 w-10 items-center justify-center rounded-lg text-cream transition-colors hover:bg-cream/10"
    >
      {children}
    </Link>
  );
}
