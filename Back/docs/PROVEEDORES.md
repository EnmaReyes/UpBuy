# Proveedores de dropshipping (Vendelo / Dropi)

Upbuy es la **fuente de verdad**. El proveedor es una dependencia externa: si
falla, se cae o cambia su API, el negocio sigue funcionando en modo manual.

Todo el código específico de cada proveedor vive en `Services/providers/`.
El resto del backend solo usa el contrato común.

```
Services/providers/
  index.js          registro + getProvider(name) + listProviders()
  payload.js        payload común de creación de pedido
  vendelo.client.js adaptador Vendelo (API)
  dropi.client.js   adaptador Dropi (manual por defecto, API opcional)
```

---

## 1. Contrato común

Todo adaptador cumple:

```js
{
  name,                              // "vendelo" | "dropi"
  isConfigured(),                    // false => modo manual / 503
  listProducts(page, { limit }),     // catálogo
  createOrder({ order, items }),     // { provider, providerOrderId, ... }
  getOrderStatus(providerOrderId),   // { providerStatus, canonical, ... }
  updateOrderStatus(id, canonical),  // push del cambio manual
}
```

Reglas:

- **Ninguna ruta de proveedor está hardcodeada.** Cada una se lee de una
  variable `*_PATH_*` y tiene un valor por defecto marcado como **no
  confirmado**.
- **Los tokens viven solo en el entorno** (`config.js`). Nunca en el código ni
  en la base.
- Sin credenciales, `isConfigured()` devuelve `false` y las llamadas de red no
  se intentan: el flujo manual sigue disponible.

---

## 2. Variables de entorno

```bash
# --- Venndelo Pro (CATÁLOGO) ---
VENNDELO_API_URL=https://api.venndelo.com
VENNDELO_ADMIN_PATH=/v1/admin
VENNDELO_OAUTH_URL=https://api.venndelo.com/v1/admin/oauth/token
VENNDELO_CLIENT_ID=
VENNDELO_CLIENT_SECRET=
VENNDELO_REFRESH_TOKEN=
SUPPLIER_CREDENTIALS_ENCRYPTION_KEY=          # base64 32 bytes (AES-256-GCM)
CATALOG_SYNC_ENABLED=true
CATALOG_SYNC_PAGE_SIZE=500
CATALOG_SYNC_SUPPLY_MODEL=DROPSHIP            # ANY | OWN_STOCK | DROPSHIP
CATALOG_SYNC_SCHEDULE=0 12 * * *              # documentación (real: vercel.json)

# --- Vendelo / Dropi (PEDIDOS, legado) ---
VENDELO_API_URL=          # base, ej. https://api.vendelo.co
VENDELO_TOKEN=            # Bearer token
VENDELO_PAYMENT_KEY=      # checkout hosted (si se usa)
VENDELO_WEBHOOK_SECRET=   # firma HMAC del webhook de pagos

# Rutas (opcionales; por defecto las de abajo)
VENDELO_PATH_PRODUCTS=/products
VENDELO_PATH_ORDERS=/orders
VENDELO_PATH_ORDER_DETAIL=/orders/{id}
VENDELO_PATH_ORDER_STATUS=/orders/{id}/status

# Dropi (la API es opcional)
DROPI_API_URL=
DROPI_TOKEN=
DROPI_PATH_PRODUCTS=/products
DROPI_PATH_ORDERS=/orders
DROPI_PATH_ORDER_DETAIL=/orders/{id}
DROPI_PATH_ORDER_STATUS=/orders/{id}/status
```

> **Antes de producción** hay que confirmar las rutas contra la documentación
> real de cada proveedor. Los valores por defecto son una suposición REST, no
> una verdad. `listProducts()` es la llamada más barata para validarlas.

---

## 3. Vendelo

Modo API. Si `VENDELO_API_URL` y `VENDELO_TOKEN` están configurados:

- `createOrder` hace `POST` y devuelve el id asignado.
- `getOrderStatus` hace `GET` y mapea el estado crudo.
- `updateOrderStatus` hace `PATCH` con el estado canónico.

Si faltan las credenciales, `createOrder`/`updateOrderStatus` lanzan `503` y
`getOrderStatus` no se llama (el sync lo marca como `proveedor_no_configurado`).

---

## 4. Dropi

**Modo manual (por defecto).** Sin `DROPI_API_URL` / `DROPI_TOKEN`:

- `createOrder` **no falla**: deja el pedido listo para cargar a mano y
  registra `sync_logs` con `direction: "out"`, `ok: true`.
