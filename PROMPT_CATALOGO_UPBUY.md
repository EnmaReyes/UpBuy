# Catálogo UPBUY: gestión de productos, visibilidad y edición

Actúa como ingeniero senior full-stack del monorepo UPBUY. Antes de escribir
código, audita el repositorio y confirma el estado real. **No inventes
endpoints, tablas ni comportamientos**: si algo no se puede verificar, detente y
pregunta.

---

## 1. Objetivo

Que el administrador pueda **convertir el catálogo importado de los proveedores
en productos vendibles en UPBUY**, con tres capacidades:

1. **Decidir qué es visible** en la tienda (individual y en lote).
2. **Editar** la información comercial (nombre, descripción, precio, categorías,
   imágenes, destacado) sin que la sincronización del proveedor la pise.
3. **Mantener el stock bajo control del proveedor**, sin edición manual.

Hoy la importación funciona (MasterShop y Venndelo) y existe un `PATCH`
administrativo básico, pero **no hay una pantalla de catálogo UPBUY** ni una
bandeja para decidir qué publicar; publicar ya deja el producto visible, sin
paso intermedio de curaduría.

---

## 2. Los tres flujos y la recomendación

### Flujo A — "todo lo importado se ve"

Importar el catálogo del proveedor y publicarlo automáticamente.

- **Ventaja**: cero trabajo manual.
- **Riesgo**: publica productos sin categoría, con copy y fotos del proveedor,
  precios sin margen, duplicados y productos sin stock. Revertir es manual.
- **Cuándo sirve**: catálogo pequeño, curado en origen, con margen fijo.

### Flujo B — "catálogo UPBUY curado"

Importar, editar en UPBUY y publicar a mano lo elegido.

- **Ventaja**: control total de la tienda.
- **Riesgo**: publicar uno por uno no escala (MasterShop permite 50 por página;
  un catálogo real tiene cientos o miles).

### Flujo C — RECOMENDADO: importar todo, publicar por curaduría

Un **solo pipeline** con **política por proveedor**. Ambos flujos anteriores
pasan a ser configuraciones, no implementaciones distintas:

| Política (`suppliers.publishPolicy`) | Comportamiento |
| --- | --- |
| `manual` (por defecto) | La sync solo importa a `supplier_products`. El admin publica desde la bandeja. |
| `auto_draft` | La sync crea el producto en **borrador** (editable, no visible). |
| `auto_visible` | La sync crea y activa el producto (equivale al flujo A). |

Reglas que hacen viable el flujo C:

- **Importar ≠ publicar ≠ visible.** Son tres estados distintos.
- **Publicar** crea la fila en `products` en estado `draft`: aparece en el panel,
  no en la tienda.
- **Visible** = `status = active` **y** `active = true`. El stock en 0 no oculta
  el producto: se muestra como agotado (comportamiento actual de la tienda).
- Acciones **en lote** (publicar seleccionados, publicar todo con stock, aplicar
  margen, asignar categoría, ocultar) para que el flujo B escale.
- El **stock nunca se edita** desde UPBUY si el producto viene de proveedor.
- Las ediciones del admin se guardan en `products.manualOverrides` y la sync las
  respeta (mecanismo ya existente).

---

## 3. Estado actual verificado (debe re-verificarse en Fase 0)

Backend (`Back/`):

- `products` ya tiene `status` (`draft | active | archived`), `active`,
  `stock`, `cost`, `markup`, `price`, `compareAtPrice`, `sizes`,
  `destacadas`, `descuentoPorcentaje`, `manualOverrides`, `publishedAt`,
  `provider`, `providerSku`, `supplierId`, `supplierProductId`.
- `publishSupplierProduct` (`Services/catalog/catalogSync.service.js`) crea el
  producto con `status: active` y `active: availability`, precio sugerido por
  markup, SKU `MS-`/`VEN-` y slug estable.
- `applyToPublished` respeta `manualOverrides` de `stock`, `name`,
  `description`, `images` y `active`; reconstruye imágenes desde
  `supplier_product_assets`; **no toca categorías**.
- API admin existente: `GET/PATCH /api/admin/products` (`listAdmin`,
  `getAdmin`, `updateProduct`). `PATCH` admite `price`, `compareAtPrice`,
  `name`, `description`, `active`, `status`, `destacadas`, `stock`,
  `descuentoPorcentaje`, `categoryIds`; **no admite imágenes ni slug**.
  - `catalog.write` para mutar; `requireStepUp("catalog.unpublish")` cuando se
    oculta o despublica.
  - `updateProduct` permite editar `stock`, lo que contradice la regla de
    negocio: **hay que cerrarlo** para productos de proveedor.
