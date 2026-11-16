# Progreso — Catálogo real en la Home

## Estado
Fase 0 ✅ | Fase 1 ✅ | Fase 2 ✅ | Fase 3 ✅ | Fase 4 ✅ | Fase 5 ✅

## Fase 0 — Diagnóstico del flujo «destacado» — ✅ 2026-11-16

### Tramos revisados

| # | Tramo | Estado | Evidencia |
|---|---|---|---|
| 1 | Toggle en el panel | ✅ | `Front/src/components/admin/catalog/ProductDrawer.tsx:263` envía `destacadas: form.featured` |
| 2 | Mutación front | ✅ | `Front/src/services/admin/catalog.actions.ts` → `updateAdminProduct` (`PATCH /api/admin/products/:id`) |
| 3 | Ruta admin | ✅ | `Back/Rutas/adminProducts.js` → `PATCH /:id` con `catalog.write` |
| 4 | Controller | ✅ | `Back/Controllers/catalog.controller.js` → `update` → `catalog.updateProduct` |
| 5 | Servicio | ✅ | `Back/Services/catalog/catalogQuery.service.js` → `EDITABLE.destacadas` |
| 6 | Persistencia | ✅ | columna `products.destacadas` |
| 7 | Lectura pública | ✅ | `listPublished` (filtro `featured`) + `publicShape.featured` |
| 8 | Consumo en la Home | ❌ | `Front/src/app/(store)/page.tsx` usa `@/lib/mock-data`, no la API |

### Huecos confirmados

1. ❌ La Home no consume el catálogo real (tramo 8). `Front/src/lib/mock-data.ts`
   sigue existiendo y alimenta Hero, rejillas, categorías y sitemap.
2. ⚠️ No hay control de orden ni de cantidad: `listPublished` ordena por
   `destacadas DESC, createdAt DESC`.
3. ⚠️ La forma pública no expone `badge` ni `categoryLabel`.
4. ⚠️ `destacadas` no se blindaba con `manualOverrides` (se corrigió en Fase 1).
5. ⚠️ No existían filtros de novedades ni de más vendidos en `GET /api/products`.
6. ⚠️ No había forma de fijar «favoritos de la comunidad» sin ventas.

### Decisiones
- El diagnóstico se confirmó contra el repo actual: el commit `c965a45`
  anunciaba la Home real, pero el código nunca llegó a `main` para esta parte.

---

## Fase 1 — Backend: esquema, servicio de la Home y endpoints — ✅ 2026-11-16

### Archivos tocados
- `Back/DataBase/models/ProductHomeSection.js` — modelo nuevo (`section`,
  `position`, `source`, `timestamps`).
- `Back/DataBase/models/enums.js` — `HOME_SECTION` y `HOME_SECTION_VALUES`.
- `Back/DataBase/models/index.js` — exporta `ProductHomeSection`.
- `Back/DataBase/models/associations.js` — `Product.hasMany(homeSections)` y
  `ProductHomeSection.belongsTo(product)` con `ON DELETE CASCADE`.
- `Back/DataBase/ensureCatalogSchema.js` — DDL idempotente de
  `product_home_sections`, sus índices, CHECKs por nombre y la FK a `products`;
  `hasHomeSections` y `hasHomeSectionChecks` en `getSchemaState()` y
  `needsMigration()` (incluidos en el camino rápido).
- `Back/Services/catalog/bestSellers.service.js` — agregación de unidades
  vendidas (90 días, pedidos no cancelados) y expresión de orden reutilizable.
- `Back/Services/catalog/home.service.js` — armado de las tres secciones,
  relleno automático, payload público y curaduría admin.
- `Back/Services/catalog/catalogQuery.service.js` — `new=1`, `sort=best_sellers`,
  `destacadas` en `manualOverrides` y export de `categoryInclude`.
- `Back/Controllers/home.controller.js` — `getHome`, `homeSections`,
  `replaceHomeSection`.
- `Back/Rutas/home.js` — `GET /api/home`.
- `Back/Rutas/adminProducts.js` — `GET /home-sections` y
  `PUT /home-sections/:section` antes de `/:id`, permiso `catalog.write`, sin
  step-up.
