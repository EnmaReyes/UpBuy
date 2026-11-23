# PROMPT — Crear y gestionar artículos manualmente en el panel de administración de UPBUY

**Objetivo:** Agregar una sección completa en el dashboard para **administrador** y **superadministrador** que permita crear artículos (productos) manualmente y gestionarlos igual que los productos de proveedores, con un campo extra para asignar el proveedor de origen. Todo usando componentes de Kokonut UI (incluido el botón Particle Button) y siguiendo las buenas prácticas de la skill `nodejs-backend-patterns`.

---

## 0. Contexto y reglas del proyecto (leer primero)

### Repositorio: UPBUY (monorepo, dos paquetes independientes)

| Carpeta | Stack | Entry |
|---------|-------|-------|
| `Back/` | Node 22 + Express 4 + Sequelize 6 + PostgreSQL, **CommonJS** | `Back/index.js` |
| `Front/` | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 | `Front/src/app` |

**Corre los comandos `npm` desde dentro de cada carpeta.** No hay `package.json` raíz ni workspaces.

### Reglas de marca (AGENTS.md raíz)
- La marca es **UPBUY**. Nada de nombres de terceros, marcas personales ni proyectos previos en identificadores, clases CSS, variables, textos o comentarios.
- Textos de UI **en español**. Sin copy comercial en inglés.
- Iconografía: `lucide-react`. **Nada de emoji como icono.**
- Accesibilidad: contraste ≥ 4.5:1, `aria-label` en botones de solo icono, touch targets ≥ 44×44px, `prefers-reduced-motion`.
- No uses `console.log` en el backend: usa `Utils/logger.js`.
- Comentarios y documentación en español, sin tildes en el código backend (ASCII plano).
- Si agregas un endpoint, actualiza `Back/README.md` y `Front/docs/BACKEND_INTEGRATION.md`.

### Reglas del frontend (Front/AGENTS.md)
- Todos los textos de UI en español.
- Instala componentes Kokonut UI con la CLI de shadcn: `npx shadcn@latest add @kokonutui/<name>`. Nunca pegues código a mano; los componentes instalados son código del proyecto.
- Kokonut UI registry: `@kokonutui`. Documentación: https://kokonutui.com/llms.txt y https://kokonutui.com/docs/buttons/particle-button.md
- Toda llamada HTTP pasa por `Front/src/services/api/client.ts`:
  - `apiFetch` → lecturas públicas (sin cookies).
  - `apiSend` → peticiones con sesión (`credentials: "include"`, cabecera `X-Upbuy-CSRF: 1`).
  - `apiGet` → lecturas con sesión (GET).
- Los tipos viven en `Front/src/types/`.
- El panel admin vive en `Front/src/app/admin/` y usa la misma cookie `access_token`.

### Capas del backend (AGENTS.md raíz)
```
Rutas/ -> Controllers/ -> Services/ -> DataBase/models/
```
- Rutas: solo validan y delegan.
- Controllers: HTTP delgado (`req`/`res`).
- Servicios: lógica de negocio.
- DataBase/models: acceso a datos.
- No metas reglas de negocio en un controller.
- `Back/Utils/HttpError.js` + `Middlewares/errors.js` son la forma oficial de responder errores. Helpers de respuesta en `Utils/respond.js`.

### Middleware de sesión (Back/Middleware/auth.js)
- `requireAuth` — verifica JWT de la cookie.
- `requireAdminSession` — verifica rol de administrador y sesión revocable.
- `requirePermission(...)` — exige uno o varios permisos (después de `requireAdminSession`).
- Permiso relevante: `"catalog.write"`.

---

## 1. Analisis del backend existente (estado actual)

### Endpoints existentes para productos admin (`Back/Rutas/adminProducts.js`, montados en `/api/admin/products`)

