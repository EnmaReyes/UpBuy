# Upbuy — Backend (dropshipping Dropi / Vendelo)

API REST en Node.js + Express + Sequelize (PostgreSQL) para una tienda con
dropshipping. La lógica de negocio vive en servicios; las rutas solo validan y
delegan.

**La fuente de verdad es Upbuy.** Los estados crudos de Dropi/Vendelo nunca se
exponen: se mapean a estados canónicos. Si el proveedor falla, el pedido sigue
su curso y queda marcado para reintentar.

---

## 1. Requisitos

- Node.js 18+ (se probó con 22)
- PostgreSQL accesible
- Variables de entorno (ver `.env.example`)

```bash
npm install
cp .env.example .env.local   # en Windows: copy .env.example .env.local
# completar credenciales en .env.local
npm run dev                  # http://localhost:3000
```

`.env.local` no se versiona. `.env.example` es la plantilla y **no debe
contener secretos**.

---

## 2. Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor con nodemon |
| `npm start` | Servidor sin watcher |
| `npm test` | Tests de reglas críticas (node:test) |
| `npm run db:check` | Verifica el esquema |
| `npm run db:migrate` | Aplica la migración de dropshipping (pedidos) |
| `npm run db:verify-migration` | Prueba destructiva de la migración de pedidos |
| `npm run db:migrate:catalog` | Aplica el esquema de catálogo (`--down` revierte) |
| `npm run db:verify-catalog` | Verifica el esquema de catálogo |
| `npm run venndelo:check` | Prueba la conexión real con Venndelo |
| `npm run db:create` | Crea la base local |

Las migraciones son **idempotentes** (`DataBase/ensureCatalogSchema.js` y
`DataBase/ensureDropshippingSchema.js`) y corren solas al arrancar. No usan
`sequelize-cli`. `npm run db:migrate:catalog -- --down` revierte el catálogo
(destructivo; solo desarrollo).

---

## 3. Arquitectura

```
Back/
  index.js              app de Express (entry point de Vercel) + bootstrap de la base
  config.js             lectura/validación de variables de entorno
  DataBase/
    models/             modelos Sequelize + enums canónicos
    ensureCatalogSchema.js        # productos, categorías, proveedores
    ensureDropshippingSchema.js   # pedidos, estados, contabilidad
  integrations/         código específico de cada proveedor (sin Express)
    suppliers/
      index.js          registro de proveedores de catálogo
      credentials.js    cifrado AES-256-GCM de credenciales
      venndelo/
        venndelo.auth.js       OAuth 2.0 (refresh + rotación + single-flight)
        venndelo.client.js     cliente HTTP (Bearer, 401-retry)
        venndelo.catalog.js    GET /products (paginación por cursor)
        venndelo.assets.js     imágenes (lectura; escritura bloqueada)
        venndelo.normalize.js  normalización pura y testeable
  Services/
    statusMachine.js    reglas puras de estados (sin DB)
    orderService.js     transiciones + auditoría + historial
    orders.js           alta/baja/tracking de pedidos
    payments.js         ciclo del intento de pago
    accounting.js       contabilidad por rango
    profile.js          perfil completo + normalización de teléfono
    addresses.js        direcciones del comprador
    prices.js           resolución de precio del producto
    pricing.js          armado de líneas del pedido
    catalog/
      catalogImport.service.js   importación idempotente del catálogo
      catalogSync.service.js     sincronización + publicar/despublicar
      catalogRuns.service.js     corridas + lock anti-concurrencia
      catalogQuery.service.js    lectura pública/admin + edición
      categories.service.js      categorías internas
    suppliers/
      venndelo.service.js  fachada para el panel
    providers/          adaptadores Vendelo / Dropi (pedidos)
    syncService.js      sincronización IN/OUT de pedidos
    webhookEvents.js    idempotencia de webhooks
    wompi.js / vendeloWebhook.js
    cron.js             corrida periódica
  Controllers/          capa HTTP delgada (incluye suppliers/)
  Rutas/                routers de Express (incluye suppliers/)
  Middlewares/          auth, perfiles, rate limits
  docs/                 ESTADOS.md, PROVEEDORES.md
  test/                 pruebas
```

---

## 4. Dos ciclos de estado

| Campo | Responde |
|---|---|
| `Order.fulfillmentStatus` | ¿Dónde va el pedido físicamente? |
| `Order.paymentState` | ¿Dónde va el dinero? |

```
pending_payment → paid → packing → shipped → delivered
unpaid → pending_collection → collected → settled
```

Reglas clave (detalle en [`docs/ESTADOS.md`](docs/ESTADOS.md)):

- Transición inválida → **422**.
- `shipped` sin guía → **422**.
- COD: `shipped` → `pending_collection`; `delivered` → `collected`.
- Pago online confirmado → `paid` + `settled`.
- El auto-sync **no pisa** un cambio manual (`manualOverride`).
- Todo cambio queda en `audit_logs` y `order_status_history`.