- `Back/index.js` — monta `/api/home`.
- `Back/scripts/verifyHomeSectionsMigration.js` — verifica idempotencia,
  índices y CHECKs.
- `Back/package.json` — script `db:verify-home`.
- `Back/test/catalog.home.test.js` — 8 pruebas nuevas.

### Decisiones
- **Orden curado:** primero las filas `manual` y después las `default`,
  respetando `position` dentro de cada grupo. Así los pines del admin ganan a la
  semilla sin inventar una columna de prioridad.
- **Relleno automático:** una sola regla para las tres secciones; lo curado solo
  se completa, nunca se reordena. Un producto puede repetirse entre secciones.
- **Favoritos sin ventas:** el ranking real queda vacío y la sección se apoya en
  la semilla `default` de la Fase 4 (aún no ejecutada).
- **`new=1`:** `COALESCE(publishedAt, createdAt)` dentro de 30 días.
- **`sort=best_sellers`:** subconsulta agregada por fila para que la paginación
  siga siendo correcta; empate por `destacadas` y `createdAt`.
- **`replaceSection`:** deduplicar no se permite: ids repetidos responden 422;
  más de 4 → 422; producto inexistente o no publicado → 422; sección inválida →
  400.
- **Stock 0:** no oculta el producto; así `available: false` y la tarjeta
  muestra «Agotado».
- **Compatibilidad:** una base creada por `sequelize.sync()` no traía CHECKs ni
  FK; la migración ahora las agrega por nombre y el chequeo
  `hasHomeSectionChecks` fuerza a correrla una vez.

### Verificación
- `cd Back && npm test` → **236 tests, 236 pass, 0 fail** (incluye los 8 nuevos).
- `node scripts/verifyHomeSectionsMigration.js` → primera corrida migró;
  segunda `migrated: false`; CHECKs e índices presentes. `EXIT=0`.
- `GET http://localhost:3000/api/home` → `featured: 4`, `newArrivals: 4`,
  `communityFavorites: 3`; `featured[0].badge = null` y
  `categoryLabel = "Sin clasificar"`.
- `GET /api/products?new=1&limit=4` → `total: 6`.
- `GET /api/products?sort=best_sellers&limit=4` → 200 con el orden editorial de
  respaldo (aún no hay ventas).

### Pendientes para la siguiente fase
- Front: borrar `Front/src/lib/mock-data.ts` y conectar la Home a `/api/home`.
- Crear `Front/src/services/catalog/mappers.ts` y `.../home.ts`.
- Ajustar Hero, FeaturedProducts, NewArrivals, Favorites, Categories, sitemap y
  `/productos` (`?nuevos=1`, `?mas_vendidos=1`).
- La semilla de favoritos (Fase 4) sigue pendiente: hoy la sección puede salir
  con menos de 4 productos.

---

## Fase 2 — Frontend: Home real y catálogo sin mock — ✅ 2026-11-16

### Archivos tocados
- `Front/src/types/catalog.ts` — `ProductBadge`, `HomeSectionKey`,
  `HomeCategory`, `HomePayload`; `ProductCardData.badge`; `CatalogQuery` con
  `onlyNew` y `sort`.
- `Front/src/services/catalog/mappers.ts` — `toCardData` compartido (badge y
  categoría coherentes en Home, listado y relacionados).
- `Front/src/services/catalog/home.ts` — `getHomePayload()` contra
  `GET /api/home` con `revalidate: 60`.
- `Front/src/services/catalog/index.ts` — `new` y `sort` en `listProducts`.
- `Front/src/app/(store)/page.tsx` — reescrita para consumir `/api/home`:
  secciones reales y estado vacío honesto si la API falla.
- `Front/src/components/home/Hero.tsx`, `FeaturedProducts.tsx`,
  `NewArrivals.tsx`, `Favorites.tsx` — reciben productos y categorías de la API.
- `Front/src/app/(store)/productos/page.tsx` — `?nuevos=1` y
  `?mas_vendidos=1`, títulos contextuales, filtros conservados en enlaces y
  paginación; sin mapper local.
- `Front/src/components/products/CatalogToolbar.tsx` — checkboxes
  «Novedades» y «Más vendidos», hidden de categoría y `hasFilters` ampliado.
