# PROMPT POR FASES — Catálogo real en la Home + curaduría por secciones

> **Prompt ejecutable por fases**, pensado para correr en **otro contexto**
> (sesión nueva, otro agente). Cada fase es autocontenida: qué hacer, qué
> archivos tocar, cómo verificar y **qué dejar escrito** para que la siguiente
> fase pueda arrancar sin contexto previo.
>
> Este documento **reemplaza** a `docs/PROMPT_HOME_CATALOGO_REAL.md` (que queda
> como documento de diseño de referencia).

---

## 0. Cómo ejecutar este prompt

1. **Una fase por sesión.** No intentes hacer todo de una: cada fase termina
   con una verificación y con un registro.
2. **Al empezar cualquier fase**, lee `docs/HOME_CATALOGO_PROGRESS.md` (si
   existe) para saber qué fases ya se hicieron y qué quedó pendiente.
3. **Al terminar cada fase**, actualiza `docs/HOME_CATALOGO_PROGRESS.md`
   (§12 de este documento) con: fases completadas, archivos tocados, decisiones
   tomadas, resultados de la verificación y **pendientes para la siguiente fase**.
4. Si una fase revela un problema que invalida fases posteriores, **detente**,
   anótalo en el log y replanifica antes de seguir.
5. Nunca cambies el alcance de una fase sin decirlo en el log.

### Reglas transversales (aplican a todas las fases)

- La marca es **UPBUY**. Nada de marcas personales ni de proyectos anteriores.
- **UI en español.** Comentarios y docs en español; en el backend, ASCII plano
  cuando el archivo ya lo evita.
- Backend: `Rutas/` → `Controllers/` → `Services/` → `DataBase/models/`.
  Errores con `Utils/HttpError.js`. **Nada de `console.log`** (usar
  `Utils/logger.js`).
- El backend es la fuente de verdad: precios, stock, orden y secciones se
  resuelven **en el servidor**.
- En producción **no** se ejecuta `sequelize.sync()`: el esquema lo aplican
  `ensureBaseSchema` / `ensureCatalogSchema` / `ensureDropshippingSchema`
  (idempotentes).
- Toda llamada HTTP del front pasa por `Front/src/services/api/client.ts`
  (`apiFetch` = lectura pública, `apiSend` = mutación con sesión).
- No inventes endpoints: revisa `Back/Rutas/` y `Back/README.md`.
- No cambies el diseño (tokens, grid 2/3/4, `lucide-react`, sin emoji como
  icono). Los cambios son de **datos**.
- Accesibilidad: focus visible, `alt` en imágenes, `aria-label` en botones de
  solo icono, contraste ≥ 4.5:1, `prefers-reduced-motion` respetado.
- Antes de dar por terminado un cambio:
  `cd Back && npm test` y `cd Front && npm run typecheck && npm run build`.

---

## 1. Contexto del proyecto (verificado)

Monorepo **UPBUY**: `Back/` (Node 22 + Express 4 + Sequelize 6 + PostgreSQL,
CommonJS, puerto 3000) y `Front/` (Next.js 16 App Router + React 19 + TS +
Tailwind v4, puerto 3001). Cada uno con su propio `package.json`.

Lee antes de empezar: `AGENTS.md` (raíz) y `Front/AGENTS.md`.

### 1.1 Estado del frontend: el mock

`Front/src/lib/mock-data.ts` exporta `PRODUCTS` (8 productos falsos),
`CATEGORIES` (4 categorías falsas), los tipos `Product` / `Category` y los
helpers `getFeaturedProducts()`, `getNewArrivals()`, `getRelatedProducts()`.

Consumidores reales del mock:

| Archivo | Qué usa |
|---|---|
| `Front/src/app/(store)/page.tsx` | `CATEGORIES`, `PRODUCTS`, `getFeaturedProducts()`, `getNewArrivals()` |
| `Front/src/components/home/Hero.tsx` | tipo `Product` |
| `Front/src/components/home/FeaturedProducts.tsx` | tipo `Product` |
| `Front/src/components/home/NewArrivals.tsx` | tipo `Product` |
| `Front/src/components/home/Favorites.tsx` | tipo `Product` |
| `Front/src/components/home/Categories.tsx` | tipo `Category` |
| `Front/src/app/sitemap.ts` | `PRODUCTS` (URLs de producto) |

`Front/src/components/products/ProductCard.tsx` **ya** usa `ProductCardData`
(de `Front/src/types/catalog.ts`), no el tipo del mock. `ProductCardData` ya
tiene `badge?: "bestseller" | "nuevo" | null` y `categoryLabel?: string | null`.