- `exportOrderForDropiCsv({ order, items })` devuelve `{ columns, rows }` para
  pegar en la plantilla del panel; `toCsv(exported)` lo serializa.
- `getOrderStatus` devuelve `manual: true` y `canonical: {}` (no hay estado
  remoto que leer).
- `updateOrderStatus` lanza `409 PROVIDER_MANUAL_MODE`.

**Modo API (opcional).** Si se configuran las credenciales, el mismo adaptador
usa las rutas `DROPI_PATH_*`.

El modo manual no es un error: es el flujo esperado. Si Dropi habilita API, no
hay que cambiar nada fuera de este adaptador.

---

## 5. Sincronización

### Automática (cron, dirección IN)

`GET /api/cron/sync-providers` con `Authorization: Bearer ${CRON_SECRET}`.

1. Busca pedidos con `provider` + `providerOrderId` y sin `manualOverride`.
2. Lee el estado del proveedor (`getOrderStatus`).
3. Mapea a canónico con `mapProviderToCanonical`.
4. Aplica solo transiciones válidas; nunca revierte un cambio local.
5. Guarda el estado crudo en `orders.providerStatus`.
6. Registra cada intento en `sync_logs` (`direction: "in"`).
7. Reintenta los `sync_logs` `out` fallidos.

En Vercel: `vercel.json` define el cron (`0 12 * * *`, plan Hobby = 1 vez al
día). En plan Pro se puede bajar a `*/15 * * * *`. Fuera de Vercel, cualquier
scheduler puede llamar al endpoint; `CRON_SCHEDULE` documenta el valor
desplegado (Vercel no lee variables para el schedule).

### Manual (panel, dirección OUT)

- `POST /api/admin/orders/:id/push` → crea el pedido en el proveedor.
- `PATCH /api/admin/orders/:id/status` con `pushToProvider: true` → empuja el
  nuevo estado.
- `POST /api/admin/orders/:id/sync` → fuerza una lectura puntual.
- `GET /api/admin/orders/providers` → estado de conexión de cada proveedor.

Si el push falla:

- el cambio local **no se revierte**,
- el pedido queda con `providerOutOfSync = true`,
- el intento queda en `sync_logs` y el cron lo reintenta.

---

## 6. Agregar un proveedor nuevo (pedidos)

1. Crear `Services/providers/<nombre>.client.js` cumpliendo el contrato.
2. Registrarlo en `CLIENTS` de `Services/providers/index.js`.
3. Añadir el valor al enum `PROVIDER` en `DataBase/models/enums.js`.
4. Añadir sus palabras clave en `OVERRIDES_POR_PROVEEDOR`
   (`Services/statusMachine.js`) si su vocabulario no está cubierto.
5. Añadir las variables al `.env.example`.

No hay que tocar `syncService`, `orderService` ni las rutas.

---

# Venndelo Pro (catálogo)

Integración de CATÁLOGO del proveedor Venndelo Pro. Es independiente del
adaptador de pedidos "Vendelo" de arriba (variables `VENNDELO_*` con doble N).

## 7. Código

```
integrations/suppliers/
  index.js           registro de proveedores de catálogo (contrato común)
  credentials.js     cifrado AES-256-GCM
  venndelo/
    venndelo.auth.js       OAuth2 (refresh, rotación, single-flight)
    venndelo.client.js     cliente HTTP (Bearer, 401-retry)
    venndelo.catalog.js    GET /products y /products/:id (cursor)
    venndelo.assets.js     imágenes (lectura; escritura bloqueada)
    venndelo.normalize.js  normalización pura
  mastershop/
    mastershop.auth.js     llave estática (ms-api-key), sin OAuth
    mastershop.client.js   cliente HTTP, rate limit y traducción de errores
    mastershop.catalog.js  GET /api/products (índice de página)
    mastershop.assets.js   una imagen por producto (solo lectura)
    mastershop.normalize.js normalización pura y SKU `MS-`
Services/catalog/    importación, sincronización, corridas, consulta
Services/suppliers/catalogSupplier.service.js    fábrica de la fachada
Services/suppliers/venndelo.service.js           instancia Venndelo
Services/suppliers/mastershop.service.js         instancia MasterShop
Controllers/suppliers/catalogSupplier.controller.js  fábrica HTTP
```

Contrato del registro:

```js
{
  slug, name,
  isConfigured(),
  auth:    { getAccessToken(supplier), getStatus(supplier), invalidate(supplier) },
  client:  { checkAuth(supplier) },
  catalog: { listPage(supplier, opts), iteratePages(supplier, opts, onPage),
             getProduct(supplier, id) },
  assets:  { listAssets(product), assertAssetsMutable(product) },
}
```