| Método | Ruta | Controller | Servicio | Descripción |
|--------|------|------------|----------|-------------|
| GET | `/` | `listAdmin` | `catalog.listAdmin` | Listar productos (admin) |
| GET | `/unpublished` | `listUnpublished` | `catalog.listUnpublished` | Bandeja de productos sin publicar |
| GET | `/:id` | `detailAdmin` | `catalog.getAdmin` | Detalle de un producto |
| PATCH | `/:id` | `update` | `catalog.updateProduct` | Editar producto existente |
| POST | `/bulk` | `bulk` | `catalogAdmin.bulk` | Acciones en lote |
| POST | `/:id/visibility` | `visibility` | `catalogAdmin.setVisibility` | Cambiar visibilidad |
| PUT | `/:id/images` | `setImages` | `catalogAdmin.setImages` | Actualizar imágenes |
| POST | `/:id/images/restore` | `restoreImages` | `catalogAdmin.restoreImages` | Restaurar imágenes del proveedor |

### GAP IDENTIFICADO
No existe **POST `/api/admin/products`** para **crear un producto manualmente**. Ese es el endpoint que falta.

### Modelo Producto (`Back/DataBase/models/Product.js`)
Ya soporta todo lo necesario para creación manual:
- `id` (UUID, PK)
- `sku` (STRING, unique, obligatorio)
- `slug` (STRING, unique, opcional)
- `name` (STRING, obligatorio)
- `description` (TEXT)
- `images` (JSONB, default `[]`)
- `cost` (INTEGER, default 0)
- `markup` (INTEGER, default 30)
- `price` (INTEGER, default 0) — precio de venta al público
- `compareAtPrice` (INTEGER, opcional)
- `currency` (CHAR(3), default 'COP')
- `stock` (INTEGER, default 0)
- `active` (BOOLEAN, default true)
- `status` (STRING, default 'draft', valores: draft|active|archived)
- `provider` (STRING, default 'manual') — origen del producto
- `providerSku` (STRING, opcional)
- `sizes` (JSONB, default `[]`)
- `destacadas` (BOOLEAN, default false)
- `combo` (BOOLEAN, default false)
- `descuentoPorcentaje` (INTEGER, opcional, 0-100)
- `manualOverrides` (JSONB, default `{}`)
- `publishedAt` (DATE, opcional)
- `uid` (UUID, FK a usuarios)
- `supplierId` (UUID, FK a suppliers) — proveedor asignado
- `supplierProductId` (UUID, FK a supplier_products)

### Modelo Supplier (`Back/DataBase/models/Supplier.js`)
- `id`, `name`, `slug`, `isActive`, `baseUrl`, `publishPolicy`, `defaultCategoryId`

### Enums relevantes (`Back/DataBase/models/enums.js`)
- `PRODUCT_STATUS`: DRAFT="draft", ACTIVE="active", ARCHIVED="archived"
- `PRODUCT_PROVIDER`: MANUAL="manual", VENNDELO="venndelo", DROPI="dropi", MASTERSHOP="mastershop", etc.
- `PRODUCT_BULK_ACTION`: MAKE_VISIBLE, HIDE, ARCHIVE, RESTORE_DRAFT, APPLY_MARKUP, SET_CATEGORIES, FEATURE

### Servicios existentes (`Back/Services/catalog/`)
- `catalogQuery.service.js` — `listAdmin`, `getAdmin`, `updateProduct`, `publicShape`, `listPublished`, `getBySlugOrSku`, `listUnpublished`
- `catalogAdmin.service.js` — `setVisibility`, `bulk`, `setImages`, `restoreImages`
- `catalogSync.service.js` — `rebuildProductImages`

### Controlador existente (`Back/Controllers/catalog.controller.js`)
Expone: `list`, `detail`, `listAdmin`, `listUnpublished`, `detailAdmin`, `update`, `visibility`, `bulk`, `setImages`, `restoreImages`.

### Tipos del frontend (`Front/src/types/admin.ts`)
`AdminProduct` ya incluye: `provider`, `supplierId`, `supplierProductId`, `cost`, `markup`, `compareAtPrice`, `descuentoPorcentaje`, `destacadas`, `gallery`, `categories`, etc.