`Front/src/app/(store)/productos/page.tsx` ya consume la API y tiene un mapper
local `toCardData(product: PublicProduct)` → **se extrae a un módulo
compartido**.

`Front/src/app/(store)/producto/[slug]/page.tsx` ya usa la API (relacionados
con `listProducts({ category })`).

### 1.2 Estado del backend

- `products` (`Back/DataBase/models/Product.js`): `sku`, `slug`, `name`,
  `description`, `images` (JSONB), `price`, `compareAtPrice`,
  `descuentoPorcentaje`, `stock`, `active`, `status` (`draft|active|archived`),
  `sizes` (JSONB), `combo`, **`destacadas` (BOOLEAN)**, `publishedAt`,
  `createdAt`, `manualOverrides` (JSONB).
  **No existe** ningún campo para «nuevo» ni para «favoritos».
- `Back/Services/catalog/catalogQuery.service.js`:
  - `publicShape` (~l.22) expone `featured: Boolean(json.destacadas)` y **no**
    expone `cost` ni `markup`.
  - `listPublished` (~l.64) filtra por `featured` (~l.83) y ordena
    `destacadas DESC, createdAt DESC` (~l.92).
  - `EDITABLE` (~l.247) incluye `destacadas: (value) => Boolean(value)`.
  - `updateProduct` marca `manualOverrides` solo para
    `price, name, description, active, stock` — **`destacadas` no se blinda**.
- `Back/Rutas/products.js` → `GET /api/products?q=&category=&featured=&limit=&offset=`,
  `GET /api/products/:slug`. Controller: `Back/Controllers/catalog.controller.js`.
- `Back/Rutas/adminProducts.js` → `GET /api/admin/products`,
  `GET /api/admin/products/:id`, `PATCH /api/admin/products/:id`,
  `POST /api/admin/products/:id/visibility`, `POST /api/admin/products/bulk`,
  `PUT /api/admin/products/:id/images`, `POST /api/admin/products/:id/images/restore`.
  **Las rutas fijas van antes de las que llevan `:id`.**
- `Back/Services/catalog/visibility.service.js`: la acción en lote
  `PRODUCT_BULK_ACTION.FEATURE` ya escribe `destacadas` (l.138-143).
- `Back/Services/catalog/catalogSync.service.js` (~l.405): `publishedAt` se
  setea **solo al crear** el producto desde el proveedor. Un producto publicado
  después desde el panel **no** tiene `publishedAt`.
- Ventas: `Back/DataBase/models/OrderItem.js` (`productId`, `quantity`,
  `productType`) + `Back/DataBase/models/Order.js` (`fulfillmentStatus`,
  `paymentState`, `createdAt`).
- Enums (`Back/DataBase/models/enums.js`): `FULFILLMENT_STATUS`
  (`pending_payment|paid|packing|shipped|delivered|cancelled`), `PAYMENT_STATE`,
  `PRODUCT_STATUS`, `PRODUCT_BULK_ACTION`, `SALE_CHANNEL`.
- Panel admin (front): `Front/src/app/admin/catalogo/page.tsx`,
  `Front/src/components/admin/catalog/{CatalogPanel,ProductDrawer,CatalogBadges}.tsx`;
  lecturas en `Front/src/services/admin/catalog.ts` (`serverFetch`, servidor),
  mutaciones en `Front/src/services/admin/catalog.actions.ts` (`apiSend`, cliente).

### 1.3 Contrato público actual

`GET /api/products` → `{ products: PublicProduct[], total, limit, offset }`.
`PublicProduct` (`Front/src/types/catalog.ts`): `id`, `sku`, `slug`, `name`,
`description`, `images`, `price`, `priceBase`, `compareAtPrice`,
`discountPercent`, `currency`, `stock`, `available`, `sizes`, `combo`,
`featured`, `categories[]`, `createdAt`.

### 1.4 Decisiones ya tomadas (no las reabra sin justificarlas)

- Cada sección de la Home muestra **como máximo 4** productos.
- **Selección**: curaduría del admin (ya existe el toggle «destacado»).
- **Novedades**: curado + automático por `publishedAt` (30 días).
- **Favoritos de la comunidad**: automático por **unidades vendidas**
  (pedidos no cancelados, 90 días) + pines del admin; **mientras no haya
  ventas** (la tienda es nueva) se llenan con una **selección por defecto**
  (semilla idempotente).
- Curaduría manual (posición) **siempre gana** al relleno automático.
- El backend expone **un solo** endpoint para la Home (`GET /api/home`): una
  llamada, una coherencia.

---

## 2. Modelo de curaduría (base de todas las fases)

### 2.1 Tabla nueva

`Back/DataBase/ensureCatalogSchema.js` (idempotente, junto al resto):

