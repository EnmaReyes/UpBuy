# Prompt: Agregar "Material de Promoción" (videos) a productos (manual)

## Objetivo
Permitir agregar manualmente varias URLs de Google Drive (videos) a un producto, almacenarlas en la base de datos, gestionarlas desde el panel admin (crear/editar producto) y mostrarlas en el detalle del producto en formato "reels" debajo del contenido.

## Alcance
- Backend (Back/): migración de esquema, modelo, controller y rutas para persistir las URLs.
- Frontend (Front/): formulario de crear/editar producto con campo para múltiples URLs + previsualización; detalle de producto con videos en formato reels.

## 1. Base de datos
- Agregar columna a la tabla `Products` (o tabla dedicada `product_videos`):
  - Opción A: columna `promotionVideos` (JSONB/TEXT[]) en `Products` con array de URLs.
  - Opción B: tabla `product_videos` con `id`, `productId` (FK), `url`, `position`, `createdAt`.
- Recomendado: tabla `product_videos` para soportar varias URLs ordenadas y validación individual.
- Migración idempotente (`ensureCatalogSchema` o script en `Back/scripts/`) que cree la tabla/columna si no existe.

## 2. Backend (Back/)
- Modelo Sequelize `ProductVideo` (o campo en `Product`) con asociación `Product.hasMany(ProductVideo)`.
- Controller `products.controller` / `catalog`:
  - Aceptar en create/update un array `promotionVideos: string[]`.
  - Validar que sean URLs válidas (Google Drive o genéricas) y normalizar.
  - Persistir (replace set) las URLs del producto.
- Rutas admin: `POST/PUT /api/admin/products` aceptan el campo.
- Endpoint público `GET /api/products/:id` incluye `promotionVideos` (array de URLs) en la respuesta.
- Tests: validación de URLs, persistencia y respuesta.

## 3. Frontend (Front/) — Admin
- En `Front/src/app/admin/catalogo` (crear y editar producto):
  - Campo repetible para añadir múltiples URLs de Google Drive.
  - Botón "Agregar URL" y eliminar por item.
  - Recuadro de previsualización del video (iframe/embed de Google Drive) para validar que sea el video correcto antes de guardar.
  - Validación de URL antes de guardar.
- Enviar `promotionVideos` en el payload de create/update vía `apiSend`.

## 4. Frontend (Front/) — Detalle de producto
- En la página de detalle del producto (`Front/src/app/(store)/productos/[slug]` o equivalente):
  - Si `promotionVideos` tiene elementos, renderizar sección "Material de Promoción" debajo del contenido del producto.
  - Mostrar videos en formato reels (vertical, scroll horizontal o carrusel) usando iframe/embed de Google Drive o player nativo.
  - Lazy load de iframes; respetar `prefers-reduced-motion`.
  - Accesibilidad: `title` en iframes, controles de teclado.

## 5. Validaciones y UX
- Máximo N videos por producto (definir, ej. 10).
- Solo URLs de Google Drive (o lista permitida) para evitar embeds arbitrarios.
- Mensajes de error en español.
- Contraste, touch targets ≥ 44px, focus visible.

## 6. Verificación
- `cd Back && npm test`
- `cd Front && npm run typecheck && npm run build`
- Probar create/edit con varias URLs y previsualización.
- Probar detalle con y sin videos.

## Notas
- "UpBuy" branding, textos en español, sin referencias a terceros.
- No exponer secretos; solo URLs públicas de Drive.