# PROMPT — Catálogo real en la Home + curaduría por secciones

> ⚠️ **Versión vigente:** el prompt ejecutable por fases es
> [`PROMPT_HOME_CATALOGO_FASES.md`](./PROMPT_HOME_CATALOGO_FASES.md). Este
> documento queda como **diseño de referencia** (decisiones y alternativas
> descartadas).
>
> Este documento es un **prompt ejecutable** para un agente de código que trabaja
> en el monorepo **UPBUY**. Está escrito como instrucciones: contexto, decisiones
> ya tomadas, plan por fases y criterios de aceptación.
>
> Úsalo tal cual: contiene las rutas exactas que hay que tocar, el contrato de
> API que hay que respectar y las reglas del repo (`AGENTS.md`, `Front/AGENTS.md`).

---

## 0. Rol y reglas de trabajo

Eres un agente de código del monorepo **UPBUY** (`Back/` = Node 22 + Express 4 +
Sequelize 6 + PostgreSQL, CommonJS; `Front/` = Next.js 16 App Router + React 19 +
TypeScript + Tailwind v4). Trabaja en los dos paquetes, cada uno con su propio
`package.json` y sus propios comandos.

Antes de tocar nada, lee:

- `AGENTS.md` (raíz) — reglas del monorepo.
- `Front/AGENTS.md` — reglas del frontend (Kokonut UI, design system, Next.js 16).

Reglas que no se negocian:

- La marca es **UPBUY**. Nada de marcas personales ni de proyectos anteriores.
- **Todos los textos de UI en español.** Comentarios y documentación en español,
  y en ASCII plano cuando el archivo ya los evita (así escribe el backend).
- El backend usa `Utils/logger.js`; **nada de `console.log`**.
- El backend es la **fuente de verdad**: nada de lógica de negocio en el front,
  nada de precios/stock calculados en el navegador.
- Capas del backend: `Rutas/` → `Controllers/` → `Services/` → `DataBase/models/`.
  Errores con `Utils/HttpError.js` + `Middlewares/errors.js`.
- En producción **no** se ejecuta `sequelize.sync()`: el esquema lo aplican
  `ensureBaseSchema`, `ensureCatalogSchema` y `ensureDropshippingSchema`, que son
  **idempotentes**.
- Toda llamada HTTP del front pasa por `Front/src/services/api/client.ts`
  (`apiFetch` para lecturas públicas, `apiSend` para mutaciones con sesión).
- Accesibilidad: contraste ≥ 4.5:1, `alt` en imágenes, focus visible,
  `aria-label` en botones de solo icono, touch targets ≥ 44×44px,
  `prefers-reduced-motion` respetado.
- No hay lint en `Front/`: la verificación es `npm run typecheck` + `npm run build`.

---

## 1. Objetivo

1. **Eliminar el mock data del frontend**: la Home debe mostrar **únicamente
   productos reales** publicados en el backend (`GET /api/products`), nunca datos
   de prueba. Si el backend no responde, la Home se renderiza **vacía** (con un
   estado honesto), nunca con productos inventados.
2. **Definir cómo se asignan los productos a las tres secciones de la Home**,
   con **4 productos por sección**:

   | Sección | Antetítulo / titular | Fuente de la asignación |
   |---|---|---|
   | Selección | «Selección» / «Productos destacados» | Curaduría del admin (`destacadas` + posición manual) |
   | Novedades | «Novedades» / «Nueva temporada. Nueva energía.» | Curaduría del admin + automático por fecha de publicación |
   | Los favoritos de la comunidad | «Los favoritos de la comunidad» / «Las piezas que más se repiten» | **Automático por unidades vendidas** (últimos 90 días) + pines del admin |

3. Dejar la curaduría operable desde el panel `/admin/catalogo` y documentada en
   `Back/README.md` y `Front/docs/BACKEND_INTEGRATION.md`.

---

## 2. Contexto verificado del repo (léelo antes de decidir nada)

### 2.1 Dónde vive hoy el mock

