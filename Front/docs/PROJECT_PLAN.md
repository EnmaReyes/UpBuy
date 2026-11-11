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
- Desplegado en Vercel (zero-config: `index.js` exporta la app de Express).
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
| FASE 3 | Completada | Catálogo y detalle conectados a `/api/products` y `/api/categories` |
| FASE 4 | Completada | Registro, login, sesión, perfil y direcciones |
| FASE 5 | Completada | Carrito local, checkout y pedido creado en el backend |
| FASE 6 | Completada | Pago Wompi, contra entrega (UI) y listado de pedidos |

## 13. FASE 3 — entregado

- `src/services/api/client.ts`: cliente HTTP centralizado (`NEXT_PUBLIC_API_URL`),
  errores tipados (`ApiError`: red / HTTP / parse).
- `src/services/catalog/`: `listProducts`, `getProductBySlug`, `listCategories`
  y helpers de imágenes. Único punto que conoce las rutas del backend.
- `src/types/catalog.ts`: contrato público (`PublicProduct`, `Category`,
  `PaginatedProducts`, `CatalogQuery`).
- `/productos`: datos reales, búsqueda (`q`), filtro por categoría (slug),
  destacados, paginación por `offset`, estado vacío y estado de error.
- `/producto/[slug]`: datos reales, galería con imágenes del backend (o
  marcadores), ficha con SKU/tallas/stock, relacionados por categoría,
  JSON-LD y metadata dinámica.
- La Home sigue con `src/lib/mock-data.ts` (FASE 2). Migrarla a la API es un
  cambio acotado: `ProductCard` ya consume `ProductCardData`, que ambos tipos
  cumplen.
- `sitemap.ts` **no** incluye todavía las fichas de producto.

## 14. FASE 4 — entregado

- `src/types/auth.ts`: `AuthUser`, `Profile`, `Address`, `MissingProfileField`.
- `src/services/api/server.ts`: `serverFetch` reenvía la cookie entrante a la
  API (los Server Components no la adjuntan solos).
- `src/services/api/client.ts`: `apiSend` (mutaciones con `credentials:
  "include"`) y `apiGetOptional` (widgets optimistas que nunca lanzan).
- `src/services/auth` y `src/services/account`: registro, login, logout, perfil
  y CRUD de direcciones.
- `/login` y `/registro`: grupo `(auth)` con panel de marca; registro con
  validación local y auto-login tras crear la cuenta.
- `/cuenta/perfil`: datos personales + estado de perfil completo (`missing`).
- `/cuenta/direcciones`: listar, crear, editar, marcar principal y eliminar.
- `src/middleware.ts`: protege `/cuenta/*` comprobando solo la **presencia** de
  la cookie; el servidor revalida la firma contra `/api/auth/me`.
- Navbar: botón de cuenta con sesión en cliente (mantiene la Home estática) y
  acceso en el drawer móvil.

Decisiones y límites:

- **No** se implementa login social (Google/Facebook): requiere claves OAuth y
  SDK del proveedor que no están configurados.
- No hay endpoints de cambio ni recuperación de contraseña: no se ofrece nada
  que el backend no pueda cumplir.
- La sesión dura 12 h (`access_token`); al caducar, `/cuenta/*` vuelve a login.

## 15. FASE 5 — entregado

- `src/context/cart-context.tsx`: carrito en `localStorage`
  (`upbuy.cart.v1`), hidratación segura y clave `productId::talla`.
- `src/components/cart/`: `CartButton` (contador en el navbar) y `CartView`.
- `/carrito`: cantidades, eliminar, subtotal y CTA a checkout.
- `/checkout`: dirección principal preseleccionada, notas y resumen. Envía
  `POST /api/orders` con `items: [{ productId, quantity, size }]` y el envío
  de la dirección elegida.
- `/pedido/[id]`: confirmación con número de pedido, ítems, totales,
  dirección congelada, plazo estimado y estado.
- `src/services/orders/`: `createOrder` (cliente) y `getOrder`/`listOrders`
  (servidor), separados para no arrastrar `next/headers` al bundle.
- Middleware: `/checkout` también exige sesión.
- El backend valida precio, stock y total; el front nunca los calcula.

Decisiones y límites:

- El pago en línea (Wompi) es FASE 6: el pedido queda en `pending_payment` /
  `unpaid` y la confirmación lo dice explícitamente.
- `shippingCost` es 0 y `shippingZone` "nacional" en el backend actual; la UI
  muestra «Gratis» en la confirmación y «se calcula al confirmar» antes.
- Los combos **no** piden talla, y un producto sin tallas tampoco: la talla es
  una medida y solo se exige cuando el producto la ofrece.
- El carrito no reserva stock; si algo se agota entre el carrito y el pedido,
  el backend responde 409 y se muestra el mensaje.

## 16. FASE 6 — entregado

- `src/services/payments/`: `createPayment` (Wompi), `verifyPayment` (cliente)
  y `verifyPaymentServer` (servidor).
- `src/components/orders/OrderPayment.tsx`: botón «Pagar ahora» para pedidos
  Wompi pendientes, aviso de contra entrega y estado de pago confirmado.
- `/pedido/[id]`: muestra método de pago y acciones según el estado real.
- `/mis-pedidos/[id]`: **destino de retorno de Wompi** (`?id=<transactionId>`).
  Intenta verificar el pago como respaldo del webhook y redirige a
  `/pedido/[id]`.
- `/cuenta/pedidos`: listado paginado de pedidos con estado y total.
- Checkout: selector de método de pago (en línea / contra entrega) y envío
  mostrado siempre como **gratis**.

Decisiones y límites:

- **Envío:** se muestra «Gratis» en carrito, checkout y pedido, tanto para
  Antioquia como nacional. El coste real lo suma el backend al total; la UI no
  lo desglosa (requisito del negocio).
- **Wompi** exige `WOMPI_*` configurado y una URL de retorno que no sea
  localhost. Sin eso, «Pagar ahora» devuelve 503 y se muestra el mensaje real
  del backend (no se simula el cobro).
- **Contra entrega:** la UI envía `paymentMethodCode: "cod_vendelo"` y el
  backend lo acepta: el pedido nace en `paid` / `pending_collection` y no se
  puede cobrar en línea. Ver `BACKEND_INTEGRATION.md` → «Pedidos».

## 17. Próximo paso

FASE 7 (logística y proveedores) cuando se apruebe. Antes:

- `GET /api/orders/:id/tracking?phone=&email=` es público y exige que el
  teléfono o el correo coincidan.
- Solo `NEXT_PUBLIC_API_URL` es necesaria; el mercado está fijado en
  `src/config/market.config.ts`.
- El endpoint de newsletter no existe: la Home lo declara como pendiente y no
  simula la suscripción.
- El endpoint de contacto tampoco existe: `/contacto` lo declara y no envía ni
  almacena el formulario.
- Las imágenes de producto se muestran con `<img>` porque el dominio del
  proveedor no está fijado; al definirlo se puede migrar a `next/image`.