### Servicios del frontend existentes
- `Front/src/services/admin/catalog.ts` — lecturas server-side (`listAdminProducts`, `getAdminProduct`, etc.)
- `Front/src/services/admin/catalog.actions.ts` — mutaciones (`updateAdminProduct`, `setAdminProductVisibility`, `bulkAdminProducts`, `setAdminProductImages`, `restoreAdminProductImages`, `createAdminCategory`, `publishSupplierTrayProducts`, `saveAdminHomeSection`)

**Falta:** `createAdminProduct` en `catalog.actions.ts`.

### Componentes del frontend existentes
- `Front/src/components/admin/catalog/CatalogPanel.tsx` — listado con edición (drawer `ProductDrawer`)
- `Front/src/components/admin/catalog/ProductDrawer.tsx` — ficha de edición de producto existente
- `Front/src/components/admin/catalog/CatalogFilters.tsx`, `CatalogPager.tsx`, `CatalogBadges.tsx`, `BulkActionsDrawer.tsx`, `ProductDrawer.tsx`

---

## 2. Prompt por fases (copia y pega en cada fase)

A continuacion tienes el prompt listo para usar, dividido en **5 fases**. Cada fase es independiente y tiene criterios de aceptación claros.

---

# FASE 1 — Backend: endpoint de creacion de producto manual

## Contexto
El backend tiene endpoints para listar, editar, ocultar y archivar productos, pero no para **crear** un producto manualmente desde el panel de administracion.

## Tarea
Crear el endpoint `POST /api/admin/products` que permita a un administrador con permiso `catalog.write` crear un producto manual (proveedor `manual` o cualquier slug de proveedor existente), con todos los campos del modelo `Product`, incluyendo el nuevo campo de asignacion de proveedor.

## Archivos a tocar / crear en `Back/`

### 1. Ruta: `Back/Rutas/adminProducts.js`
Agregar al router (después de `router.use(requireAuth, requireAdminSession)`):

```js
router.post(
  "/",
  requirePermission("catalog.write"),
  create,
);
```

Importar `create` desde `../Controllers/catalog.controller.js`.

### 2. Controlador: `Back/Controllers/catalog.controller.js`
Agregar la funcion `create`:

```js
// POST /api/admin/products  (crear producto manual)
const create = async (req, res) => {
  try {
    const body = req.body || {};
    return res.status(201).json(
      await catalogAdmin.createProduct({
        patch: body,
        uid: req.user?.id,
      }),
    );
  } catch (error) {
    return sendError(res, error, "No se pudo crear el producto");
  }
};
```

Agregar `create` al `module.exports`.

### 3. Servicio: `Back/Services/catalog/catalogAdmin.service.js`
Agregar la funcion `createProduct`. Debe:
- Validar campos obligatorios: `sku`, `name`, `price`.
- Validar que el `sku` no exista ya.
- Validar que el `slug` (si se envia) no exista ya.
- Validar que `provider` sea un valor permitido (`PRODUCT_PROVIDER_VALUES`).
- Si se envia `supplierId`, validar que el proveedor exista y este activo.
- Normalizar `slug` con la misma logica de `normalizeSlug` de `catalogQuery.service.js` (o exportar esa utilidad para reusarla).
- Establecer `status` por defecto `draft` si no se envia.
- Establecer `active` por defecto `true`.
- Establecer `provider` por defecto `"manual"`.
- Crear el producto con `Product.create({ ... })`.
- Si se envian `categoryIds`, asociar categorias con `product.setCategories()`.
- Registrar en `audit_logs` la creacion (ver patrones existentes en `Services/orderService.js` o `Back/Services/`).
- Retornar `catalogQuery.getAdmin(product.id)`.

Patron de servicio (seguir `nodejs-backend-patterns`):
- Usar `HttpError` para errores de validación (400, 409, 422).
- Usar transaccion de Sequelize para crear producto + categorias de forma atomica.
- Usar `Utils/logger.js` para logs (no `console.log`).

### 4. Esquema de base de datos
La tabla `products` ya existe con todas las columnas necesarias (`supplierId`, `provider`, etc.). No se requiere migracion nueva. Verificar que `ensureCatalogSchema.js` ya crea todo (lo hace).