- `Front/src/app/(store)/producto/[slug]/page.tsx` — usa `toCardData`
  compartido; se eliminó el mapper local.
- `Front/src/app/sitemap.ts` — fichas reales con `listProducts({ limit: 100 })`
  en `try/catch`; si falla, solo rutas estáticas.
- `Front/src/lib/mock-data.ts` — **eliminado**.

### Decisiones
- **Sin fallback mock:** si la API falla, la Home muestra el estado vacío
  honesto; nunca se rellena con datos de ejemplo.
- **Un solo mapper:** `toCardData` evita que la tarjeta cambie entre Home,
  listado y relacionados; el badge de sección se inyecta como argumento.
- **Filtros en la URL:** `nuevos` y `mas_vendidos` se propagan en pills,
  formulario y paginación para que el filtro sobreviva a la navegación.
- **Sitemap tolerante:** un backend caído durante el build no rompe
  `sitemap.xml`; simplemente publica menos URLs.
- **Categorías:** `Categories.tsx` conserva su tipo local compatible; no se
  tocó su diseño.

### Verificación
- `cd Front && npm run typecheck` → sin errores.
- `cd Front && npm run build` → compila; todas las rutas generadas.
- `mock-data` ya no aparece en `Front/src` (solo en documentación histórica).

### Pendientes para la siguiente fase
- Fase 3: panel de curaduría de la Home (secciones y orden).
- Fase 4: semilla de «favoritos de la comunidad» sin ventas.
- Fase 5: documentación del contrato y `publishedAt` en el admin.

---

## Fase 3 — Panel de curaduría (`/admin/catalogo`) — ✅ 2026-11-16

### Archivos tocados
- `Front/src/types/admin.ts` — `AdminHomeSectionKey`, `AdminHomeSlot` y
  `AdminHomeSections` (incluye `ranking`).
- `Front/src/services/admin/catalog.ts` — `getAdminHomeSections()` con
  `serverFetch`.
- `Front/src/services/admin/catalog.actions.ts` — `saveAdminHomeSection()`
  (`PUT /api/admin/products/home-sections/:section`).
- `Front/src/components/admin/catalog/HomeSectionsPanel.tsx` — panel nuevo:
  tres columnas de 4 ranuras, mover arriba/abajo, quitar, buscador de productos
  publicados, «Usar el ranking» y guardado por sección.
- `Front/src/components/admin/catalog/CatalogTabs.tsx` — tercera pestaña
  «Portada» con `homeHref` (`?tab=home`).
- `Front/src/components/admin/catalog/CatalogBadges.tsx` —
  `HomeSectionBadges` («Portada: Selección · Novedades»).
- `Front/src/components/admin/catalog/CatalogPanel.tsx` — recibe
  `homeSections`, calcula la ubicación por producto y la muestra en escritorio
  y móvil.
- `Front/src/app/admin/catalogo/page.tsx` — carga la curaduría junto al resto
  del panel con `loadHomeSections()` tolerante a fallos, pestaña `home` y paso
  de datos al listado.

### Decisiones
- **Carga tolerante:** si `GET /api/admin/products/home-sections` falla, el
  resto del catálogo sigue funcionando y la pestaña muestra el error con la
  pista de la migración.
- **Una pestaña, no un bloque suelto:** la curaduría ocupa el ancho completo y
  no aleja el listado del catálogo.
- **Guardado por sección:** cada columna envía solo sus ids en orden; el
  backend reemplaza la sección completa en transacción y valida 422.
- **«Usar el ranking» rellena huecos:** nunca reemplaza lo que ya está en la
  columna; solo agrega hasta completar 4.
- **Buscador por columna:** reusa `GET /api/admin/products` con
  `visibility=visible` (solo publicados) y excluye lo que ya está en esa
  sección.
- **Badges de portada:** se calculan una vez por página, no por fila.

### Verificación
- `cd Front && npm run typecheck` → sin errores.
- `cd Front && npm run build` → compila; `/admin/catalogo` sigue siendo `ƒ`
  (dinámica).
- Prueba manual pendiente en navegador (requiere backend y sesión admin):
  guardar una sección y comprobar el orden en la Home en ≤ 60 s.

