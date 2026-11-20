# Prompt — Ajustes a las tarjetas de productos de la portada (home)

Destinado a un agente o IA con herramientas de ejecución. Copia y pega este archivo
como instrucción al agente.

## Objetivo

Ajustar las tarjetas de productos que se muestran en la página principal
(`Front/src/app/(store)/page.tsx`): las secciones **Productos destacados**
(`Front/src/components/home/FeaturedProducts.tsx`), **Nueva temporada**
(`NewArrivals.tsx`) y **Los favoritos de la comunidad** (`Favorites.tsx`).

Problema: el tamaño de las cards es inconsistente entre productos. Resultado
esperado: todas las cards de una misma sección queden **igual de tamañas** y
modeladas visualmente sobre el molde de
https://solevora.framer.website/ — "molde, no copia literal" (Front/AGENTS.md):
conservamos la paleta UpBuy (carbon `#0B0B0B`, cream `#F5E9D7`, terracotta
`#D35400`, coffee `#8B6F56`), tipografía Space Grotesk (headings) y Manrope
(body). No usar las fuentes del sitio de referencia.

## Antes de empezar

- Leer: `Front/AGENTS.md`, `Front/docs/DESIGN_SYSTEM.md`, `Front/src/app/globals.css`
  (tokens de diseño) y `Front/src/components/shared/Reveal.tsx` (animación de entrada).
- Si necesitas inspiración visual, abre https://solevora.framer.website/ en el navegador.

## Trabajo específico

### 1. Tarjeta (`Front/src/components/products/ProductCard.tsx`)

Uniformar las dimensiones de todas las cards:

- Fijar el aspect ratio de la zona de imagen: `aspect-[5/6]`, no `aspect-[4/5]`
  variable por producto.
- Fijar la altura de la zona de detalle (`p-4 sm:p-5`) y poner el botón "Añadir"
  con `mt-auto` para alinear siempre el final de la tarjeta.
- Uniformar los pills de imagen y badge: `rounded-full px-3 py-1 text-[11px]`.

Transiciones y animaciones suaves (hovers):

- Imagen: `transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
  group-hover:scale-[1.03]` (escala suave).
- Tarjeta entera: `transition-shadow duration-300 ease-out group-hover:shadow-xl`.
- Pílares/badges: `transition-opacity duration-200`.
- Precios con `tabular-nums` (ya lo usan): mantener.
- Respetar `prefers-reduced-motion` (ya lo hace `Reveal`; verificar que los
  nuevos hovers lo respeten).

### 2. Rejilla (`FeaturedProducts.tsx`, `NewArrivals.tsx`, `Favorites.tsx`)

- Unificar la rejilla: `grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3
  lg:grid-cols-4 items-stretch`.
- Mantener la entrada animada con `Reveal` y stagger (`delay={index * 0.06}`).

### 3. Modo responsive — Momentum Rail de Kokonut UI

Desde `Front/`:

1. Instalar el componente: `npx shadcn@latest add @kokonutui/carousel-cards`
   (nunca pegar código a mano).
2. Importarlo: `import CarouselCards from "@/components/kokonutui/carousel-cards"`.
3. En modo compacto (por debajo de `md`) sustituir la rejilla por Momentum
   Rail: un `ProductRail` cliente renderiza `CarouselCards` con
   `showHeader={false}` y `[--rail-card:72vw]`, y un `ProductCollection`
   alterna rail (< `md`) y rejilla (>= `md`). Se conservan el arrastre con
   inercia, el snap, el cover-flow y el respeto a `prefers-reduced-motion`.
4. Reutilizar `ProductCard` dentro del rail con la prop `renderItem` (agregada
   al componente instalado, sin duplicar la tarjeta). Derivar los `RailItem`
   del producto:
   - `id`: id o slug del producto.
   - `title`: `product.name`, `location`: `product.categoryLabel`.
   - `price`: `product.price`, `image`: `product.image`.
   - `href`: `/producto/${product.slug}`.
   - El botón Añadir sigue funcionando: el rail no inicia el arrastre cuando
     el puntero nace en un botón.

### 4. Animación de entrada

Mantener `Reveal`: `duration: 0.4, ease: "easeOut"`, animando `opacity` y `y`,
con stagger entre cards. No cambiar la duración ni el stagger de los grids.

### 5. Accesibilidad y restricciones (Front/AGENTS.md, Front/docs/DESIGN_SYSTEM.md)

- Textos de UI en español.
- Usar tokens del design system (`text-carbon`, `bg-card`,
  `rounded-xl`/`rounded-2xl`).
- Imágenes con `SafeImage`/`next/image` y `alt` descriptivo.
- Botones de solo icono con `aria-label` y focus visible.
- Touch targets ≥ 44×44px donde aplique.

### 6. Verificación

```bash
cd Front && npm run typecheck && npm run build
```

- DevTools Responsive:
  - ≥ lg (desktop): las 3 secciones muestran cards igual de tamaño y uniformes.
  - ≤ 768px (móvil): las cards de cada sección aparecen como rail horizontal
    (flectable), sin romper el scroll de la página.
- Verificar hovers en desktop.

### 7. Resultado esperado

Tarjetas con igual tamaño y forma, transiciones suaves en hover, entrada
estaggered, y rail con momentum en modo responsive.

## Nota final

No copiar literalmente los colores ni las fuentes del sitio de referencia:
el molde se observa y se adapta a la identidad visual de UpBuy.