```sql
CREATE TABLE IF NOT EXISTS product_home_sections (
  id          UUID PRIMARY KEY,
  "productId" UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  section     VARCHAR(20) NOT NULL
              CHECK (section IN ('seleccion','novedades','favoritos')),
  position    SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 4),
  source      VARCHAR(10) NOT NULL DEFAULT 'manual'
              CHECK (source IN ('manual','default')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_home_sections_product_section_uidx
  ON product_home_sections ("productId", section);
CREATE INDEX IF NOT EXISTS product_home_sections_section_position_idx
  ON product_home_sections (section, position);
```

- `source` distingue lo que puso una persona (`manual`) de lo que puso la
  semilla (`default`). La semilla **solo rellena huecos**: nunca pisa una
  fila `manual`.
- En `getSchemaState()` agrega
  `to_regclass('public.product_home_sections') IS NOT NULL AS "hasHomeSections"`
  y actívalo en `needsMigration()`. **El “camino rápido” (una sola consulta de
  lectura) debe incluir el chequeo nuevo**, o la tabla nunca se creará en una
  base que ya tiene todo lo demás.

### 2.2 Enums

En `Back/DataBase/models/enums.js`:

```js
const HOME_SECTION = {
  FEATURED: "seleccion",
  NEW_ARRIVALS: "novedades",
  FAVORITES: "favoritos",
};
const HOME_SECTION_VALUES = Object.values(HOME_SECTION);
```

### 2.3 Algoritmo de armado de una sección

```
curados  = filas de product_home_sections de la sección, por position asc
           (solo si el producto está publicado: status=active AND active=true)
huecos   = 4 - curados.length
automáticos = candidatos de la regla de la sección, excluyendo los ya curados
sección  = curados ++ automáticos[0..huecos]
```

| Sección | Regla automática |
|---|---|
| `seleccion` | `destacadas = true` primero; después `createdAt DESC` |
| `novedades` | `publishedAt` (o `createdAt` si es null) dentro de los últimos **30 días**, desc; después los más recientes en general |
| `favoritos` | **unidades vendidas** en los últimos **90 días**, desc (pedidos no cancelados); desempate: `destacadas`, luego `createdAt DESC` |

Constantes en el servicio: `HOME_SECTION_SIZE = 4`,
`NEW_ARRIVAL_WINDOW_DAYS = 30`, `COMMUNITY_FAVORITES_WINDOW_DAYS = 90`.

**Si no hay datos** (tienda nueva, cero ventas), la sección de favoritos se
llena con: pines `manual` → filas `default` de la semilla → el ranking
automático (que estaría vacío). Por eso la Fase 4 siembra la sección.

### 2.4 Badge de tarjeta (derivado, no almacenado)

- En la sección de favoritos → `badge: "bestseller"` (la tarjeta muestra
  «Más vendido»).
- En la sección de novedades → `badge: "nuevo"` (la tarjeta muestra «Nuevo»).
- En selección → `badge: null`.

El badge viaja **en la respuesta** (depende de la sección donde se muestra), no
es un campo del producto.

---

## FASE 0 — Diagnóstico del flujo «destacado» (solo lectura, sin cambios)

**Objetivo:** confirmar si el flujo «marcar destacado en `/admin/catalogo` →
visible en la Home» está completo, y dejar la lista exacta de huecos.

**Qué revisar** (leer, no escribir):

| # | Tramo | Dónde |
|---|---|---|
| 1 | Toggle en el panel | `Front/src/components/admin/catalog/ProductDrawer.tsx` (~l.263 envía `destacadas: form.featured`) |
| 2 | Mutación front | `Front/src/services/admin/catalog.actions.ts` → `updateAdminProduct` (`apiSend`, `PATCH /api/admin/products/:id`) |
| 3 | Ruta admin | `Back/Rutas/adminProducts.js` → `PATCH /:id` (permiso `catalog.write`) |
| 4 | Controller | `Back/Controllers/catalog.controller.js` → `update` → `catalog.updateProduct` |
| 5 | Servicio | `Back/Services/catalog/catalogQuery.service.js` → `EDITABLE.destacadas` + `updateProduct` |
| 6 | Persistencia | `products.destacadas` |
| 7 | Lectura pública | `listPublished` (filtro `featured`) + `publicShape.featured` → `GET /api/products?featured=true` |
| 8 | **Consumo en la Home** | `Front/src/app/(store)/page.tsx` → **usa `mock-data.ts`, NO la API** |

**Comprobación en vivo** (con el backend y el front levantados):