### 5. Documentacion
Actualizar `Back/README.md` documentando el nuevo endpoint `POST /api/admin/products`.

## Criterios de aceptacion Fase 1
- [ ] `POST /api/admin/products` responde 201 con el producto creado.
- [ ] Requiere autenticacion de administrador (`requireAdminSession`).
- [ ] Requiere permiso `catalog.write`.
- [ ] Rechaza (400) si falta `sku`, `name` o `price`.
- [ ] Rechaza (409) si el `sku` ya existe.
- [ ] Rechaza (409) si el `slug` ya existe en otro producto.
- [ ] Rechaza (400) si `provider` no es un valor valido.
- [ ] Si se envia `supplierId`, valida que el proveedor exista y este activo.
- [ ] Crea el producto con `provider = 'manual'` por defecto.
- [ ] Logs con `Utils/logger.js`, no `console.log`.
- [ ] Pruebas: `cd Back && npm test` pasa.

---

# FASE 2 — Backend: servicio de creacion (detalles de implementacion)

## Tarea
Implementar `createProduct` en `Back/Services/catalog/catalogAdmin.service.js` con validaciones completas y transaccion.

## Detalles de implementacion

```js
const { sequelize, Product, Category, Supplier } = require("../../DataBase/models/index.js");
const { PRODUCT_STATUS, PRODUCT_PROVIDER_VALUES } = require("../../DataBase/models/enums.js");
const HttpError = require("../../Utils/HttpError.js");
const catalogQuery = require("./catalogQuery.service.js");
const { createLogger } = require("../../Utils/logger.js");

const log = createLogger("catalogAdmin");

const MAX_IMAGES = 8;

const normalizeSlug = (value) => {
  const slug = String(value || "").trim().toLowerCase();
  if (!slug || slug.length > 180 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new HttpError(400, "El slug solo admite minusculas, numeros y guiones (maximo 180)");
  }
  return slug;
};

const createProduct = async ({ patch = {}, uid } = {}) => {
  const {
    sku, name, description, slug, price, cost, markup, compareAtPrice,
    currency, stock, active, status, provider, providerSku, sizes,
    destacadas, combo, descuentoPorcentaje, images, categoryIds, supplierId,
    manualOverrides,
  } = patch;

  // Validaciones obligatorias
  if (!sku || !String(sku).trim()) throw new HttpError(400, "El SKU es obligatorio");
  if (!name || !String(name).trim()) throw new HttpError(400, "El nombre es obligatorio");
  if (price === undefined || price === null || price === "") throw new HttpError(400, "El precio es obligatorio");

  const skuClean = String(sku).trim();
  const nameClean = String(name).trim();

  // SKU unico
  const existingSku = await Product.findOne({ where: { sku: skuClean }, attributes: ["id"] });
  if (existingSku) throw new HttpError(409, "Ya existe un producto con ese SKU");

  // Slug unico (si se envia)
  let slugFinal = null;
  if (slug !== undefined && slug !== null && String(slug).trim() !== "") {
    slugFinal = normalizeSlug(String(slug));
    const existingSlug = await Product.findOne({ where: { slug: slugFinal }, attributes: ["id"] });
    if (existingSlug) throw new HttpError(409, "Ya existe un producto con ese slug");
  }

  // Proveedor valido
  const providerFinal = (provider && PRODUCT_PROVIDER_VALUES.includes(String(provider)))
    ? String(provider)
    : "manual";

  // Validar supplierId si se envia
  let supplierIdFinal = null;
  if (supplierId) {
    const supplier = await Supplier.findByPk(supplierId, { attributes: ["id", "slug", "name", "isActive"] });
    if (!supplier) throw new HttpError(400, "El proveedor asignado no existe");
    if (!supplier.isActive) throw new HttpError(400, "El proveedor asignado esta inactivo");
    supplierIdFinal = supplier.id;
  }

  // Normalizar campos numericos
  const priceFinal = Math.max(0, Math.round(Number(price) || 0));
  const costFinal = Math.max(0, Math.round(Number(cost || 0)));
  const markupFinal = Math.max(0, Math.min(1000, Math.round(Number(markup || 30))));
  const compareAtPriceFinal = compareAtPrice === null || compareAtPrice === "" || compareAtPrice === undefined
    ? null
    : Math.max(0, Math.round(Number(compareAtPrice)));
  const stockFinal = Math.max(0, Math.trunc(Number(stock || 0)));
  const descuentoFinal = descuentoPorcentaje === null || descuentoPorcentaje === "" || descuentoPorcentaje === undefined
    ? null
    : (() => { const p = Math.trunc(Number(descuentoPorcentaje)); if (!Number.isFinite(p) || p < 0 || p > 100) throw new HttpError(400, "El descuento debe estar entre 0 y 100"); return p; })();

  const statusFinal = PRODUCT_STATUS_VALUES.includes(String(status || PRODUCT_STATUS.DRAFT))
    ? String(status)
    : PRODUCT_STATUS.DRAFT;
  const activeFinal = active !== undefined ? Boolean(active) : true;

  // Validar imagenes (max 8, URLs https)
  const imagesFinal = Array.isArray(images) ? images : [];
  if (imagesFinal.length > MAX_IMAGES) throw new HttpError(400, `Maximo ${MAX_IMAGES} imagenes por producto`);
  for (const url of imagesFinal) {
    try { new URL(String(url)); if (new URL(String(url)).protocol !== "https:") throw new Error(); } catch {
      throw new HttpError(400, "Cada imagen necesita una URL valida (https)");
    }
  }

  const overrides = manualOverrides && typeof manualOverrides === "object" ? { ...manualOverrides } : {};

  let product;
  await sequelize.transaction(async (transaction) => {
    product = await Product.create({
      sku: skuClean,
      slug: slugFinal,
      name: nameClean,
      description: description ? String(description).trim() : null,
      price: priceFinal,
      cost: costFinal,
      markup: markupFinal,
      compareAtPrice: compareAtPriceFinal,
      currency: currency || "COP",
      stock: stockFinal,
      active: activeFinal,
      status: statusFinal,
      provider: providerFinal,
      providerSku: providerSku ? String(providerSku).trim() : null,
      sizes: Array.isArray(sizes) ? sizes : [],
      destacadas: Boolean(destacadas),
      combo: Boolean(combo),
      descuentoPorcentaje: descuentoFinal,
      images: imagesFinal,
      manualOverrides: overrides,
      publishedAt: (statusFinal === PRODUCT_STATUS.ACTIVE && activeFinal) ? new Date() : null,
      supplierId: supplierIdFinal,
      uid,
    }, { transaction });

    if (Array.isArray(categoryIds) && categoryIds.length > 0) {
      const found = await Category.findAll({ where: { id: categoryIds }, attributes: ["id"], transaction });
      if (found.length !== categoryIds.length) {
        throw new HttpError(400, "Algunas de las categorias no existen");
      }
      await product.setCategories(found.map((row) => row.id), { transaction });
    }
  });

  log.info("Producto creado manualmente", { productId: product.id, sku: product.sku, provider: product.provider, uid });

  return catalogQuery.getAdmin(product.id);
};

module.exports = {
  ...module.exports, // mantener exports existentes
  createProduct,
};
```