## 8. Endpoints confirmados (OpenAPI oficial)

| Método | Ruta | Notas |
|---|---|---|
| POST | `/v1/admin/oauth/token` | form-urlencoded; rota el refresh token |
| GET | `/v1/admin/check-auth` | prueba de autenticación |
| GET | `/v1/admin/products` | `page_token`, `page_size` (≤500), `supply_model`, `sku`, `created_min/max` |
| GET | `/v1/admin/products/{id}` | detalle |
| POST/PUT/DELETE | `/v1/admin/products[/{id}]` | escritura (no se usa: los productos son de proveedor) |
| POST/PUT/DELETE | `/v1/admin/products/{id}/assets[/{asset_id}]` | imágenes en base64; **solo productos propios** |

Paginación por **cursor**: `next_page_token` vacío = última página. El producto
trae `variations[]` (con `quantity` y `price` reales) y `assets[]` (posición 1 =
principal, `url` exacta del proveedor). **No hay endpoint de categorías**: las
categorías de Upbuy son internas.

## 9. Flujo

1. `POST /api/admin/suppliers/venndelo/sync` → importa `supplier_products` +
   variaciones + assets (idempotente por `supplierId + externalId`).
2. `POST /api/admin/suppliers/venndelo/products/:id/publish` → crea el producto
   publicado (`products`) con precio sugerido o el que envíe el admin.
3. La sincronización aplica cambios de stock/descripción/imágenes, **desactiva**
   lo no disponible y **nunca** pisa precio ni campos editados por el admin
   (`products.manualOverrides`).
4. Auto-publicación: tras sincronizar, los productos del proveedor que aún no
   tienen fila en `products` se publican según `suppliers.publishPolicy`
   (`manual` no publica; `auto_draft` crea en borrador; `auto_visible` crea
   activo). Los que no tienen disponibilidad se omiten hasta que vuelvan a
   tener stock. La corrida guarda `publishedCreated`, `publishedUpdated`,
   `hidden` y `skipped`.
5. Automatización: `GET /api/cron/sync-catalog` (Bearer `CRON_SECRET`).

Estados de la corrida en `catalog_sync_runs`: `running`, `success`, `error`.

### Credenciales (importante)

Venndelo **rota el refresh token**. Cuando lo hace, el nuevo token se guarda
cifrado en `supplier_credentials` y desde ese momento esa fila es la fuente de
verdad (el `VENNDELO_REFRESH_TOKEN` del entorno queda obsoleto).

- **No borres `supplier_credentials`** ni reviertas el esquema de catálogo sin
  un backup: perderías el token rotado. El script
  `db:migrate:catalog -- --down` se niega a borrar si hay credenciales
  guardadas (requiere `--force`).
- Si rotas `SUPPLIER_CREDENTIALS_ENCRYPTION_KEY`, pon la anterior en
  `SUPPLIER_CREDENTIALS_ENCRYPTION_KEY_PREVIOUS` para poder descifrar lo
  guardado y volver a cifrarlo.

## 10. Agregar otro proveedor de catálogo

1. Crear `integrations/suppliers/<slug>/` con `auth`, `client` y `catalog`.
2. Registrarlo en `integrations/suppliers/index.js`.
3. Insertar su fila en `suppliers` (o sembrarla en `ensureCatalogSchema.js`).
4. Añadir sus variables al `.env.example`.
5. Crear la fachada y el controlador con las fábricas compartidas:

```js
// Services/suppliers/<slug>.service.js
module.exports = createCatalogSupplierService({ slug, providerName });
// Controllers/suppliers/<slug>.controller.js
module.exports = createCatalogSupplierController({ service, providerName });
```

`Services/catalog/*` no se toca: habla el contrato común. Si el proveedor
necesita SKU/slug/tallas propios, expone los hooks opcionales en `catalog`:

```js
catalog: { normalizeProduct, productSizes, buildProductSku, buildProductSlug }
```

Si no los expone, se usan los de Venndelo (comportamiento histórico).

---

# MasterShop (catálogo)

Integración de CATÁLOGO. No tiene adaptador de pedidos ni webhooks: esas
superficies quedaron fuera de alcance.

## 11. Autenticación

MasterShop usa una **llave estática** en el header `ms-api-key`. No hay OAuth,
refresh token, rotación ni caché de token, y tampoco se persiste nada en
`supplier_credentials`. La llave vive solo en el entorno
(`MASTERSHOP_API_KEY`) y nunca se devuelve en `/status`, `/test-connection`, ni
en los mensajes de error o logs.