- Panel de proveedores: `/api/admin/suppliers/<slug>/{status,test-connection,
  products,products/:id,publish,unpublish,sync,sync-history}` con fábricas
  compartidas (`catalogSupplier.service.js`, `catalogSupplier.controller.js`).
- `suppliers` tiene `slug`, `name`, `isActive`, `baseUrl` (sin política de
  publicación).
- No hay almacenamiento de archivos (ni multer, ni S3, ni Blob) y **no hay
  servicio de subida**.

Frontend (`Front/`):

- No existe `/admin/catalogo` ni `/admin/productos`: no hay pantalla para
  gestionar el catálogo publicado.
- El único panel de proveedor con UI es `/admin/proveedores/venndelo`; MasterShop
  tiene API pero **no tiene pantalla**.
- `SafeImage` (`src/components/shared/SafeImage.tsx`) usa `<img>` con respaldo
  porque el CDN del proveedor no está fijado. No hay `next/image` ni
  `remotePatterns`.
- Permiso existente: `catalog.write` (y step-up `catalog.unpublish`).
- Server actions en `src/services/admin/`; cliente HTTP en
  `src/services/api/client.ts` (`apiGet`, `apiSend`, `apiDownload`).

---

## 4. Reglas de negocio no negociables

1. **El stock lo manda el proveedor.** El endpoint de edición debe rechazar
   `stock` (422) cuando `supplierProductId` no es nulo; el mensaje explica que
   solo el proveedor lo cambia. Ajustar `PATCH` actual.
2. **El precio de venta nunca lo pisa la sync.** Solo se sugiere al publicar
   (`suggestedPrice(cost, markup)`).
3. **Nunca se borra un producto del proveedor.** Se oculta (`active = false`) o
   se archiva (`status = archived`).
4. **`manualOverrides` manda.** Si el admin editó nombre, descripción, precio,
   imágenes o visibilidad, la sync no lo toca. Toda edición nueva debe marcar su
   campo.
5. **Un producto nuevo nace en borrador** salvo que el proveedor tenga
   `publishPolicy = auto_visible`.
6. **Categoría**: si se publica sin categoría, se asigna la categoría por
   defecto del proveedor (`suppliers.defaultCategoryId`) o queda
   `Sin clasificar`; no se bloquea la publicación, pero el panel lo advierte.
7. **Imágenes**: si el admin personaliza la galería, la sync no la reconstruye.
   Debe existir una acción "restaurar imágenes del proveedor" que quite el
   override y vuelva a sincronizar.
8. **Nada de secretos** en respuestas o logs; `Utils/logger.js`, sin
   `console.log`.
9. Textos de UI en **español**; backend en ASCII plano como el resto del
   proyecto; comentarios en español.

---

## 5. Modelo de datos propuesto

Solo dos columnas nuevas en `suppliers` (idempotente en
`DataBase/ensureCatalogSchema.js`, con `ADD COLUMN IF NOT EXISTS` y guarda para
el CHECK):

```sql
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS "publishPolicy" VARCHAR(20) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "defaultCategoryId" UUID
    REFERENCES categories(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- CHECK (publishPolicy IN ('manual','auto_draft','auto_visible'))
```

Opcional en Fase 4 (solo si se aprueba), en `product_images`:

```sql
ALTER TABLE product_images
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'supplier',
  ADD COLUMN IF NOT EXISTS alt VARCHAR(255);
```

Sin tablas nuevas. `supplier_products` sigue siendo el catálogo original;
`products` sigue siendo el catálogo UPBUY.

---

## 6. Contrato de endpoints propuesto

Reutilizar `/api/admin/products`. Las rutas fijas van **antes** de `/:id`.

| Método | Ruta | Permiso | Notas |
| --- | --- | --- | --- |
| GET | `/api/admin/products` | sesión admin | Filtros nuevos: `visibility=visible\|hidden`, `hasCategory=true\|false`, `published=1\|0`, `stock=in\|out` |
| GET | `/api/admin/products/:id` | sesión admin | Igual que hoy |
| PATCH | `/api/admin/products/:id` | `catalog.write` | Igual que hoy + imágenes/slug; rechaza `stock` si es de proveedor |
| POST | `/api/admin/products/:id/visibility` | `catalog.write` | `{ visible: true \| false }`; ocultar exige step-up `catalog.unpublish` |
| POST | `/api/admin/products/bulk` | `catalog.write` | `{ ids: [], action, payload }` |
| PUT | `/api/admin/products/:id/images` | `catalog.write` | `{ images: [{ url, alt? }] }` (máx. 8) |
| POST | `/api/admin/products/:id/images/restore` | `catalog.write` | Quita el override y re-sincroniza desde el proveedor |
| GET | `/api/admin/suppliers/:slug/products` | `providers.manage` | Añadir `published=0` para la bandeja |
| POST | `/api/admin/suppliers/:slug/products/publish-bulk` | `providers.manage` | `{ productIds?, filters?, markup?, visibility? }` |
| PATCH | `/api/admin/suppliers/:slug/settings` | `providers.manage` | `{ publishPolicy, defaultCategoryId }` |