`Front/src/lib/mock-data.ts` exporta `PRODUCTS` (8 productos falsos), `CATEGORIES`
(4 categorías falsas), los tipos `Product` / `Category` y los helpers
`getFeaturedProducts()`, `getNewArrivals()`, `getRelatedProducts()`.

Sus consumidores reales:

| Archivo | Qué usa del mock |
|---|---|
| `Front/src/app/(store)/page.tsx` | `CATEGORIES`, `PRODUCTS`, `getFeaturedProducts()`, `getNewArrivals()` |
| `Front/src/components/home/Hero.tsx` | tipo `Product` (prop `featured`) |
| `Front/src/components/home/FeaturedProducts.tsx` | tipo `Product` |
| `Front/src/components/home/NewArrivals.tsx` | tipo `Product` |
| `Front/src/components/home/Favorites.tsx` | tipo `Product` |
| `Front/src/components/home/Categories.tsx` | tipo `Category` |
| `Front/src/app/sitemap.ts` | `PRODUCTS` (URLs de producto del sitemap) |

`Front/src/components/products/ProductCard.tsx` **ya** usa el tipo correcto
(`ProductCardData` de `Front/src/types/catalog.ts`), no el del mock. La Home es
la única que quedó atrás.

`Front/src/app/(store)/productos/page.tsx` ya consume el backend y tiene su
propio mapper local `toCardData(product: PublicProduct)`: **ese mapper se
extrae a un módulo compartido** (paso 5.4).

### 2.2 Estado del backend

- Catálogo: tabla `products` (`Back/DataBase/models/Product.js`). Campos
  relevantes ya existentes: `sku`, `slug`, `name`, `description`, `images`
  (JSONB), `price`, `compareAtPrice`, `descuentoPorcentaje`, `stock`, `active`,
  `status` (`draft|active|archived`), `sizes` (JSONB), `combo`, `destacadas`
  (BOOLEAN), `publishedAt`, `createdAt`, `manualOverrides` (JSONB).
  **No existe** ningún campo para «nuevo» ni para «favoritos».
- Lectura pública: `Back/Services/catalog/catalogQuery.service.js`
  (`publicShape`, `listPublished`, `getBySlugOrSku`). `publicShape` **no**
  expone `cost` ni `markup`.
- Rutas públicas: `Back/Rutas/products.js` → `GET /api/products?q=&category=&featured=&limit=&offset=`
  y `GET /api/products/:slug`. Controller: `Back/Controllers/catalog.controller.js`.
- Rutas admin: `Back/Rutas/adminProducts.js` → `GET /api/admin/products`,
  `GET /api/admin/products/:id`, `PATCH /api/admin/products/:id`,
  `POST /api/admin/products/:id/visibility`, `POST /api/admin/products/bulk`,
  `PUT /api/admin/products/:id/images`, `POST /api/admin/products/:id/images/restore`.
- Campos editables por el admin (`EDITABLE` en `catalogQuery.service.js`):
  `price`, `compareAtPrice`, `name`, `description`, `active`, `status`,
  `destacadas`, `stock`, `descuentoPorcentaje`, `slug`, `categoryIds`.
- Órdenes del admin: `Back/DataBase/models/OrderItem.js`
  (`productId`, `quantity`, `productType`) y `Back/DataBase/models/Order.js`
  (`fulfillmentStatus`, `paymentState`, `createdAt`).
- Vocabulario canónico (`Back/DataBase/models/enums.js`): `FULFILLMENT_STATUS`
  (`pending_payment|paid|packing|shipped|delivered|cancelled`),
  `PAYMENT_STATE` (`unpaid|pending_collection|collected|settled|refunded`),
  `PRODUCT_STATUS` (`draft|active|archived`), `PRODUCT_BULK_ACTION`.
- El panel ya tiene una acción en lote `feature` (`PRODUCT_BULK_ACTION.FEATURE`)
  que ya marca `destacadas`.
- Panel admin (front): `Front/src/app/admin/catalogo/page.tsx`,
  `Front/src/components/admin/catalog/{CatalogPanel,ProductDrawer,CatalogBadges}.tsx`.
  Lecturas por `Front/src/services/admin/catalog.ts` (`serverFetch`, corre en el
  servidor), mutaciones por `Front/src/services/admin/catalog.actions.ts`
  (`apiSend`, corre en el cliente).