### Pendientes para la siguiente fase
- Fase 4: `Back/scripts/seedHomeSections.js` (idempotente, `--dry-run`,
  `--section`, `--limit`) y script `db:seed-home`.
- Fase 5: documentación y decisión de `publishedAt` al publicar.

---

## Fase 4 — Semilla de «favoritos de la comunidad» — ✅ 2026-11-16

### Archivos tocados
- `Back/scripts/seedHomeSections.js` — siembra idempotente de la sección
  (`--section`, `--limit`, `--dry-run`), prioridad destacadas → fecha →
  stock, escribe `source = 'default'` solo en ranuras libres.
- `Back/package.json` — script `db:seed-home`.
- `Back/Utils/logger.js` — el modo local no imprimía los metadatos del log
  (`payload.datos` no existía); ahora imprime `datos` redactado. La salida JSON
  de producción no cambia.

### Decisiones
- **Solo rellena huecos:** nunca borra ni reescribe filas `manual`; si la
  sección ya está completa, termina sin escribir.
- **Posiciones reales:** asigna la primera posición libre (1..4), no
  `índice + 1`, para no chocar con huecos intermedios.
- **Candidatos acotados a 200** y ordenados en SQL; no hay N+1.
- **`--limit` se recorta a 4** porque el CHECK del esquema no admite más.
- **`ensureCatalogSchema()` al inicio:** el script funciona en una base nueva
  sin depender de haber arrancado el servidor.

### Verificación
- `node scripts/seedHomeSections.js --dry-run` → plan de 4 posiciones sin
  escribir.
- `node scripts/seedHomeSections.js` → `added: 4`, `positions: [1,2,3,4]`.
- Segunda corrida → `freePositions: []`, «La sección ya está completa».
- `getHomePayload()` en vivo → `communityFavorites` con 4 productos y
  `badge: "bestseller"`; `featured` 4 con `badge: null`; `newArrivals` 4 con
  `badge: "nuevo"`.

---

## Fase 5 — Documentación y cierre — ✅ 2026-11-16

### Archivos tocados
- `Back/Services/catalog/catalogSync.service.js` — al crear, `publishedAt` solo
  si nace visible; al republicar visible, se fija si faltaba y nunca se pisa.
- `Back/Services/catalog/catalogAdmin.service.js` — `setVisibility` y el lote
  `make_visible` fijan `publishedAt` en la primera publicación.
- `Back/test/catalog.admin.test.js` — el borrador nace con `publishedAt = null`
  y publicarlo (individual o `auto_visible`) lo fija.
- `Back/README.md` — scripts `db:verify-home`/`db:seed-home`, endpoint
  `/api/home`, rutas admin de curaduría y sección «Portada curada».
- `Back/docs/PROVEEDORES.md` — semántica de `publishedAt` en el flujo.
- `Front/docs/BACKEND_INTEGRATION.md` — `/api/home`, filtros `new`/`sort`,
  `badge`/`categoryLabel`, payload de la portada y filas de la tabla de estado.
- `AGENTS.md` — regla de la portada en la sección de esquema.

### Decisiones
- **Opción (a) del prompt:** `publishedAt` = primera publicación real. Un
  borrador nace sin fecha; hacerlo visible (panel, lote o proveedor) la fija
  una sola vez. «Novedades» usa `COALESCE(publishedAt, createdAt)`.
- **No se pisa una fecha existente:** republicar o reactivar no reinicia la
  ventana de 30 días.

### Verificación
- `cd Back && npm test` → **236 tests, 236 pass, 0 fail** (incluye las nuevas
  aserciones de `publishedAt`).
- `cd Front && npm run typecheck` → sin errores.
- `cd Front && npm run build` → compila; todas las rutas generadas.
- Extremo a extremo contra la base local: `GET /api/home` con las tres
  secciones completas y badges correctos; `communityFavorites` sembrado.

### Cierre
Todas las fases del plan están completas. Queda como prueba manual pendiente
(en navegador, con sesión admin) guardar una sección desde
`/admin/catalogo?tab=home` y ver el orden reflejado en la Home en ≤ 60 s.