Acciones de `bulk` (cerradas, sin strings libres):

```
make_visible | hide | archive | restore_draft
apply_markup { percent }
set_categories { categoryIds: [], mode: "add" | "replace" }
feature { value: true | false }
```

Respuesta de `bulk`: `{ requested, updated, skipped: [{ id, motivo }] }`. Nunca
falla completo por un id inválido.

`publish-bulk` responde lo mismo y **reutiliza** `publishSupplierProduct`; no
duplica lógica. Debe ser idempotente: un producto ya publicado se actualiza, no
se duplica.

---

## 7. Fases

### Fase 0 — Auditoría y acuerdos (sin código)

1. Releer y confirmar todo lo de la sección 3 contra el código real.
2. Listar diferencias entre lo documentado y lo implementado.
3. Confirmar el plan de archivos y endpoints.
4. Resolver las preguntas de la sección 9.
5. Entregar: resumen de hallazgos, plan y riesgos. **Esperar aprobación.**

### Fase 1 — Backend: visibilidad y curaduría

Alcance:

- `suppliers.publishPolicy` + `defaultCategoryId` (migración idempotente).
- Servicio puro `Services/catalog/visibility.service.js`:
  `isVisible(product)`, `resolvePublishPolicy(supplier)`, `buildBulkPlan(...)`.
- `publishSupplierProduct`: acepta `visibility: "draft" | "visible"` (por
  defecto `draft` salvo `auto_visible`); asigna categoría por defecto.
- `PATCH /api/admin/products/:id`: rechaza `stock` en productos de proveedor;
  admite `slug` con validación de unicidad y sin cambiar la URL ya publicada sin
  confirmación explícita.
- `POST /:id/visibility`, `POST /bulk`.
- `GET /api/admin/products`: filtros nuevos.
- `GET /suppliers/:slug/products?published=0` y `publish-bulk`.
- `PATCH /suppliers/:slug/settings`.
- Tests: unidad de visibilidad y política; DB de publish en borrador, bulk,
  stock rechazado, overrides marcados; rutas 401/403/step-up.

Criterio de aceptación:

- Publicar desde el panel deja el producto en `draft` y **no** aparece en
  `/productos`.
- Marcar visible lo activa; ocultar lo saca sin borrarlo.
- `bulk` con ids inválidos devuelve `skipped`, no 500.
- Un `PATCH` con `stock` sobre producto de proveedor devuelve 422.
- `npm test` en verde.

### Fase 2 — Frontend: `/admin/catalogo`

Alcance:

- Nueva entrada "Catálogo" en `AdminSidebar` con `catalog.write` (icono Lucide).
- Página con dos pestañas:
  - **Catálogo UPBUY**: productos publicados (borrador, visible, oculto,
    archivado), filtros, búsqueda, selección múltiple y barra de acciones en
    lote.
  - **Bandeja del proveedor**: `supplier_products` sin publicar, con
    selección y "Publicar seleccionados".
- Ficha de edición en panel lateral/drawer: nombre, descripción, precio,
  compare-at, descuento, destacado, categorías, imágenes (Fase 4), visibilidad.
  Mostrar `cost`, `markup` y margen calculado; stock en **solo lectura** con la
  leyenda "lo actualiza el proveedor".
- Server actions en `src/services/admin/catalog.actions.ts` y tipos en
  `src/types/admin.ts`.
- Estados vacíos, errores accesibles, `aria-label`, touch ≥ 44px, contraste
  ≥ 4.5:1, textos en español.
- `npm run typecheck` y `npm run build` en verde.

### Fase 3 — Panel de MasterShop en el front

Reutilizar lo que ya existe para Venndelo, sin copiar y pegar a ciegas:

- `src/services/admin/providers*.ts`: parametrizar por slug o crear el módulo de
  MasterShop.
- `/admin/proveedores/mastershop`: estado, probar conexión, sincronizar,
  historial y (opcional) catálogo del proveedor.
- En `/admin/proveedores`: MasterShop deja de estar "sin panel" y muestra
  `configured` y contadores.
- Unificar: si el panel es idéntico salvo textos y capacidades, extraer
  componente compartido.

### Fase 4 — Imágenes (decisión previa obligatoria)

Dos niveles; **no implementar el segundo sin aprobación** porque introduce
infraestructura nueva:

- **A. Sin subida de archivos (recomendado para empezar)**
  - `PUT /:id/images` acepta URLs `https` (máx. 8), reordena, elimina y fija la
    principal. Marca `manualOverrides.images`.
  - `POST /:id/images/restore` deshace el override.
  - UI: reordenar con teclado, quitar, añadir por URL, "restaurar del
    proveedor".