```bash
# 1. Marcar un producto como destacado desde la API admin (o desde el panel)
curl -X PATCH "http://localhost:3000/api/admin/products/<id>" \
  -H "Content-Type: application/json" -b "<cookie de admin>" \
  -d '{"destacadas":true}'

# 2. Verificar que el catálogo público lo devuelve como destacado
curl "http://localhost:3000/api/products?featured=true&limit=10" | jq '.total, [.products[].featured]'

# 3. Verificar si aparece en la Home (NO debería: la Home usa el mock)
curl "http://localhost:3001/" | grep -c "Camiseta Edición Retro"   # dato del mock
```

**Salida esperada de esta fase** (escribe esto en el log):

- Una tabla de los 8 tramos con ✅ / ⚠️ / ❌ y la evidencia (archivo:línea).
- La lista de huecos. Confirmado en la revisión previa del repo, **vuelve a
  verificarlo** (puede haber cambiado):
  1. ❌ **La Home no consume el catálogo real**: el tramo 8 está roto; los
     destacados nunca llegan a la Home.
  2. ⚠️ **No hay control de orden ni de cantidad**: `listPublished` ordena por
     `destacadas DESC, createdAt DESC`; los 4 destacados salen por antigüedad,
     no por curaduría.
  3. ⚠️ **La forma pública no expone `badge` ni `categoryLabel`**: las tarjetas
     reales no pueden marcar «Más vendido» / «Nuevo» ni la categoría.
  4. ⚠️ **`destacadas` no se blinda con `manualOverrides`**: hoy el sync no
     escribe ese campo, pero ninguna regla impide que lo haga en el futuro.
  5. ⚠️ **No existe filtro de novedades ni de más vendidos** en
     `GET /api/products`.
  6. ⚠️ **No hay forma de fijar los “favoritos de la comunidad”** sin ventas.

**Criterio de salida:** log con la tabla de los 8 tramos y la lista de huecos
confirmada. **No se cambia código en esta fase.**

---

## FASE 1 — Backend: esquema, servicio de la Home y endpoints

**Objetivo:** que el backend sepa armar las tres secciones y las exponga.

### 1.1 Modelo y asociación

- Nuevo `Back/DataBase/models/ProductHomeSection.js`:
  `id` UUID (`uuidv4`), `productId` UUID, `section` STRING(20)
  (`validate.isIn(HOME_SECTION_VALUES)`), `position` SMALLINT
  (`validate.min 1`, `validate.max 4`), `source` STRING(10)
  (`manual|default`), `timestamps: true`, `tableName: "product_home_sections"`,
  índices `unique (productId, section)` y `(section, position)`.
- Exportarlo en `Back/DataBase/models/index.js`.
- Asociación en `Back/DataBase/models/associations.js`:
  `Product.hasMany(ProductHomeSection, { as: "homeSections", onDelete: "CASCADE" })`
  y `ProductHomeSection.belongsTo(Product, { as: "product", foreignKey: "productId" })`.

### 1.2 Migración idempotente

- `Back/DataBase/ensureCatalogSchema.js`: DDL de §2.1 + chequeo en
  `getSchemaState()` + `needsMigration()`.
- Nuevo `Back/scripts/verifyHomeSectionsMigration.js` (al estilo de
  `Back/scripts/verifySupplierCatalogMigration.js`): corre la migración **dos
  veces**, comprueba que la segunda es no-op y que los índices existen.

### 1.3 Servicio `Back/Services/catalog/home.service.js`

```js
const HOME_SECTION_SIZE = 4;
const NEW_ARRIVAL_WINDOW_DAYS = 30;
const COMMUNITY_FAVORITES_WINDOW_DAYS = 90;

getHomePayload()          -> { sections: { featured, newArrivals, communityFavorites }, categories }
getAdminHomeSections()    -> { featured, newArrivals, communityFavorites, ranking }
replaceSection(section, productIds) -> { section, productIds }
```

Reglas:

- Reutiliza `catalogQuery.service.js → publicShape` para la forma del producto
  (no dupliques el shape ni expongas `cost`/`markup`) y **agrega** `badge` y
  `categoryLabel` (`categories[0]?.name ?? null`).
- Solo entra producto **publicado**: `status = 'active'` AND `active = true`.
- El **stock 0 no oculta** el producto: sale con `available: false` (la UI
  muestra «Agotado»). Solo se oculta lo que el proveedor deja de ofrecer.
- Un producto **puede repetirse en varias secciones** (el badge depende de la
  sección).
- El ranking de favoritos, en **una sola** consulta agregada (sin N+1):