---

## 5. Endpoints principales

### Públicos

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/products?q=&category=&featured=&limit=&offset=` | Catálogo publicado (solo activos) |
| GET | `/api/products/:slug` | Detalle (slug, sku o id) |
| GET | `/api/categories` | Categorías activas |
| GET | `/api/orders/:id/tracking?phone=&email=` | Tracking sin sesión |
| POST | `/api/webhooks/wompi` | Firma de Wompi |
| POST | `/api/webhooks/vendelo` | Firma HMAC de Vendelo |
| POST | `/api/webhooks/:provider` | Alias |
| POST | `/api/payments/webhook` | Compatibilidad con Wompi |

### Comprador (sesión)

| Método | Ruta |
|---|---|
| GET/PUT | `/api/users/me` |
| GET/POST | `/api/users/me/addresses` |
| PUT/DELETE | `/api/users/me/addresses/:id` |
| PUT | `/api/users/me/addresses/:id/default` |
| GET/POST | `/api/orders` · `/api/orders/mine` |
| GET | `/api/orders/:id` |
| POST | `/api/orders/:id/cancel` |
| POST | `/api/orders/:id/payment` |
| POST | `/api/orders/:id/payment/verify` |
| POST | `/api/payments/intent` |

`POST /api/orders` exige perfil completo. Si falta algo:

```json
{ "code": "PROFILE_INCOMPLETE", "missing": ["phone", "address"] }
```

### Administración (sesión + admin)

| Método | Ruta |
|---|---|
| GET | `/api/admin/orders` |
| GET | `/api/admin/orders/stats` |
| GET | `/api/admin/orders/ventas` |
| GET | `/api/admin/orders/accounting?from=&to=&provider=` |
| GET | `/api/admin/orders/providers` |
| POST | `/api/admin/orders/manual` |
| GET | `/api/admin/orders/:id` |
| PATCH | `/api/admin/orders/:id/status` |
| PATCH | `/api/admin/orders/:id/tracking` |
| POST | `/api/admin/orders/:id/sync` |
| POST | `/api/admin/orders/:id/push` |
| GET/POST | `/api/admin/orders/:id/payments` |
| PATCH | `/api/admin/orders/:id/payments/:paymentId` |
| GET/PATCH | `/api/admin/products` · `/api/admin/products/:id` |
| GET/POST/PUT/DELETE | `/api/admin/categories` · `/api/admin/categories/:id` |
| GET | `/api/admin/suppliers` |
| GET | `/api/admin/suppliers/venndelo/status` |
| POST | `/api/admin/suppliers/venndelo/test-connection` |
| GET | `/api/admin/suppliers/venndelo/products` (+ `/:id`) |
| POST | `/api/admin/suppliers/venndelo/products/:id/publish` (+ `/unpublish`) |
| POST | `/api/admin/suppliers/venndelo/sync` |
| GET | `/api/admin/suppliers/venndelo/sync-history` |
| GET | `/api/cron/sync-catalog` (Bearer `CRON_SECRET`) |

`PATCH .../status` acepta `pushToProvider: true`. Si el push falla, el cambio
local se mantiene y el pedido queda con `providerOutOfSync = true`.

### Cron

| Método | Ruta | Auth |
|---|---|---|
| GET | `/api/cron/sync-providers` | `Authorization: Bearer ${CRON_SECRET}` |

---

## 6. Contabilidad

```
netProfit = subtotal + shippingCost - discountTotal
            - providerCost - gatewayFee - providerFee
