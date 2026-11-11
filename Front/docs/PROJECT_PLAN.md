# PROJECT_PLAN.md — E-commerce Frontend (FASE 3 parcial con datos mock)

## 1. Stack y versiones (Front/)

| Paquete | Versión | Notas |
|---|---|---|
| Next.js | 16.4.5 | App Router, Turbopack |
| React | 19.3.1 | Server Components por defecto |
| React DOM | 19.3.1 | |
| Tailwind CSS | 4.3.5 | v4, `@tailwindcss/postcss` |
| TypeScript | ^5 | strict |
| PostCSS | — | `@tailwindcss/postcss` |

Estado actual del frontend (tras FASE 2): Next.js 16.4.5 con App Router y
Turbopack, Tailwind v4, shadcn/ui inicializado (`base-nova`, radix,
css-variables) con registro `@kokonutui`, `motion` para animaciones y
`GlitchText` de React Bits vendorizado en `src/components/GlitchText.tsx`.

Implementado: sistema de tokens y tipografías (FASE 1), Home completa con sus
secciones (FASE 2) y un avance parcial de la FASE 3 (catálogo, detalle de
producto, Nosotros y Contacto) construido con datos mock, mientras el backend
cierra la conexión con los proveedores por API. El catálogo vive en
`src/lib/mock-data.ts` y los tipos ya reflejan el shape público previsto
(`slug`, `sku`, `price`, `images`, `sizes`, etc.).

## 2. Backend reutilizable (Back/)

- Node.js 18+ / Express 4 / Sequelize 6 / PostgreSQL (Neon).
- Desplegado en Vercel (`api/index.js` exporta la app).
- Autenticación: JWT en cookie `httpOnly` (`access_token`, 12h), `sameSite`/`secure` según entorno. Roles: `admin`.
- CORS con `FRONTEND_URL` (dev: `http://localhost:5173`).
- Pagos: Wompi Web Checkout + webhook firmado.
- Proveedores: Vendelo (API, si hay credenciales) y Dropi (modo manual por defecto).
- Cron diario `0 12 * * *` (`/api/cron/sync-providers` con `Bearer CRON_SECRET`).

Funcionalidades reutilizables: auth, usuarios/direcciones, catálogo unificado, categorías, DTF, pedidos, tracking público, pagos Wompi, envío, notificaciones, banners, campañas (admin), precios/tarifas, administración de pedidos/usuarios.

## 3. Referencia visual — SOLEVORA (https://solevora.framer.website/)

Composición adoptada (molde, no copia):

- Navbar transparente/integrada al Hero, cambia al scroll, drawer móvil.
- Hero editorial de alto impacto: imagen grande + titular grande + 2 CTAs.
- Franja de beneficios (ticker) horizontal.
- Productos destacados en grid con hover sutil.
- Sección "New Season. New Energy." (novedades editoriales).
- Banner de marca ancho completo.
- Categorías con imagen + descripción + CTA.
- Bloque "Built for Movement. Made for Life." (3 pilares).
- Newsletter.
- Footer completo con navegación, categorías, ayuda, políticas, redes, contacto.

Anti-patrones a evitar: diseño de plantilla genérico, exceso de tarjetas redondeadas, sombras exageradas, gradientes innecesarios, elementos decorativos sin valor, interfaces sobrecargadas.

## 4. Identidad visual

Paleta (tokens globales, única base):

| Token | HEX | Uso |
|---|---|---|
| `--color-carbon` | `#0B0B0B` | Fondos principales, texto, nav |
| `--color-cream` | `#F5E9D7` | Fondos claros, superficies |
| `--color-terracotta` | `#D35400` | CTA primario, detalles |
| `--color-coffee` | `#8B6F56` | Secundarios, bordes, detalles |

Se permiten transparencias y variaciones de luminosidad derivadas, sin colores nuevos.

Tipografía: Space Grotesk (headings), Manrope (body), precios con jerarquía numérica clara. Carga con `next/font/google`.

## 5. Dependencias a instalar (FASE 1)