```sql
SELECT oi."productId" AS "productId", SUM(oi.quantity)::int AS units
  FROM order_items oi
  JOIN orders o ON o.id = oi."orderId"
 WHERE oi."productType" = 'product'
   AND o."fulfillmentStatus" <> 'cancelled'
   AND o."createdAt" >= :since
 GROUP BY oi."productId"
 ORDER BY units DESC
 LIMIT 20
```

  (`since` = ahora − 90 días). Se descartan los que no estén publicados.
- `replaceSection`: `section` inválida → **400**; más de 4 ids → **422**;
  id inexistente, repetido o de producto no publicado → **422**; **reemplaza**
  la sección completa en una transacción (idempotente). Preserva `source`
  (`manual` en lo que escribe el admin).
- `getAdminHomeSections` devuelve por sección los curados **con `unitsSold`**, y
  en `ranking` el top 20 automático de favoritos con `unitsSold`.

### 1.4 Rutas y controllers

- Nueva `Back/Rutas/home.js` → `router.get("/", home)`; montar en
  `Back/index.js` como `app.use("/api/home", homeRoutes)`.
- `Back/Rutas/adminProducts.js` (**antes** de `/:id`):
  - `GET /home-sections` (permiso `catalog.write`)
  - `PUT /home-sections/:section` (permiso `catalog.write`, **sin** step-up:
    no despublica nada)
- Controller en `Back/Controllers/catalog.controller.js` (o un
  `home.controller.js` nuevo): `home`, `homeSections`, `replaceHomeSection`.

### 1.5 Contrato público nuevo

`GET /api/home` →

```json
{
  "sections": {
    "featured":           [PublicProduct...],
    "newArrivals":        [PublicProduct...],
    "communityFavorites": [PublicProduct...]
  },
  "categories": [ { "id": "...", "name": "...", "slug": "...", "description": null } ]
}
```

Cada producto suma `badge` (`"bestseller" | "nuevo" | null`) y `categoryLabel`
(`string | null`). Cada sección trae **como máximo 4**.

### 1.6 Extender `GET /api/products`

- `new=1` → solo novedades (mismo criterio que la sección).
- `sort=best_sellers` → orden por unidades vendidas (90 días); sin datos, cae al
  orden actual (`destacadas DESC, createdAt DESC`).
- Controller (`catalog.controller.js`) y `Front/src/services/catalog/index.ts`
  (tipos `CatalogQuery`) deben conocer ambos parámetros.

### 1.7 Blindaje (huesco 4 del diagnóstico)

- En `updateProduct` (`catalogQuery.service.js`), añadir `destacadas` a la
  lista de campos que marcan `manualOverrides`
  (`["price","name","description","active","stock","destacadas"]`).
  Verifica que esto **no** rompa la sincronización: hoy el sync no escribe
  `destacadas`, así que solo cambia la protección.

### 1.8 Tests

Nuevo `Back/test/catalog.home.test.js` (patrón de
`Back/test/catalog.admin.test.js`: se salta solo si no hay base de datos):

- Una sección nunca devuelve más de 4.
- La posición manual define el orden.
- Lo curado gana al automático.
- Un producto no publicado (`status != active` o `active = false`) no aparece
  en ninguna sección.
- El ranking ordena por unidades vendidas y excluye pedidos cancelados.
- `replaceSection`: 5 ids → 422; id inexistente → 422; id repetido → 422.
- `GET /api/products?new=1` y `?sort=best_sellers` → 200 con el filtro aplicado.
- El `badge` sale bien según la sección.

**Verificación de la fase**

```bash
cd Back
npm test
node scripts/verifyHomeSectionsMigration.js
```

Prueba manual:

```bash
curl "http://localhost:3000/api/home" | jq '.sections | map_values(length)'
curl "http://localhost:3000/api/home" | jq '.sections.featured[0] | {name, badge, categoryLabel}'
curl "http://localhost:3000/api/products?new=1&limit=4" | jq '.total'
```

**Criterio de salida:** `GET /api/home` devuelve las 3 secciones con ≤ 4
productos, `badge`/`categoryLabel` presentes, la migración es idempotente y
`npm test` pasa. **Anota en el log** qué se encontró al correr
`verifyHomeSectionsMigration.js`.

---

## FASE 2 — Front: quitar el mock y conectar la Home

**Objetivo:** la Home muestra únicamente productos reales. Si la API falla,
estado vacío honesto (nunca datos de prueba).

### 2.1 Fuera el mock

- **Borra `Front/src/lib/mock-data.ts`.**
- En `Front/src/types/catalog.ts` agrega:
  - `export type ProductBadge = "bestseller" | "nuevo" | null;`
  - `export type HomeSectionKey = "featured" | "newArrivals" | "communityFavorites";`
  - `export type HomePayload = { sections: Record<HomeSectionKey, PublicProduct[]>; categories: Category[] };`
  - `PublicProduct` gana `badge?: ProductBadge | null;` y `categoryLabel?: string | null;`.