Nota: ajusta el `module.exports` al final del archivo para agregar `createProduct` sin perder los exports existentes (`setVisibility`, `bulk`, `setImages`, `restoreImages`, `MAX_IMAGES`).

## Criterios de aceptacion Fase 2
- [ ] `createProduct` valida todos los campos obligatorios.
- [ ] Usa transaccion de Sequelize para crear producto + categorias atomico.
- [ ] Valida unicidad de SKU y slug.
- [ ] Valida `supplierId` contra la tabla `suppliers`.
- [ ] Registra log con `Utils/logger.js`.
- [ ] Retorna la forma admin completa del producto creado.
- [ ] Pruebas: `cd Back && npm test` pasa.

---

# FASE 3 — Frontend: servicio y tipos para creacion

## Contexto
El frontend necesita un servicio para llamar a `POST /api/admin/products` y tipos TypeScript para el payload de creacion.

## Archivos a tocar / crear en `Front/`

### 1. Tipos: `Front/src/types/admin.ts`
Agregar (despues de `AdminProduct`):

```ts
export type AdminProductCreatePayload = {
  sku: string;
  name: string;
  description?: string | null;
  slug?: string | null;
  price: number;
  cost?: number;
  markup?: number;
  compareAtPrice?: number | null;
  currency?: string;
  stock?: number;
  active?: boolean;
  status?: "draft" | "active" | "archived";
  provider?: string;
  providerSku?: string | null;
  sizes?: string[];
  destacadas?: boolean;
  combo?: boolean;
  descuentoPorcentaje?: number | null;
  images?: string[];
  categoryIds?: string[];
  supplierId?: string | null;
  manualOverrides?: Record<string, boolean>;
};
```