### 2.3 Contrato público actual

`GET /api/products` → `{ products: PublicProduct[], total, limit, offset }`.
`PublicProduct` (tipado en `Front/src/types/catalog.ts`): `id`, `sku`, `slug`,
`name`, `description`, `images`, `price`, `priceBase`, `compareAtPrice`,
`discountPercent`, `currency`, `stock`, `available`, `sizes`, `combo`,
`featured`, `categories[]`, `createdAt`.

---

## 3. Decisión de diseño (ya tomada — no la cambies sin justificar)

### 3.1 Modelo: curaduría explícita + relleno automático

Un único mecanismo para las tres secciones, con dos fuentes:

1. **Curaduría del admin** — tabla nueva `product_home_sections`:
   un producto puede estar en varias secciones, con posición explícita.
2. **Relleno automático** — cuando a una sección le faltan productos (para
   llegar a 4), entra el producto mejor posicionado según la regla de esa
   sección. Los productos curados **siempre ganan**: el automático solo rellena
   huecos y nunca pisa lo que el admin puso.

Algoritmo por sección (idéntico para las tres):

```
candidatos = curados (posición 1..4, solo productos publicados y visibles)
            + automáticos (regla de la sección, excluyendo los ya curados)
sección    = primeros 4 candidatos
```

Regla automática de cada sección:

| Sección | Regla automática |
|---|---|
| `seleccion` | `destacadas = true` primero; después `createdAt DESC` |
| `novedades` | `publishedAt` (o `createdAt`) dentro de los últimos **30 días**, orden descendente; después los más recientes en general |
| `favoritos` | **unidades vendidas** en los últimos **90 días** (pedidos no cancelados), orden descendente; desempate: `destacadas` y `createdAt DESC` |

Constantes (en el servicio, no literales sueltos):
`HOME_SECTION_SIZE = 4`, `NEW_ARRIVAL_WINDOW_DAYS = 30`,
`COMMUNITY_FAVORITES_WINDOW_DAYS = 90`.

**Por qué esta mezcla:** la sección «favoritos de la comunidad» promete *datos*
(«las piezas que más se repiten»): tiene que salirse de las ventas reales, no de
un flag del admin. Las otras dos son decisiones de marca: las cura la persona.
La curaduría manual por posiciones gana siempre, así que el admin puede
corregir el ranking cuando quiera.

### 3.2 Esquema de la tabla nueva

`Back/DataBase/ensureCatalogSchema.js` (idempotente, como el resto):

```sql
CREATE TABLE IF NOT EXISTS product_home_sections (
  id         UUID PRIMARY KEY,
  "productId" UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  section    VARCHAR(20) NOT NULL
             CHECK (section IN ('seleccion','novedades','favoritos')),
  position   SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 4),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_home_sections_product_section_uidx
  ON product_home_sections ("productId", section);
CREATE INDEX IF NOT EXISTS product_home_sections_section_position_idx
  ON product_home_sections (section, position);
```

Además, en `getSchemaState()` agrega el chequeo
`to_regclass('public.product_home_sections') IS NOT NULL AS "hasHomeSections"` y
actívalo en `needsMigration()` — **el “camino rápido” (una sola consulta de
lectura) debe incluir el chequeo nuevo**, o la tabla nunca se creará en una base
que ya tiene todo lo demás.

### 3.3 Contratos de API nuevos

**Público — `GET /api/home`** (una sola llamada para toda la Home):

```json
{
  "sections": {
    "featured":          [PublicProduct...],  // <= 4
    "newArrivals":       [PublicProduct...],  // <= 4
    "communityFavorites":[PublicProduct...],  // <= 4
  },
  "categories": [ { "id": "...", "name": "...", "slug": "...", "description": null } ]
}
```

Cada `PublicProduct` de la respuesta incluye dos campos extra:

- `badge`: `"bestseller" | "nuevo" | null` — `"bestseller"` si el producto está
  en la sección de favoritos, `"nuevo"` si está en novedades, `null` en selección.