- `Category` (en `types/catalog.ts`) tiene `description: string | null`: los
  componentes de la Home deben tolerar `null`.

### 2.2 Mapper compartido

Nuevo `Front/src/services/catalog/mappers.ts`:

```ts
export function toCardData(product: PublicProduct, badge?: ProductBadge | null): ProductCardData
```

Reglas: `compareAtPrice` = `compareAtPrice` si es mayor que `price`, si no
`priceBase` si es mayor que `price`, si no `null`; `categoryLabel` =
`categories[0]?.name ?? null`; `image` = `getCoverImage(product)`;
`available` = `product.available`; `badge` = el de la sección ?? `product.badge`.

`Front/src/app/(store)/productos/page.tsx` **deja de tener su `toCardData`
local** y usa este.

### 2.3 Lectura de la Home

Nuevo `Front/src/services/catalog/home.ts`:

```ts
export async function getHomePayload(): Promise<HomePayload>
// apiFetch<HomePayload>("/api/home", { revalidate: 60 })
```

### 2.4 Página principal

`Front/src/app/(store)/page.tsx` pasa a ser **Server Component async**:

- `export const revalidate = 60;`
- `Promise.allSettled([getHomePayload(), listCategories()])`.
- Asignación: `Hero` ← `sections.featured[0] ?? null`;
  `FeaturedProducts` ← `sections.featured`;
  `NewArrivals` ← `sections.newArrivals`;
  `Favorites` ← `sections.communityFavorites`;
  `Categories` ← `categories`.
- **Si la API falla**: se renderizan las secciones editoriales (Hero,
  BenefitsTicker, BrandBanner, BrandPillars, Newsletter) y, en lugar de las
  rejillas, un estado vacío honesto en español («Todavía no hay productos
  publicados» / «No pudimos cargar el catálogo») con enlace a `/productos`.
  **Nunca inventes productos.**

### 2.5 Componentes de la Home

- `Hero.tsx`: prop `featured: ProductCardData | null`; si es `null`, no
  renderiza la tarjeta superpuesta. Sigue usando `<GlitchText />`.
- `FeaturedProducts.tsx`, `NewArrivals.tsx`, `Favorites.tsx`: prop
  `products: ProductCardData[]`; importan de `@/types/catalog` (nada de
  `@/lib/mock-data`). Con `products.length === 0` la sección **no se renderiza**
  (devuelve `null`): nada de grids vacíos.
- `Categories.tsx`: `Category` de `@/types/catalog`; `description` nulo → texto
  por defecto.
- CTAs: «Ver todas las novedades» → `/productos?nuevos=1`;
  «Ver todos los productos» (favoritos) → `/productos?mas_vendidos=1`.

### 2.6 Catálogo y sitemap

- `Front/src/app/(store)/productos/page.tsx`: usa el mapper compartido; acepta
  `?nuevos=1` y `?mas_vendidos=1` y los traduce a `new` / `sort` en la llamada
  al backend; los conserva al paginar y al filtrar por categoría.
- `Front/src/app/sitemap.ts`: deja de importar el mock. Pide productos reales
  (`listProducts({ limit: 100 })`) en un `try/catch`; si la API falla, el
  sitemap devuelve **solo** las rutas estáticas (nunca URLs de producto
  inventados).

### 2.7 Verificación

```bash
cd Front
npm run typecheck
npm run build
rg -n "mock-data" src     # debe salir vacío
```

Prueba manual:

- Con la API caída → la Home carga, sin productos, con el estado vacío.
- Con la API arriba → la Home muestra los productos **publicados** y nada que
  no exista en la base.

**Criterio de salida:** no queda referencia a `mock-data` en `Front/src`, la
Home consume `GET /api/home`, y `typecheck` + `build` pasan.

---

## FASE 3 — Panel de curaduría (`/admin/catalogo`)

**Objetivo:** que el admin ordene las tres secciones sin tocar SQL.

### 3.1 Servicios y tipos

- `Front/src/services/admin/catalog.ts` (lecturas, `serverFetch`):
  `getAdminHomeSections(): Promise<AdminHomeSections>`.
- `Front/src/services/admin/catalog.actions.ts` (mutaciones, `apiSend`):
  `saveAdminHomeSection(section, productIds)` → `PUT`.
- `Front/src/types/admin.ts`: `AdminHomeSection` (`"seleccion" | "novedades" |
  "favoritos"`), `AdminHomeSlot` (`{ productId, name, sku, position, unitsSold,
  image? }`), `AdminHomeSections`.