### 2. Servicio de acciones: `Front/src/services/admin/catalog.actions.ts`
Agregar:

```ts
export async function createAdminProduct(
  payload: AdminProductCreatePayload,
): Promise<AdminProduct> {
  return apiSend<AdminProduct>("/api/admin/products", {
    method: "POST",
    body: payload,
  });
}
```

Importar `AdminProductCreatePayload` del tipo.

## Criterios de aceptacion Fase 3
- [ ] Tipo `AdminProductCreatePayload` exportado desde `Front/src/types/admin.ts`.
- [ ] Funcion `createAdminProduct` en `catalog.actions.ts` usando `apiSend` (con cookie y CSRF).
- [ ] `npm run typecheck` pasa en `Front/`.

---

# FASE 4 — Frontend: componente de formulario y pagina de creacion

## Contexto
Se necesita una pagina completa en `/admin/articulos/nuevo` (o similar) con un formulario para crear productos manuales, usando componentes de Kokonut UI, incluido el botón Particle Button para guardar.

## Archivos a crear / tocar en `Front/`

### 1. Ruta de pagina: `Front/src/app/admin/articulos/nuevo/page.tsx`
Pagina Server Component que carga categorias y proveedores, y renderiza el componente cliente del formulario.

```tsx
export const dynamic = "force-dynamic";

export default async function AdminArticuloNuevoPage() {
  const [categories, providers] = await Promise.all([
    listAdminCategories(),
    listCatalogProviders(), // endpoint GET /api/admin/suppliers para obtener proveedores activos
  ]);

  return (
    <div className="flex flex-col gap-6">
      <section className="relative isolate overflow-hidden rounded-2xl bg-carbon px-5 py-8 text-cream sm:px-8 sm:py-10">
        <DotFieldBackground variant="carrito" />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold tracking-[0.25em] text-terracotta uppercase">Nuevo articulo</p>
            <h1 className="mt-3 font-heading text-[clamp(1.9rem,4vw,2.9rem)] leading-tight font-bold tracking-tight">Crear producto manual</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-cream/75">
              Crea un producto de alta manual. Asigna el proveedor de origen (o deja "manual" si es propio de UPBUY).
            </p>
          </div>
          <Link href="/admin/catalogo" className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-cream/25 px-4 text-sm font-semibold text-cream transition-colors hover:bg-cream/10 focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none">
            Volver al catalogo <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </section>
      <ArticuloNuevoForm categories={categories.categories} providers={providers} />
    </div>
  );
}
```

### 2. Componente cliente: `Front/src/components/admin/articulos/ArticuloNuevoForm.tsx`
Formulario con los mismos campos que editar (ver `ProductDrawer.tsx`) mas el campo extra de proveedor:
- SKU (obligatorio)
- Nombre (obligatorio)
- Descripcion
- Slug
- Precio (obligatorio)
- Costo
- Markup %
- Precio de referencia (compareAtPrice)
- Moneda
- Stock
- Estado (draft/active/archived)
- Activo/Inactivo
- Destacado
- Imagenes (lista de URLs)
- Categorias (multiselect)
- **Proveedor (select: manual, venndelo, mastershop, etc.)**
- Descuento %
- Boton Particle Button de Kokonut UI para guardar
- Boton cancelar

