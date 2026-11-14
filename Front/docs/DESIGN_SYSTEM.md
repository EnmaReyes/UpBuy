# DESIGN_SYSTEM.md — E-commerce Frontend

Referencia visual: SOLEVORA (https://solevora.framer.website/). Molde de composición, no copia literal.

## 1. Paleta (tokens globales)

Únicos colores base. Definir como CSS variables en `globals.css` y como tokens de Tailwind v4 (`@theme`).

```css
:root {
  --color-carbon: #0B0B0B;
  --color-cream: #F5E9D7;
  --color-terracotta: #D35400;
  --color-coffee: #8B6F56;
}
```

Uso:

| Token | Aplicación |
|---|---|
| `--color-carbon` | Fondos principales, texto principal, navbar |
| `--color-cream` | Fondos claros, superficies, texto sobre oscuro |
| `--color-terracotta` | CTA primario, enlaces destacados, detalles |
| `--color-coffee` | Secundarios, bordes, texto secundario, iconos |

Se permiten transparencias y variaciones de luminosidad derivadas (`color-mix`, opacidades). No introducir colores adicionales que alteren la identidad.

Derivados accesibles (misma familia, más oscuros para cumplir AA en texto pequeño):

| Token | HEX | Uso | Contraste |
|---|---|---|---|
| `--color-terracotta-deep` | `#A94200` | Texto y CTA sobre fondo crema/blanco | 5.05:1 sobre cream, 6.06:1 sobre blanco |
| `--color-coffee-deep` | `#6B5343` | Texto secundario sobre fondos claros | 5.95:1 sobre cream, 7.13:1 sobre blanco |

El terracota base `#D35400` sobre crema queda en 3.48:1, por lo que solo se usa
para elementos grandes, bordes o acentos; para texto pequeño se usa el derivado.

Mapeo a Tailwind v4 (`@theme`):

```css
@theme {
  --color-carbon: #0B0B0B;
  --color-cream: #F5E9D7;
  --color-terracotta: #D35400;
  --color-terracotta-deep: #A94200;
  --color-coffee: #8B6F56;
  --color-coffee-deep: #6B5343;
}
```

## 2. Tipografía

Cargar con `next/font/google` en `app/layout.tsx`.

- Headings: **Space Grotesk** (geométrica, contundente). Pesos 500/600/700.
- Body: **Manrope**. Pesos 400/500/600.
- Precios: Manrope con `font-variant-numeric: tabular-nums`, peso 600/700.

Escala fluida (usar `clamp()`):

| Rol | Tamaño | Line-height |
|---|---|---|
| Display (Hero) | `clamp(2.5rem, 6vw, 5rem)` | 1.05 |
| H1 | `clamp(2rem, 4vw, 3.5rem)` | 1.1 |
| H2 | `clamp(1.5rem, 3vw, 2.5rem)` | 1.15 |
| H3 | `clamp(1.25rem, 2vw, 1.75rem)` | 1.2 |
| Body | `1rem` (16px base) | 1.5 |
| Small | `0.875rem` | 1.4 |
| Precio | `1.125rem`–`1.5rem` | 1.2 |

## 3. Espaciado y layout

- Contenedor máximo: `1440px`, padding horizontal `clamp(1rem, 4vw, 3rem)`.
- Ritmo vertical entre secciones: `clamp(3rem, 8vw, 6rem)`.
- Grid de productos: 2 cols mobile, 3 tablet, 4 desktop.
- Breakpoints: mobile 320–767, tablet 768–1023, laptop 1024–1439, desktop ≥1440.
- Sin scroll horizontal. `overflow-x: hidden` solo como red de seguridad, no como solución.

## 4. Componentes base (shadcn/ui + Kokonut UI)

Inicializar en FASE 1:

1. `npx shadcn@latest init` (si no hay `components.json`).
2. Agregar registro en `components.json`:
   ```json
   "registries": { "@kokonutui": "https://kokonutui.com/r/{name}.json" }
   ```
3. `npx shadcn@latest add https://kokonutui.com/r/utils.json` (helper `cn`).
4. shadcn MCP: `npx shadcn@latest mcp init --client <claude|cursor|vscode|codex>`.
5. Reglas en `AGENTS.md` (ver Kokonut setup.md): consultar `https://kokonutui.com/llms.txt` antes de construir componentes animados/interactivos desde cero; instalar con `npx shadcn@latest add @kokonutui/<name>`; editar en lugar.

Instalar solo los necesarios (no toda la colección). Candidatos para este proyecto: botones, inputs, badges, drawer/modal, ticker/marquee si existe, loaders, empty states.

## 5. GlitchText (Hero, obligatorio)

Origen: **React Bits** (no Kokonut). El componente vive versionado en el repo
como `src/components/GlitchText.tsx` para poder ajustarlo sin depender del
registro externo en cada build.

- Efecto RGB split + distorsión con jitter.
- Adaptar colores a la paleta (carbon/cream/terracotta).
- Debe ser elegante, legible y controlado; no dificultar la lectura del título.
- La tipografía, el tamaño y la alineación los define el consumidor; el
  componente solo aporta las clases estructurales (`relative select-none`), para
  no imponer un `whitespace-nowrap` que desborde en móvil.
- Respetar `prefers-reduced-motion` (desactivar o reducir el efecto).
- No sustituir por CSS genérico.

## 6. Animaciones (Motion)

Librería principal: `motion` (`motion/react`). Consultar también Kokonut UI para componentes animados.

Requeridas:

- **Hero**: entrada progresiva del contenido, animación de GlitchText, aparición suave de imagen, movimiento sutil de decorativos.
- **Scroll reveal**: aparición de secciones al entrar en viewport, desplazamientos verticales pequeños, opacidad progresiva, stagger en grids.
- **Productos**: hover de imágenes, transiciones de botones, aparición de etiquetas, feedback al agregar al carrito.
- **Navegación**: transición del navbar al scroll, apertura/cierre del menú móvil, transiciones del carrito.
- **Interacciones**: botones con feedback, drawer del carrito, modales, dropdowns, estados de carga.

Reglas: no abusar, duraciones cortas (150–400ms), evitar animar width/height, no cambios de layout durante la animación, respetar `prefers-reduced-motion`, no ocultar contenido importante.

Implementación en este proyecto:

- `src/lib/use-prefers-reduced-motion.ts` — hook hydration-safe basado en
  `useSyncExternalStore`. El `useReducedMotion` de Motion devuelve `false` en el
  servidor y el valor real en el cliente; si esa diferencia altera el árbol
  renderizado, React registra un error de hidratación para los usuarios que
  prefieren menos movimiento.
- Las animaciones de entrada se marcan con `data-reveal` / `data-animate` y el
  estado inicial se aplica con estilos inline. Una regla CSS
  `@media (prefers-reduced-motion: reduce)` fuerza `opacity: 1` y
  `transform: none` para que el contenido nunca quede invisible.
- `<noscript>` en `app/layout.tsx` aplica la misma garantía cuando el JS no
  se ejecuta en absoluto.

## 7. Dirección de arte (SOLEVORA)

- Composiciones editoriales, grandes titulares, fotografías de alta calidad.
- Espacios negativos bien aprovechados.
- Contraste entre secciones oscuras y claras (carbon ↔ cream).
- Tarjetas de producto limpias.
- Secciones con imágenes grandes.
- Animaciones sutiles y elegantes.

Evitar: diseño genérico de plantilla, exceso de tarjetas redondeadas, sombras exageradas, gradientes innecesarios, elementos decorativos sin valor, interfaces sobrecargadas.

## 8. Componentes clave por sección

- **Layout**: Navbar (transparente→sólido al scroll), Footer, MobileMenu (drawer).
- **Home**: Hero (GlitchText), BenefitsTicker, FeaturedProducts, NewArrivals, BrandBanner, Categories, BrandPillars, Newsletter.
- **Products**: ProductCard, ProductGrid, ProductGallery, VariantSelector, PriceDisplay.
- **Cart**: CartDrawer, CartItem, CartSummary.
- **Checkout**: CheckoutForm, OrderSummary, ShippingQuote.
- **Auth**: LoginForm, RegisterForm.
- **Account**: ProfileForm, AddressList, OrdersList, OrderDetail, TrackingView.
- **Shared**: Button, Input, Badge, EmptyState, Loader, ErrorState, Price (tabular-nums).

## 9. Iconografía

- SVG (lucide-react). No emoji como iconos.
- Tamaños consistentes (16/20/24px). Color heredado del texto.

## 10. Accesibilidad (prioridad 1)

- Contraste mínimo 4.5:1.
- Alt text en imágenes.
- Navegación por teclado, focus rings visibles.
- Aria-labels en botones de solo icono.
- Touch targets ≥ 44×44px, spacing ≥ 8px.
- Feedback de carga.
- No depender solo de hover.
- Respetar `prefers-reduced-motion`.

## 11. Imágenes

- `next/image` siempre. Formatos WebP/AVIF.
- Lazy loading por defecto; `priority` en hero.
- Reservar espacio (CLS < 0.1).
- Placeholders preparados para fotografías comerciales reales (no imágenes aleatorias definitivas).

## 12. Dark/Light

Paleta fija (carbon + cream) alternando secciones; no modo oscuro toggle inicial. Contraste garantizado por combinación de secciones.

## 13. Tokens a definir en FASE 1

- Colores (arriba).
- Tipografías (Space Grotesk, Manrope).
- Radios: `--radius-sm` 6px, `--radius-md` 10px, `--radius-lg` 16px (usar con moderación).
- Sombras: suaves, solo donde aporte jerarquía.
- Duraciones: 150ms (micro), 250ms (estándar), 400ms (entrada).
- Z-index: nav 50, drawer 60, modal 70, toast 80.