### 3.2 UI

Nuevo `Front/src/components/admin/catalog/HomeSectionsPanel.tsx`, integrado en
`Front/src/app/admin/catalogo/page.tsx`:

- Tres columnas: Selección / Novedades / Favoritos.
- Cada una con **4 ranuras ordenadas**: mover arriba/abajo, quitar.
- Buscador de productos **publicados** para añadir (reusa el listado admin).
- En Favoritos: ranking automático con **unidades vendidas** y botón
  «Usar el ranking» que rellena los huecos (sin pisar lo manual).
- «Guardar sección» → `PUT` con el orden visible; mensaje de error del backend
  en español (422 → «Máximo 4 productos por sección»).
- `CatalogBadges.tsx`: mostrar en qué secciones está cada producto.

### 3.3 Verificación

```bash
cd Front
npm run typecheck && npm run build
```

Prueba manual: guardar una sección desde el panel → recargar la Home (≤ 60 s
por el `revalidate: 60`) → el orden se respeta.

**Criterio de salida:** el admin puede guardar las tres secciones y el orden se
respeta en la Home.

---

## FASE 4 — Semilla por defecto de «favoritos de la comunidad»

**Objetivo:** la tienda es nueva y **no tiene ventas**: el ranking de unidades
vendidas estaría vacío y la sección saldría vacía. Hay que sembrar una
selección por defecto, **sin pisar** lo que el admin curate después.

### 4.1 Script

Nuevo `Back/scripts/seedHomeSections.js`:

- Uso: `node scripts/seedHomeSections.js [--section=favoritos] [--limit=4] [--dry-run]`
  (por defecto `--section=favoritos`, `--limit=4`).
- **Idempotente**: si la sección ya tiene filas `manual`, **no se tocan**; la
  semilla solo rellena las ranuras libres y escribe sus filas con
  `source = 'default'`.
- Selección de candidatos (en este orden, solo productos publicados
  `status=active AND active=true`):
  1. productos ya marcados `destacadas = true` (coherencia con «Selección»);
  2. los más recientes por `publishedAt`/`createdAt`;
  3. los de mayor `stock`.
- Si no hay candidatos suficientes, se deja la sección con lo que haya (y el
  log avisa).
- **`--dry-run`**: imprime qué haría, sin escribir.
- Al escribir, `position` = índice + 1, respetando las posiciones ya ocupadas.
- Log con `Utils/logger.js` (sin `console.log`).
- Escribe en el log un resumen: productos agregados, saltados y motivo.

### 4.2 Script npm

En `Back/package.json`: `"db:seed-home": "node scripts/seedHomeSections.js"`.
Documentarlo en `Back/README.md` (junto a `db:bootstrap`, `db:check`).

### 4.3 Cuándo se ejecuta

- **Manual**, después de la Fase 3 (para que el admin ya pueda corregir).
- La Home **no depende** de la semilla: si la tabla está vacía, la sección
  muestra lo que haya (y la UI lo comunica).
- Cuando la tienda **sí** tenga ventas, el ranking automático (unidades
  vendidas) **complementa** la semilla: la sección prioriza pines `manual` →
  filas `default` → ranking real. Documenta esta prioridad.

### 4.4 Verificación

```bash
cd Back
node scripts/seedHomeSections.js --dry-run
node scripts/seedHomeSections.js
node scripts/seedHomeSections.js     # segunda corrida: no debe duplicar nada
curl "http://localhost:3000/api/home" | jq '.sections.communityFavorites | length'
```

**Criterio de salida:** la sección de favoritos tiene 4 productos por defecto,
la segunda corrida no cambia nada y el dry-run no escribe.

---

## FASE 5 — Documentación y cierre

**Objetivo:** que el contrato quede escrito y que todo pase de punta a punta.

### 5.1 Documentación

- `Back/README.md`: endpoints `GET /api/home` y admin `home-sections`; la
  tabla `product_home_sections`; el script `db:seed-home`; la prioridad
  pines → default → ranking.
- `Front/docs/BACKEND_INTEGRATION.md`: §1 (endpoints), §2 (contrato del
  producto: `badge`, `categoryLabel`; payload de `/api/home`), §3 (estado
  «Catálogo en la Home»).
- `AGENTS.md` (raíz): si la curaduría de la Home pasa a ser regla del
  proyecto, una línea por regla en la sección de esquema.
- `Back/docs/PROVEEDORES.md`: solo si el sync empieza a setear `publishedAt`
  al publicar (ver §5.2).

### 5.2 Decisión pendiente que debes resolver en esta fase