```

`GET /api/admin/orders/accounting` separa:

- **Utilidad ganada** — pedidos entregados.
- **Efectivo recibido** — pagos liquidados / depositados.

Y desglosa COD en `unpaid`, `pending_collection`, `collected` y `settled`.

---

## 6.b Catálogo de proveedores (Venndelo Pro)

El catálogo de Venndelo Pro se importa a PostgreSQL y se publica en la tienda
por decisión del administrador. Detalle completo en
[`docs/PROVEEDORES.md`](docs/PROVEEDORES.md).

### Modelos

| Tabla | Qué guarda |
|---|---|
| `suppliers` | El proveedor (Venndelo, Dropi…). |
| `supplier_credentials` | Credenciales cifradas (AES-256-GCM) y refresh token rotado. |
| `supplier_products` | Producto ORIGINAL del proveedor (idempotente por `supplierId + externalId`). |
| `supplier_product_variations` | Variación (talla): SKU, precio y **cantidad real**. |
| `supplier_product_assets` | Imágenes del proveedor (URL exacta, posición 1 = principal). |
| `products` | Producto PUBLICADO en Upbuy (precio de venta, stock en unidades, estado). |
| `product_images` | Imágenes del producto publicado (con cache en `products.images`). |
| `categories` + `product_categories` | Categorías internas (N:M). |
| `catalog_sync_runs` | Bitácora de cada sincronización. |

### OAuth 2.0

`POST /v1/admin/oauth/token` (form-urlencoded) con `grant_type=refresh_token`,
`refresh_token`, `client_id` y `client_secret`. La respuesta trae
`access_token`, `expires_in`, `expires_at` y —solo cuando hay rotación—
`refresh_token` + `refresh_token_expires_at`.

- `venndelo.auth.getAccessToken()` es la única puerta al token: cachea en
  memoria, renueva 60 s antes de expirar y usa **single-flight** (N llamadas
  concurrentes = 1 renovación).
- Si Venndelo rota el refresh token, se guarda cifrado en
  `supplier_credentials` (requiere `SUPPLIER_CREDENTIALS_ENCRYPTION_KEY`).
- Un 401 en una petición renueva el token y reintenta **una vez**.
- Nunca se escriben tokens completos en los logs.

### Importación y sincronización

- `POST /api/admin/suppliers/venndelo/sync` importa el catálogo original y
  aplica los cambios a los productos publicados. Es idempotente: correrlo dos
  veces no duplica nada.
- Paginación por **cursor** (`page_token` / `next_page_token`; `page_size` ≤ 500).
- Reglas: el **stock** sigue a las unidades reales del proveedor; el **precio de
  venta nunca se pisa**; si un producto deja de estar disponible se
  **desactiva** (no se borra); un producto con pedidos jamás se elimina.
- La importación **no borra** productos que falten en una página parcial.
- Concurrencia: un advisory lock de Postgres impide dos corridas a la vez (409).

### Publicar

`POST .../products/:id/publish` crea/actualiza el producto en la tienda
(sugiere precio con `DEFAULT_MARKUP_PERCENT` si no se envía uno) y
`.../unpublish` lo archiva. Los assets de productos de proveedor **no se
modifican** (Venndelo lo prohíbe), solo se leen.

### Agregar otro proveedor

1. Crear `integrations/suppliers/<slug>/` con `auth`, `client` y `catalog`.
2. Registrarlo en `integrations/suppliers/index.js`.
3. Insertar su fila en `suppliers` (o sembrarla en `ensureCatalogSchema`).
4. Añadir sus variables al `.env.example`.

Los servicios de `Services/catalog/` no cambian.

---

## 7. Proveedores de pedidos

Contrato, variables y modo manual de Dropi: [`docs/PROVEEDORES.md`](docs/PROVEEDORES.md).

Resumen:

- **Vendelo** (pedidos, legado): API. Rutas configurables por `VENDELO_PATH_*`
  (no confirmadas hasta validarlas con su documentación). Sin `VENDELO_API_URL`
  queda en 503 y no afecta a la tienda.
- **Dropi**: sin API pública confirmada. Modo **manual** por defecto: registra
  la exportación en `sync_logs` y genera CSV para el panel.

Sin credenciales, el proveedor no se llama: el flujo manual sigue funcionando.

---

## 8. Despliegue (Vercel)

Vercel detecta este proyecto como una app **Express** sin configuración extra
(zero-config): `index.js` exporta la app y Vercel la empaqueta como una sola
Vercel Function. Por eso ya **no** se usan `builds` ni la carpeta `api/`.

`vercel.json` solo declara los crons diarios `0 12 * * *` (plan Hobby = 1
corrida/día):

- `/api/cron/sync-providers`
- `/api/cron/sync-catalog`

En el dashboard, el **Root Directory** del proyecto debe ser `Back`.

`index.js` exporta la app de Express. La base se inicializa una vez por
instancia en el primer request (`ensureCatalogSchema` +
`ensureDropshippingSchema`), sin `sequelize.sync()` en producción. En
producción `index.js` **no** llama a `app.listen()`: Vercel usa el export.

Plan Pro: cambiar el schedule de `vercel.json` a `*/15 * * * *`. Vercel **no
lee variables de entorno para el schedule**; `CRON_SCHEDULE` solo documenta lo
desplegado.

---

## 9. Seguridad

- Tokens y contraseñas solo en `.env.local` / variables del proveedor.
- Webhooks idempotentes por `(provider, eventId)`.
- El monto de un pago **nunca** se toma del webhook ni del front: se relee de
  `Order`.
- El tracking público exige teléfono o correo del pedido.
- El cron exige `CRON_SECRET`; sin él responde 401.

---

## 10. Tests

```bash
npm test
```

Cubre las reglas críticas:

1. Transiciones válidas/inválidas (422).
2. Efectos COD (`shipped`/`delivered`).
3. Gating de perfil.
4. Cálculo de `netProfit`.
5. Idempotencia de webhooks (requiere base local; se salta si no hay).