MasterShop deriva el usuario y el negocio de la llave: **no** se envían headers
de contexto ni identificadores de usuario/negocio.

```env
MASTERSHOP_API_URL=https://prod.api.mastershop.com
MASTERSHOP_API_KEY=
MASTERSHOP_HTTP_TIMEOUT_MS=20000
MASTERSHOP_SYNC_PAGE_SIZE=50
```

Sin `MASTERSHOP_API_KEY` el adaptador queda "no configurado": las rutas de su
panel responden 503 y el resto de la tienda sigue funcionando.

## 12. Endpoints usados (documentación oficial)

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/products` | `page` (índice, empieza en 1), `limit` (≤50), `category`, `search` |
| GET | `/api/products/{id}` | detalle; 404 si el producto no pertenece al negocio |

Respuesta del listado: `{ results: [...], resultsCount: { totalProducts } }`.
El fin de los datos se detecta por página vacía, página incompleta o haber
alcanzado `totalProducts`. No se usa `next_page_token`: MasterShop pagina por
índice.

Campos del producto que se consumen: `idProduct`, `name`, `description`,
`basePrice`, `baseCurrencyPrice`, `stockTotal`, `urlImageProduct`. El payload
completo se conserva en `supplier_products.rawData`.

## 13. Mapeo a Upbuy

- Se importa **a nivel de producto**: el esquema de `variation[]` no está
  documentado, así que no se leen variaciones ni se derivan tallas.
- `stockTotal` → `totalQuantity` y `availability` (`> 0`).
- `basePrice` → costo (`originalPrice`).
- `baseCurrencyPrice` → moneda (si no es ISO de 3 letras, `COP`).
- `urlImageProduct` → un único asset (`externalAssetId: "img-1"`, posición 1).
- SKU publicado: `MS-<idProduct>`; slug: nombre + fragmento del id.
- Un producto sin stock sigue **visible como agotado**; solo se oculta cuando el
  proveedor deja de ofrecerlo. Nunca se borra.

## 14. Errores del proveedor

| Proveedor | Nuestra API | Motivo |
|---|---|---|
| 400 | 400 | petición inválida (bug o dato mal formado) |
| 404 | 404 | producto inexistente o de otro negocio |
| 429 | 503 | límite de uso; se informa `retryAfterSeconds` |
| 401 / 403 | 502 | llave ausente o sin permiso (configuración nuestra) |
| 5xx | 502 | fallo del proveedor |

Los headers `RateLimit-Limit`, `RateLimit-Remaining` y `RateLimit-Reset` se
leen y se reportan sin secretos en `/test-connection`.

## 15. Rutas del panel

Bajo `/api/admin/suppliers/mastershop`, con sesión revocable y permiso
`providers.manage`:

```
GET  /status
POST /test-connection
GET  /products            (siempre desde PostgreSQL; `published=0` = bandeja)
GET  /products/:id
GET  /sync-history
POST /products/:id/publish
POST /products/:id/unpublish
POST /products/publish-bulk
PATCH /settings           ({ publishPolicy, defaultCategoryId })
POST /sync
```

No existen rutas de billetera ni de pedidos: MasterShop se integra solo como
catálogo. `publishPolicy` (`manual` | `auto_draft` | `auto_visible`) y
`defaultCategoryId` viven en `suppliers`; publicar sin `visibility` explícita
crea el producto en borrador salvo que la política sea `auto_visible`.

## 16. Cron

`GET /api/cron/sync-catalog` recorre **todos** los proveedores configurados en
orden. Si uno falla, se registra en su `catalog_sync_runs` y se continúa con el
siguiente; la respuesta trae un arreglo `suppliers` con el resultado de cada
uno y `ok` global.

## 17. Limitaciones conocidas

- **Dropi**: no hay catálogo por API. Decisión vigente: sus cargas se hacen
  **manualmente**; no se implementa el importador CSV de la Fase 6 mientras no
  exista contrato. La integración de pedidos de Dropi sigue como estaba.
- **Pedidos**: sin integrar. `POST /api/orders` exige un esquema de
  `variation[]` que no está documentado y `orders.provider` solo acepta
  `vendelo`/`dropi`.
- **Webhooks**: sin integrar. MasterShop no documenta firma HMAC ni secreto
  compartido, así que el origen no se puede verificar.
- **Market / billetera / devoluciones**: fuera de alcance.
- **Variaciones**: no se importan (contrato no documentado).