`publishedAt` hoy se setea **solo al crear** el producto desde el proveedor
(`catalogSync.service.js` ~l.405). Un producto publicado después desde el panel
**no** lo tiene → la ventana de 30 días de «Novedades» no lo detecta.

Elige y aplica **una**:

- **(a) Recomendada**: setear `publishedAt` cuando un producto pasa a visible
  por primera vez (`POST /api/admin/products/:id/visibility` y la publicación
  del proveedor), sin pisarlo si ya tiene valor; **y** usar
  `publishedAt ?? createdAt` como criterio de novedades.
- **(b)**: no tocar el backend y usar `createdAt` como criterio de novedades
  (más simple, menos preciso).

### 5.3 Verificación final

```bash
cd Back && npm test
cd Front && npm run typecheck && npm run build

# Extremo a extremo
curl "http://localhost:3000/api/home" | jq '.sections | map_values(map(.name))'
curl "http://localhost:3000/api/products?featured=true&limit=4" | jq '.total'
curl "http://localhost:3000/api/products?new=1&limit=4" | jq '.total'
curl "http://localhost:3000/api/products?sort=best_sellers&limit=4" | jq '.total'
```

Y a mano, en el navegador:

1. Marcar un producto como destacado en `/admin/catalogo` → aparece en
   «Selección» de la Home (≤ 60 s).
2. Publicar un producto nuevo → aparece en «Novedades».
3. Con cero ventas, «Favoritos» muestra la selección por defecto.
4. Con la API caída → la Home no muestra productos falsos.

---

## 12. Formato del log de progreso

Crea/actualiza `docs/HOME_CATALOGO_PROGRESS.md` al terminar cada fase:

```markdown
# Progreso — Catálogo real en la Home

## Estado
Fase 0 ✅ | Fase 1 ✅ | Fase 2 ⬜ | Fase 3 ⬜ | Fase 4 ⬜ | Fase 5 ⬜

## Fase N — <nombre> — ✅ <fecha>
### Archivos tocados
- `Back/...` — <qué se hizo>
### Decisiones
- <decisión y por qué>
### Verificación
- <comandos ejecutados y resultado>
### Pendientes para la siguiente fase
- <lista>
```

---

## 13. Criterios de aceptación globales

- [ ] `Front/src/lib/mock-data.ts` no existe y `rg -n "mock-data" Front/src`
      no devuelve nada.
- [ ] La Home muestra **solo** productos de `GET /api/home`; con la API caída
      se ve un estado vacío honesto, **no** productos de prueba.
- [ ] Cada sección muestra **como máximo 4** tarjetas y **nunca** un grid vacío.
- [ ] Solo aparecen productos publicados (`status=active`, `active=true`).
- [ ] El orden de cada sección es el curado por el admin; lo curado no se
      desplaza por el relleno automático.
- [ ] «Novedades» = curado + automático por `publishedAt` (30 días).
- [ ] «Favoritos» = pines del admin → selección por defecto (semilla) →
      ranking por unidades vendidas (90 días); la semilla es idempotente.
- [ ] Los badges son correctos: «Más vendido» en favoritos, «Nuevo» en
      novedades.
- [ ] Los CTA de novedades y favoritos llevan a listados que funcionan
      (`?nuevos=1`, `?mas_vendidos=1`).
- [ ] El panel permite guardar las tres secciones; el cambio se ve en la Home
      en ≤ 60 s.
- [ ] El `sitemap.xml` solo contiene URLs de productos reales.
- [ ] `cd Back && npm test` pasa (con el test nuevo de la Home).
- [ ] `cd Front && npm run typecheck && npm run build` pasa.
- [ ] `Back/README.md` y `Front/docs/BACKEND_INTEGRATION.md` actualizados.

---

## 14. Lo que NO debes hacer

- No reintroducir datos de ejemplo en el front «para que se vea algo»: si no
  hay catálogo, la Home dice que no hay catálogo.
- No exponer `cost`, `markup`, `providerSku`, `manualOverrides` ni datos del
  proveedor en las respuestas públicas.
- No meter las reglas de secciones (orden, capacidad, ranking, ventana de
  fechas) en componentes del front: viven en
  `Back/Services/catalog/home.service.js`.
- No ejecutar `sequelize.sync()` ni escribir DDL fuera de
  `ensureCatalogSchema.js`.
- No cambiar la numeración de pedidos, la cookie de sesión ni los estados
  canónicos de orden.
- No tocar el diseño (tokens, tipografías, grid 2/3/4, `lucide-react`, sin
  emoji como icono).
- No instalar componentes nuevos de Kokonut UI si no hace falta; si hace
  falta, usa la CLI de shadcn (`npx shadcn@latest add @kokonutui/<name>`).