- `motion` (Motion One / `motion/react`) — animaciones.
- `shadcn/ui` (CLI) + `components.json`.
- Registro Kokonut UI: `@kokonutui`: `https://kokonutui.com/r/{name}.json`.
- `npx shadcn@latest add https://kokonutui.com/r/utils.json` (helper `cn`).
- React Bits: `@react-bits/GlitchText-TS-TW` (Hero, obligatorio).
- Posibles: `lucide-react` (iconos), `clsx`/`tailwind-merge` (vía shadcn utils), `react-hook-form` + `zod` (formularios), `@tanstack/react-query` (opcional, solo si se justifica).

Regla: instalar solo lo que se use; nada de colecciones completas.

## 6. Arquitectura frontend (App Router)

```
Front/src/
├── app/
│   ├── (store)/
│   │   ├── page.tsx                 # Home
│   │   ├── productos/page.tsx
│   │   ├── producto/[slug]/page.tsx
│   │   ├── carrito/page.tsx
│   │   ├── checkout/page.tsx
│   │   ├── nosotros/page.tsx
│   │   └── contacto/page.tsx
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── registro/page.tsx
│   ├── cuenta/
│   │   ├── perfil/page.tsx
│   │   └── pedidos/page.tsx
│   ├── layout.tsx
│   ├── globals.css
│   └── not-found.tsx
├── components/
│   ├── layout/      (Navbar, Footer, MobileMenu)
│   ├── home/        (Hero, BenefitsTicker, FeaturedProducts, NewArrivals, BrandBanner, Categories, BrandPillars, Newsletter)
│   ├── products/    (ProductCard, ProductGrid, ProductGallery, VariantSelector)
│   ├── cart/        (CartDrawer, CartItem, CartSummary)
│   ├── checkout/    (CheckoutForm, OrderSummary)
│   ├── auth/        (LoginForm, RegisterForm)
│   ├── account/     (ProfileForm, OrdersList, OrderDetail)
│   ├── shared/      (Button, Input, Badge, EmptyState, Loader, ErrorState)
│   └── kokonutui/   (componentes instalados vía shadcn)
├── hooks/           (useCart, useAuth, useMediaQuery, useScrollPosition)
├── context/         (CartContext, AuthContext, MarketContext)
├── services/
│   ├── api/         (cliente HTTP centralizado, config de base URL)
│   ├── auth/
│   ├── products/
│   ├── orders/
│   └── payments/
├── lib/             (cn, formatters, validators)
├── types/           (tipos de respuestas del backend)
├── config/          (market.config.ts: país, moneda, formato)
└── utils/
```

Reglas: TypeScript estricto, componentes reutilizables, Server Components por defecto, Client Components solo cuando haga falta, peticiones HTTP centralizadas, tipos para respuestas del backend, sin duplicación, sin componentes gigantes, sin secretos en el navegador.

## 7. Mercados (i18n)

- Inicial: Colombia — COP, español, formato COP.
- Futuro: Argentina — ARS, español.
- Toda la UI en español. Sin textos comerciales en inglés.
- La moneda visual no basta: disponibilidad de pagos/envíos depende del backend.

## 8. Rendimiento y SEO

- `next/image`, lazy loading, Server Components.
- Metadata global + por página, Open Graph, Twitter Cards, URLs amigables, canonical, sitemap, robots, JSON-LD de productos.
- Catálogo y detalle indexables; no depender solo de JS en cliente para contenido clave.

## 9. Seguridad

- Sin variables privadas en el navegador.
- Base URL del backend centralizada (`NEXT_PUBLIC_API_URL`).
- Auth por cookie httpOnly (el front no lee el token).
- El backend valida precios/disponibilidad/pago; el front no confía en redirecciones.
- Protección de rutas privadas en middleware/layout.

## 10. Fases (no adelantar)

- **FASE 0** — Auditoría y planificación (este documento). Entregables: PROJECT_PLAN.md, BACKEND_INTEGRATION.md, DESIGN_SYSTEM.md, estructura, dependencias, features disponibles/pendientes. Sin modificaciones destructivas ni Home.
- **FASE 1** — Fundamentos y sistema visual (Kokonut/shadcn, fuentes, tokens, layouts, animaciones, GlitchText).
- **FASE 2** — Home (navbar, hero, ticker, destacados, novedades, banner, categorías, pilares, newsletter, footer).
- **FASE 3** — Catálogo y detalle de producto.
- **FASE 4** — Usuarios y autenticación.
- **FASE 5** — Carrito y checkout.
- **FASE 6** — Wompi y pedidos.
- **FASE 7** — Logística y proveedores.
- **FASE 8** — Optimización y lanzamiento.