Usar `lucide-react` para iconos. Textos en español. Validacion client-side basica antes de enviar.

Instalar Kokonut UI Particle Button:
```bash
npx shadcn@latest add @kokonutui/particle-button
```

### 3. Integracion en el panel
Agregar enlace "Crear articulo" en `Front/src/app/admin/catalogo/page.tsx` o en el sidebar del admin, visible solo para `canWrite`.

## Criterios de aceptacion Fase 4
- [ ] Pagina `/admin/articulos/nuevo` accesible desde el panel de catalogo.
- [ ] Formulario con todos los campos del producto mas el selector de proveedor.
- [ ] Boton Particle Button de Kokonut UI para guardar.
- [ ] Validacion client-side de campos obligatorios (sku, nombre, precio).
- [ ] Al guardar exitoso, redirige al listado de catalogo o muestra notificacion de exito.
- [ ] Errores de la API se muestran al usuario en espanol.
- [ ] `npm run typecheck` y `npm run build` pasan en `Front/`.

---

# FASE 5 — Integracion, pruebas y documentacion

## Tarea
Conectar backend y frontend, ejecutar pruebas y documentar.

## Archivos a actualizar
- `Back/README.md` — documentar `POST /api/admin/products`.
- `Front/docs/BACKEND_INTEGRATION.md` — documentar el nuevo endpoint consumido.

## Pruebas
```bash
# Backend
cd Back && npm test

# Frontend
cd Front && npm run typecheck && npm run build
```

## Criterios de aceptacion Fase 5
- [ ] `POST /api/admin/products` integrado y funcionando end-to-end.
- [ ] Un administrador y superadministrador pueden crear un producto manual con proveedor asignado.
- [ ] El producto creado aparece en el listado de catalogo admin (`GET /api/admin/products`).
- [ ] El producto se puede editar desde el `ProductDrawer` existente (misma ficha de editar).
- [ ] Los campos de proveedor se filtran correctamente en el listado de catalogo (filtro `provider` ya existe).
- [ ] Codigo sin secretos hardcodeados.
- [ ] Documentacion actualizada.

---

## 3. Resumen de endpoints y servicios involucrados

| Capa | Archivo | Funcion/Endpoint | Accion |
|------|---------|------------------|--------|
| Ruta | `Back/Rutas/adminProducts.js` | `POST /` | Crear producto |
| Controlador | `Back/Controllers/catalog.controller.js` | `create` | HTTP delgado |
| Servicio | `Back/Services/catalog/catalogAdmin.service.js` | `createProduct` | Logica + transaccion |
| Consulta | `Back/Services/catalog/catalogQuery.service.js` | `getAdmin` | Retornar producto creado |
| Modelo | `Back/DataBase/models/Product.js` | `Product.create` | Insercion en BD |
| Modelo | `Back/DataBase/models/Supplier.js` | `Supplier.findByPk` | Validar proveedor |
| Front servicio | `Front/src/services/admin/catalog.actions.ts` | `createAdminProduct` | Llamada HTTP con sesion |
| Front tipos | `Front/src/types/admin.ts` | `AdminProductCreatePayload` | Tipo de entrada |
| Front UI | `Front/src/components/admin/articulos/ArticuloNuevoForm.tsx` | Formulario | Interfaz de usuario |
| Front UI | `Front/src/app/admin/articulos/nuevo/page.tsx` | Pagina | Server component |

## 4. Notas importantes
- **No renombres** rutas, controladores ni servicios existentes. Agrega lo nuevo junto a lo existente.
- El campo `provider` del producto ya acepta `'manual'` como valor por defecto; cualquier slug de proveedor existente también es válido.
- El auto-sync de proveedores no pisa productos con `manualOverrides` marcados; un producto creado manualmente con `provider='manual'` no será tocado por la sincronización.
- Todos los textos de UI en español.
- Usa `lucide-react` para iconos, nada de emoji.
- El botón de guardar debe ser el **Particle Button** de Kokonut UI (`@kokonutui/particle-button`).
- Antes de dar por terminado: `cd Back && npm test` y `cd Front && npm run typecheck && npm run build`.