- **B. Subida real de archivos (solo si se aprueba)**
  - Requiere proveedor de almacenamiento (Vercel Blob / S3 / R2), variables de
    entorno nuevas, validación de tipo y tamaño, y limpieza de huérfanos.
  - Añadir `product_images.source` y `alt`.
  - Evaluar `next/image` + `remotePatterns` para el host propio (hoy se usa
    `SafeImage`; no refactorizar sin motivo).

### Fase 5 — Automatización y conciliación

- `runCatalogSync` aplica `publishPolicy`:
  - `manual`: no publica; solo importa y sincroniza publicados.
  - `auto_draft`: publica en borrador lo nuevo (con categoría por defecto).
  - `auto_visible`: publica y activa.
- Reconciliación de visibilidad: producto visible sin stock sigue visible como
  agotado; producto que el proveedor deja de ofrecer se oculta (no se borra).
- El resumen de la corrida incluye `publishedCreated`, `publishedUpdated`,
  `hidden` y `skipped`.
- Cron `/api/cron/sync-catalog` no cambia su contrato externo.
- Tests de las tres políticas.

### Fase 6 — Proveedores sin API (Dropi) — opcional, decidir

Dropi no ofrece catálogo por API. Si se quiere cargar su catálogo:

- Importador **CSV/pegado** que produce el mismo `supplier_products`
  (columnas: id, nombre, descripción, precio, stock, imagen, categoría).
- Vista previa, validación por fila, resumen de errores e idempotencia por
  `externalId`.
- Reutiliza el pipeline: la política de publicación y el resto del flujo no
  cambian.
- No inventar endpoints de Dropi. Si no hay contrato, es carga manual/CSV.

### Fase 7 — Verificación y documentación

```bash
cd Back && npm test
cd Front && npm run typecheck && npm run build
```

- Actualizar `Back/README.md`, `Back/docs/PROVEEDORES.md`,
  `Front/docs/BACKEND_INTEGRATION.md` (endpoints y estados nuevos).
- Resumen final: archivos, migración, endpoints, pruebas, limitaciones y pasos
  manuales.

---

## 8. Restricciones técnicas

- Node 22 + Express 4 + Sequelize 6 + PostgreSQL, CommonJS, en `Back/`.
- Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, en `Front/`.
- Respetar `Rutas/ → Controllers/ → Services/ → DataBase/models/`. Nada de
  reglas de negocio en controladores.
- Errores con `Utils/HttpError.js` y `Middlewares/errors.js`.
- Transiciones y auditoría existentes no se tocan.
- Cambios mínimos: no renombrar rutas ni modelos, no agregar dependencias sin
  justificarlo, no tocar la integración de pedidos.
- Toda mutación del panel exige sesión revocable y permiso; las acciones
  destructivas mantienen el step-up.
- Sin `console.log`; usar `Utils/logger.js`.

---

## 9. Preguntas a resolver antes de codificar (con valor por defecto)

1. **¿Política por defecto?** `manual` (recomendado) o `auto_visible`.
2. **¿Publicar debe dejar borrador?** Sí (recomendado) para revisar antes de
   mostrar.
3. **¿La categoría es obligatoria para ser visible?** No bloquear; usar
   `Sin clasificar` y advertir (recomendado). Alternativa: bloquear.
4. **¿Imágenes por URL o con subida real?** Fase 4A (URL) primero; 4B solo si se
   aprueba el almacenamiento.
5. **¿Quién puede publicar/ocultar?** `catalog.write` + step-up para ocultar
   (recomendado, igual que hoy).
6. **¿Se permite editar `slug`?** Solo en borradores o con confirmación
   explícita si el producto ya está visible (para no romper enlaces).
7. **¿Dropi entra por CSV?** Sí/no; si sí, en Fase 6.
8. **¿Precio mínimo/margen mínimo?** Si existe, validar al publicar y avisar en
   el panel (sin bloquear salvo que se pida).

Si el usuario no responde, usar los valores por defecto y dejarlo escrito en el
resumen de la fase.

---

## 10. Entregables

Por cada fase:

1. Resumen de lo implementado y decisiones tomadas.
2. Archivos creados/modificados.
3. Cambios de esquema y cómo se aplican (idempotente, sin pasos manuales).
4. Endpoints nuevos o modificados con ejemplo de request/response.
5. Pruebas ejecutadas y resultado exacto.
6. Limitaciones y pasos manuales pendientes.
7. Confirmación de que Venndelo, pedidos y checkout siguen funcionando.

**No avanzar de fase sin cerrar la anterior con sus pruebas en verde.**