- `categoryLabel`: nombre de la primera categoría (`string | null`).

Reglas del endpoint:

- Solo entra producto **publicado**: `status = 'active'` AND `active = true`.
- El stock 0 **no** oculta el producto: sale con `available: false` (la UI
  muestra «Agotado»). Solo se oculta lo que el proveedor deja de ofrecer.
- `cost` y `markup` **nunca** se exponen.
- Si una sección queda vacía, se devuelve `[]` (el front decide qué pintar).
- Sin caché agresiva: el front lo pide con `revalidate: 60`.

**Admin — endpoints de curaduría:**

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| GET | `/api/admin/products/home-sections` | — | `{ featured: [...], newArrivals: [...], communityFavorites: [...], ranking: [...] }` |
| PUT | `/api/admin/products/home-sections/:section` | `{ "productIds": ["uuid", ...] }` | `{ section, productIds }` |

- `:section` ∈ `seleccion | novedades | favoritos`; si no, **400**.
- `productIds` **máximo 4**; si excede, **422** con mensaje en español.
- El **orden del arreglo es el orden en la Home** (`position` = índice + 1).
- Un id inexistente o de un producto no publicado → **422**.
- `PUT` **reemplaza** la sección completa (idempotente: se borra lo anterior y
  se inserta lo nuevo en una transacción).
- `GET` devuelve, por sección, los productos curados **con su `unitsSold`** y, en
  `ranking`, el top 20 automático de la sección de favoritos con `unitsSold`,
  para que el panel pueda ofrecer «usar el ranking» y **pines** manuales.

**Admin — reutiliza la acción en lote existente:** agrega
`PRODUCT_BULK_ACTION.ASSIGN_HOME_SECTION = "assign_home_section"` con
`payload: { section, productIds? }`? **No**: mantén la curaduría de la Home en
los endpoints dedicados de arriba (más simple de razonar) y **no** metas la
Home dentro del `bulk` existente. Si más adelante hace falta, se agrega como
acción nueva con su propio `CHECK` en la base.

**Catálogo público — filtros nuevos (para los CTA «ver todos»):**

`GET /api/products` acepta además:

- `new=1` → solo novedades (mismo criterio automático que la sección).
- `sort=best_sellers` → orden por unidades vendidas (90 días).

Los CTA de la Home pasan a apuntar a:

| Sección | CTA | URL |
|---|---|---|
| Selección | (no lo tiene hoy) | `/productos?destacados=1` |
| Novedades | «Ver todas las novedades» | `/productos?nuevos=1` |
| Favoritos | «Ver todos los productos» | `/productos?mas_vendidos=1` |

### 3.4 Alternativas descartadas (y por qué)

| Alternativa | Por qué no |
|---|---|
| Columnas booleanas `es_nuevo` / `es_favorito` en `products` | No Allows(position) ni «top 4»; con 3 booleanos no se controla el **orden** de la sección, que es lo que hace que la Home se vea curada. |
| Guardar el orden con `sortOrder` numérico en `products` | Un producto necesita **varias** posiciones (puede estar en selección y en novedades) y un solo número no lo permite. |
| Calcular «favoritos» solo con un flag del admin | El copy de la sección («las piezas que más se repiten») promete un dato de ventas; un flag manual es una opinión, no una métrica. |
| Consumir `/api/products?featured=1` tres veces desde el front | Tres llamadas, tres cachés y tres momentos de inconsistencia; la Home debe ser coherente en un solo render. |
| Dejar el mock como fallback cuando la API falla | Un fallback de datos falsos en producción es indistinguible de un bug y esconde outages del backend. |

---

## 4. Plan — Backend (`Back/`)

### 4.1 Modelo y asociación

- Nuevo `Back/DataBase/models/ProductHomeSection.js` (Sequelize, `tableName:
  "product_home_sections"`, `id` UUID con `uuidv4`, `productId`, `section`
  (`STRING(20)` con `validate.isIn`), `position` (`SMALLINT`, `validate.min 1`,
  `validate.max 4`), `timestamps: true`).