Cada fase: explicar alcance, archivos afectados, dependencias y riesgos antes de implementar; trabajar solo en el alcance aprobado; verificar compilación; resumir al final y esperar aprobación.

## 11. Riesgos técnicos

- Tailwind v4 + shadcn: verificar compatibilidad al inicializar shadcn (FASE 1).
- Auth por cookie cross-origin (Vercel front + back): `sameSite: "none"` + `secure` en prod; en dev `lax`. Configurar `NEXT_PUBLIC_API_URL` y CORS.
- Catálogo unificado mezcla `articulos` y `dtf`; el DTF no tiene precio propio (se cobra por prenda). UI debe manejar `price: null`.
- Envío por distancia (Antioquia vs nacional) y plazos snapshot.
- Wompi: confirmación real por webhook, no por redirección.
- Dropi sin API → modo manual; reflejar estados pendientes.
- Stock booleano (no por cantidad) → reserva de stock desactivada por defecto.
- Rate limiting por IP en dev (Vercel proxy).

## 12. Estado de las fases

| Fase | Estado | Nota |
|---|---|---|
| FASE 0 | Completada | Auditoría + 3 documentos en `Front/docs/` |
| FASE 1 | Completada | shadcn + Kokonut, tokens, fuentes, Motion, GlitchText |
| FASE 2 | Completada | Home completa con datos mock (`src/lib/mock-data.ts`) |
| FASE 3 | Parcial (mock) | Catálogo, detalle, Nosotros y Contacto; falta conectar el contrato real del backend |

## 13. Próximo paso

La FASE 3 quedó avanzada visualmente con datos mock:

- `/productos`: cabecera editorial, filtros por categoría en la URL, orden
  (destacados, novedades, precio), grid responsive y estado vacío.
- `/producto/[slug]`: galería de marcadores, selector de talla/color/cantidad,
  acordeones de detalles, relacionados, metadata y JSON-LD. El botón de compra
  explica que el carrito depende del backend; no simula pedidos.
- `/nosotros` y `/contacto`: contenido de marca y formulario de contacto que
  declara la integración pendiente (no envía ni almacena nada).
- Home alineada a la referencia: producto destacado sobre el Hero, ticker,
  banner con cifras de envío, pilares, favoritos, categorías y newsletter.
- `sitemap.ts` incluye las rutas nuevas y las fichas de producto mock.

Pendiente para completar la FASE 3 real:

- Definir el contrato HTTP público del catálogo con el backend (sin exponer
  `cost`/`markup`).
- Reemplazar las funciones de `src/lib/mock-data.ts` por el cliente HTTP
  centralizado (`src/services/api/`), conservando los tipos y componentes.
- Incorporar imágenes reales de producto (`next/image`) y precios/stock reales.
- Resolver el carrito y checkout en FASE 5 cuando el backend esté listo.

Notas del backend que siguen vigentes:

- El backend no expone un endpoint público de catálogo todavía. El refactor a
  dropshipping (Vendelo/Dropi) eliminó `/products`, `/category`, `/dtf`,
  `/posts`, `/prices`, `/banner`, `/campaigns` y `/shipping/*` (ver
  `BACKEND_INTEGRATION.md` §1.1).
- El modelo `Articulos` es la fuente de verdad del producto (`sku`,
  `provider`, `images`, `cost`, `markup`, `price`, `stock`, `active`, `sizes`).
  El contrato HTTP público está por definir por el backend.
- **Bug en el refactor del backend:** `Back/index.js:15` requiere
  `./DataBase/ensurePricingSchema.js`, pero el archivo se llama
  `ensurePricing.js` (exporta `ensurePricingSchema`). El servidor no arranca
  (`MODULE_NOT_FOUND`). Es trabajo del usuario; el frontend no lo modifica.
- CORS ya resuelto: `Back/config.js` fija `FRONTEND_URL = http://localhost:3001`
  en desarrollo, que es el puerto del frontend Next.
- El endpoint de newsletter no existe: la Home lo declara explícitamente como
  integración pendiente y no simula la suscripción.
- El endpoint de contacto tampoco existe: `/contacto` declara la integración
  pendiente y no envía ni almacena el formulario.
