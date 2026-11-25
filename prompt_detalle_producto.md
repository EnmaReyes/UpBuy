# Prompt: Reorganizar detalle de producto (similar a Solevora Urban Flex)

## Objetivo
Reestructurar la página de detalle de producto (`Front/src/app/(store)/producto/[slug]/page.tsx`) para que se parezca al layout de referencia https://solevora.framer.website/shop/urban-flex, con:
- Galería principal a la izquierda: thumbnails verticales al lado izquierdo de la imagen grande (no debajo).
- Panel de compra a la derecha (sticky).
- Sección de "Material de promoción" (videos) integrada de forma coherente, en formato reels.
- Mejor jerarquía visual, espaciado y responsividad.

## Layout deseado
- Desktop (lg): grid 12 columnas.
  - Columna izquierda (7): galería con thumbnails verticales a la izquierda + imagen grande a la derecha.
  - Columna derecha (5): info de compra sticky (nombre, precio, descripción, tallas, CTA, beneficios).
- Tablet: galería arriba, panel abajo.
- Móvil: imagen grande arriba, thumbnails horizontales debajo (o carrusel), panel abajo.

## Componentes
- `ProductGallery`: refactor para soportar layout vertical de thumbnails (prop `orientation: "vertical" | "horizontal"`). Por defecto vertical en desktop.
- `ProductVideosReels`: mantener auto play/pause por visibilidad y botón play/pausa. Colocar debajo del panel de compra o como sección independiente "Material de promoción" debajo de la galería.
- Mantener `ProductPurchasePanel`, beneficios y acordeones (ficha, envíos, cuidado).

## Videos
- Usar URLs convertidas a formato reproducible (Google Drive `uc?export=download&id=...`).
- Mostrar entre 1 y 3 videos en formato reels (9:16), con scroll horizontal.
- Lazy load de iframes/video; respetar `prefers-reduced-motion`.

## Accesibilidad
- Thumbnails con `aria-label`, focus visible, navegación por teclado.
- Videos con `title`, controles accesibles, autoplay solo si visible.
- Contraste ≥ 4.5:1, touch targets ≥ 44px.

## Verificación
- `cd Front && npm run typecheck && npm run build`
- Probar en móvil/tablet/desktop.
- Verificar que los videos carguen con links de Drive compartidos.