- Exportarlo en `Back/DataBase/models/index.js`.
- Asociación en `Back/DataBase/models/associations.js`:
  `Product.hasMany(ProductHomeSection, { as: "homeSections", onDelete: "CASCADE" })`
  y `ProductHomeSection.belongsTo(Product, { as: "product", foreignKey: "productId" })`.
- Enums nuevos en `Back/DataBase/models/enums.js`:

```js
const HOME_SECTION = {
  FEATURED: "seleccion",
  NEW_ARRIVALS: "novedades",
  FAVORITES: "favoritos",
};
const HOME_SECTION_VALUES = Object.values(HOME_SECTION);
```

### 4.2 Migración idempotente

- `Back/DataBase/ensureCatalogSchema.js`: DDL de la tabla + índices
  (ver §3.2), chequeo en `getSchemaState()` y en `needsMigration()`.
- Nuevo script de verificación al estilo de
  `Back/scripts/verifySupplierCatalogMigration.js`:
  `Back/scripts/verifyHomeSectionsMigration.js` que corra la migración **dos
  veces** y compruebe que la segunda es un no-op (idempotencia) y que los
  índices existen.

### 4.3 Servicio de la Home

Nuevo `Back/Services/catalog/home.service.js`:

```js
const HOME_SECTION_SIZE = 4;
const NEW_ARRIVAL_WINDOW_DAYS = 30;
const COMMUNITY_FAVORITES_WINDOW_DAYS = 90;

getHomePayload() -> { sections: { featured, newArrivals, communityFavorites }, categories }
getAdminHomeSections() -> { featured, newArrivals, communityFavorites, ranking }
replaceSection(section, productIds) -> { section, productIds }
```

Responsabilidades:

1. Leer lo curado de `product_home_sections` (con `include` del producto y
   sus categorías), respetando `position`.
2. Calcular el ranking de favoritos con **una sola** consulta agregada (sin
   N+1):

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

   (`since` = ahora − 90 días). Filtra luego los que no estén publicados.
3. Rellenar cada sección hasta 4 con su regla automática.
4. Devolver cada producto con la **misma forma pública** que
   `catalogQuery.service.js → publicShape` (reutiliza esa función; no
   duplices el shape ni expongas `cost`/`markup`) más `badge` y `categoryLabel`.
5. **Un producto puede aparecer en varias secciones** (es válido): el badge
   depende de la sección en la que se está mostrando.

### 4.4 Rutas y controllers

- Nueva `Back/Rutas/home.js`: `router.get("/", home)` → se monta en
  `Back/index.js` como `app.use("/api/home", homeRoutes)`.
- `Back/Controllers/catalog.controller.js` (o un `home.controller.js` nuevo):
  `home` (público), `homeSections` (admin GET), `replaceHomeSection`
  (admin PUT).
- `Back/Rutas/adminProducts.js`:
  - `GET /home-sections` **antes** de `/:id` (las rutas fijas van primero).
  - `PUT /home-sections/:section`.
  - Ambos con `requirePermission("catalog.write")`; el PUT no necesita step-up
    (no despublica nada).

### 4.5 Extensión de `GET /api/products`

- `new=1` y `sort=best_sellers` en `listPublished` (`catalogQuery.service.js`) +
  en el controller + en `Front/src/services/catalog/index.ts` (parámetros de
  `CatalogQuery`).
- `sort=best_sellers` reordena por `unitsSold` (usa la misma agregación de
  §4.3; si no hay datos, cae al orden actual: `destacadas DESC, createdAt DESC`).

### 4.6 Tests del backend

Nuevo `Back/test/catalog.home.test.js` (patrón de `Back/test/catalog.admin.test.js`:
se salta solo si no hay base de datos):

- Una sección nunca devuelve más de 4 productos.
- La posición manual define el orden.
- Lo curado gana al automático (un producto curado en posición 1 no se
  desplaza aunque el ranking automático lo pone peor).
- Un producto no publicado (`status != active` o `active = false`) no aparece en
  ninguna sección.
- El ranking de favoritos ordena por unidades vendidas y excluye pedidos
  cancelados.
- `replaceSection` con 5 ids → 422; con un id inexistente → 422; con un id
  repetido → 422 (o se deduplica: **elige una y aplícala en el test**).
- `GET /api/products?new=1` y `?sort=best_sellers` responden 200 con el filtro
  aplicado.

---

## 5. Plan — Front (`Front/`)

### 5.1 Fuera el mock

- **Borra `Front/src/lib/mock-data.ts`.**
- Mueve lo que haga falta a `Front/src/types/catalog.ts`:
  - `export type ProductBadge = "bestseller" | "nuevo" | null;`
  - `export type HomeSectionKey = "featured" | "newArrivals" | "communityFavorites";`
  - `export type HomePayload = { sections: Record<HomeSectionKey, PublicProduct[]>; categories: Category[] };`
  - `PublicProduct` gana `badge?: ProductBadge | null;` y
    `categoryLabel?: string | null;`.
- El tipo `Category` que usan los componentes de la Home: el de
  `types/catalog.ts` (`description: string | null`). Actualiza `Categories.tsx`
  para tolerar `description` nulo (texto por defecto en español).

### 5.2 Mapper compartido

Nuevo `Front/src/services/catalog/mappers.ts`:

```ts
export function toCardData(
  product: PublicProduct,
  badge?: ProductBadge | null,
): ProductCardData
```

- Reemplaza el `toCardData` local de `Front/src/app/(store)/productos/page.tsx`
  (se importa desde ahí; **no** se duplica).
- Reglas: `compareAtPrice` = `product.compareAtPrice` si es mayor que `price`,
  si no `priceBase` si es mayor que `price`, si no `null`;
  `categoryLabel` = `product.categories[0]?.name ?? null`;
  `image` = `getCoverImage(product)`; `available` = `product.available`;
  `badge` = el de la sección (o `product.badge`).

### 5.3 Lectura de la Home

Nuevo `Front/src/services/catalog/home.ts`:

```ts
export async function getHomePayload(): Promise<HomePayload>
// apiFetch<HomePayload>("/api/home", { revalidate: 60 })
```

### 5.4 Página principal

`Front/src/app/(store)/page.tsx` pasa a ser un **Server Component async**:

- `export const revalidate = 60;`
- `const [homeResult, categoriesResult] = await Promise.allSettled([getHomePayload(), listCategories()])`.
- Si la API falla: **no hay mock**. La Home renderiza las secciones editoriales
  (Hero, BenefitsTicker, BrandBanner, BrandPillars, Newsletter) y, en lugar de
  las rejillas de productos, un estado vacío honesto en español
  («Todavía no hay productos publicados» / «No pudimos cargar el catálogo»)
  con enlace a `/productos`. **Nunca inventes productos.**
- Secciones de producto:
  - `Hero` ← `sections.featured[0]` (o `null`).
  - `FeaturedProducts` ← `sections.featured`.
  - `NewArrivals` ← `sections.newArrivals`.
  - `Favorites` ← `sections.communityFavorites`.
  - `Categories` ← `categories` (de `listCategories()`).

### 5.5 Componentes de la Home

- `Hero.tsx`: prop `featured: ProductCardData | null` (tipo `ProductCardData`
  de `types/catalog`). Si es `null`, **no** renderiza la tarjeta superpuesta
  (deja la imagen editorial sola). Sigue usando `<GlitchText />`.
- `FeaturedProducts.tsx`, `NewArrivals.tsx`, `Favorites.tsx`: prop
  `products: ProductCardData[]`; importan el tipo de `@/types/catalog` (nada de
  `@/lib/mock-data`). Si `products.length === 0`, la sección **no se renderiza**
  (devuelve `null`), para no dejar un grid vacío.
- `Categories.tsx`: `Category` de `@/types/catalog`; `description` nulo →
  texto por defecto.
- CTAs: «Ver todas las novedades» → `/productos?nuevos=1`;
  «Ver todos los productos» (favoritos) → `/productos?mas_vendidos=1`.

### 5.6 Catálogo y sitemap

- `Front/src/app/(store)/productos/page.tsx`:
  - usa `toCardData` del mapper compartido;
  - acepta `?nuevos=1` y `?mas_vendidos=1` y los traduce a `new` / `sort` en la
    llamada al backend; los conserva al paginar y al filtrar por categoría.
- `Front/src/app/sitemap.ts`: deja de importar el mock. Pide productos reales
  (`listProducts({ limit: 100 })`) dentro de un `try/catch`; si la API falla,
  el sitemap devuelve **solo** las rutas estáticas (nunca URLs de productos
  inventados).

### 5.7 Página de detalle (ya está fuera del mock)

`Front/src/app/(store)/producto/[slug]/page.tsx` ya consume la API: los
**relacionados** salen de `listProducts({ category })` filtrando el producto
actual (verificado). Solo dos ajustes aquí:

- que use el **mapper compartido** (§5.2) en lugar de su propio mapeo, para que
  el badge y el `categoryLabel` sean consistentes en toda la tienda;
- que `getRelatedProducts` deje de existir en el mock sin ser reemplazado por
  un helper local: si hace falta un helper, va en
  `Front/src/services/catalog/mappers.ts`.

---

## 6. Plan — Panel de administración (`Front/src/app/admin/catalogo/`)

Objetivo: que el admin pueda curar las tres secciones sin tocar SQL.

- **Lectura**: `Front/src/services/admin/catalog.ts` →
  `getAdminHomeSections(): Promise<AdminHomeSections>` (usa `serverFetch`).
- **Mutación**: `Front/src/services/admin/catalog.actions.ts` →
  `saveAdminHomeSection(section, productIds)` (usa `apiSend`, `PUT`).
- **Tipos**: `Front/src/types/admin.ts` → `AdminHomeSection`, `AdminHomeSections`,
  `AdminHomeSlot` (`{ productId, name, sku, position, unitsSold, image? }`).
- **UI** (en `admin/catalogo/page.tsx` + un componente nuevo
  `Front/src/components/admin/catalog/HomeSectionsPanel.tsx`):
  - tres columnas (Selección / Novedades / Favoritos);
  - cada una con 4 ranuras ordenadas, con **mover arriba/abajo** y **quitar**;
  - buscador de productos publicados para añadir (reusa el listado admin
    existente);
  - en Favoritos, mostrar el **ranking automático con unidades vendidas** y un
  botón «Usar el ranking» que rellena los huecos;
  - botón «Guardar sección» → `PUT` con el orden visible;
  - mensajes de error del backend en español (422 → «Máximo 4 productos por
    sección»).
- **Badge en el panel**: `CatalogBadges.tsx` puede mostrar en qué secciones está
  cada producto (usa `home-sections` del backend).

---

## 7. Criterios de aceptación (Definition of Done)

- [ ] `Front/src/lib/mock-data.ts` **no existe** y `rg -n "mock-data" Front/src` no devuelve nada.
- [ ] La Home muestra **solo** productos devueltos por `GET /api/home`; con la API caída se ve un estado vacío honesto, **no** productos de prueba.
- [ ] Cada sección de producto muestra **como máximo 4** tarjetas y **nunca** una rejilla vacía.
- [ ] Las tres secciones se llenan con productos **publicados** (`status=active`, `active=true`); un producto oculto no aparece.
- [ ] El orden de cada sección es el curado por el admin; lo curado no se desplaza por el ranking automático.
- [ ] «Los favoritos de la comunidad» se ordena por unidades vendidas reales (pedidos no cancelados, 90 días).
- [ ] Los badges de tarjeta son correctos: «Más vendido» en favoritos, «Nuevo» en novedades.
- [ ] El CTA de novedades y el de favoritos llevan a listados que funcionan (`?nuevos=1`, `?mas_vendidos=1`).
- [ ] El panel permite guardar las tres secciones y el cambio se ve en la Home en ≤ 60 s.
- [ ] El `sitemap.xml` solo contiene URLs de productos reales.
- [ ] `cd Back && npm test` pasa (incluye el test nuevo de la Home).
- [ ] `cd Front && npm run typecheck && npm run build` pasa.
- [ ] `Back/README.md` y `Front/docs/BACKEND_INTEGRATION.md` actualizados con los endpoints nuevos y el contrato de la Home.

---

## 8. Verificación

```bash
# Backend
cd Back
npm test
npm run db:check          # estado del esquema
node scripts/verifyHomeSectionsMigration.js   # idempotencia de la migración

# Frontend
cd Front
npm run typecheck
npm run build

# Comprobación manual del contrato
curl "http://localhost:3000/api/home" | jq '.sections | map_values(length)'
curl "http://localhost:3000/api/products?new=1&limit=4" | jq '.total'
curl "http://localhost:3000/api/products?sort=best_sellers&limit=4" | jq '.products[].name'
```

---

## 9. Documentación a actualizar

- `Back/README.md`: sección de endpoints (`GET /api/home`, admin `home-sections`)
  y nota del esquema (`product_home_sections`).
- `Front/docs/BACKEND_INTEGRATION.md`: §1 (endpoints), §2 (contrato del
  producto: `badge`, `categoryLabel`) y §3 (estado «Catálogo en la Home»).
- `AGENTS.md` (raíz): si el modelo de curaduría pasa a ser una regla del
  proyecto, añadirlo a la sección de esquema/proveedores (una línea por regla).
- `Back/docs/PROVEEDORES.md`: solo si la sincronización de proveedor empieza a
  marcar `novedades` automáticamente (ver §10).

---

## 10. Decisiones pendientes (resuélvelas explícitamente, no por omisión)

1. **Automatización de «novedades».** ¿La sincronización de proveedor marca
   `publishedAt` al publicar (para que la ventana de 30 días sea real)? Revisa
   `Back/Services/catalog/catalogSync.service.js` y `catalogImport.service.js`:
   si `publishedAt` no se setea, **setéalo** al publicar el producto (es un
   dato interno, no expuesto). Sin esto, la sección de novedades se llenaría
   con los productos más antiguos de la base.
2. **Stock 0 en la Home.** Decisión recomendada: **sí aparece** (con «Agotado»),
   igual que en `/productos`. Alternativa: ocultarlo en la Home y mostrar en su
   lugar el siguiente del ranking. Si eliges ocultar, documéntalo y aplícalo
   solo en la Home (no en el catálogo), para que las dos vistas no se
   contradigan.
3. **Cache y actualización inmediata.** Por defecto, ISR de 60 s
   (`revalidate: 60`). Si el admin exige que el cambio se vea al instante,
   añade en `Front` una Route Handler `POST /api/revalidate` protegida por un
   secreto en variable de entorno (`REVALIDATE_SECRET`) que llame
   `revalidatePath("/")`, y llámala desde el panel tras guardar. **Nunca**
   expongas el secreto en el cliente.
4. **Un mismo producto en varias secciones.** Permitido por defecto (el badge
   cambia según la sección). Si prefieres excluirlo, añade la exclusión en el
   servicio y documéntala.
5. **`GET /api/home` vs. filtrar `/api/products` tres veces.** Se elige
   `/api/home` (una llamada, una coherencia). Si más adelante el catálogo
   público necesita más secciones, el servicio ya está donde debe crecer.

---

## 11. Lo que NO debes hacer

- No reintroducir datos de ejemplo en el front para «que se vea algo»: si no
  hay catálogo, la Home dice que no hay catálogo.
- No exponer `cost`, `markup`, `providerSku`, `manualOverrides` ni datos del
  proveedor en las respuestas públicas.
- No meter reglas de negocio (orden de secciones, ranking, capacidad de 4) en
  componentes del front: eso vive en `Back/Services/catalog/home.service.js`.
- No ejecutar `sequelize.sync()` ni escribir DDL fuera de
  `ensureCatalogSchema.js`.
- No cambiar la numeración de pedidos, la cookie de sesión ni los estados
  canónicos de orden.
- No tocar el diseño (tokens, tipografías, grid 2/3/4, `lucide-react`, sin
  emoji como icono). Los cambios son de **datos**, no de estilo.
- No instalar componentes nuevos de Kokonut UI si no hace falta; si hace falta,
  usa la CLI de shadcn (`npx shadcn@latest add @kokonutui/<name>`), nunca pegar
  código a mano.
