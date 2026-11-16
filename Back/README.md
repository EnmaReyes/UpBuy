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
| `npm run db:migrate:indexes` | Aplica los índices del panel (ADM-10); idempotente |

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
      catalogSupplier.service.js  fachada genérica de proveedor de catálogo
      venndelo.service.js         instancia Venndelo
      mastershop.service.js       instancia MasterShop
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
| GET | `/api/admin/orders/recent?since=<ISO>` |
| GET | `/api/admin/orders/stats` |
| GET | `/api/admin/orders/ventas` |
| GET | `/api/admin/orders/accounting?from=&to=&provider=` |
| GET | `/api/admin/orders/providers` |
| GET | `/api/admin/orders/export.csv` |
| POST | `/api/admin/orders/manual` |
| POST | `/api/admin/orders/manual/preview` |
| POST | `/api/admin/orders/import?dryRun=1` |
| GET | `/api/admin/orders/:id` |
| GET | `/api/admin/orders/:id/sync-history` |
| PATCH | `/api/admin/orders/:id/status` |
| PATCH | `/api/admin/orders/:id/tracking` |
| POST | `/api/admin/orders/:id/sync` |
| POST | `/api/admin/orders/:id/push` |
| GET/POST | `/api/admin/orders/:id/payments` |
| PATCH | `/api/admin/orders/:id/payments/:paymentId` |
| GET/PATCH | `/api/admin/products` · `/api/admin/products/:id` |
| POST | `/api/admin/products/:id/visibility` |
| POST | `/api/admin/products/bulk` |
| PUT | `/api/admin/products/:id/images` |
| POST | `/api/admin/products/:id/images/restore` |
| GET/POST/PUT/DELETE | `/api/admin/categories` · `/api/admin/categories/:id` |
| GET | `/api/admin/suppliers` |
| GET | `/api/admin/suppliers/overview` |
| GET | `/api/admin/suppliers/venndelo/status` |
| POST | `/api/admin/suppliers/venndelo/test-connection` |
| GET | `/api/admin/suppliers/venndelo/products` (+ `/:id`) |
| POST | `/api/admin/suppliers/venndelo/products/:id/publish` (+ `/unpublish`) |
| POST | `/api/admin/suppliers/venndelo/products/publish-bulk` |
| PATCH | `/api/admin/suppliers/venndelo/settings` |
| POST | `/api/admin/suppliers/venndelo/sync` |
| GET | `/api/admin/suppliers/venndelo/sync-history` |
| GET | `/api/admin/suppliers/mastershop/status` |
| POST | `/api/admin/suppliers/mastershop/test-connection` |
| GET | `/api/admin/suppliers/mastershop/products` (+ `/:id`) |
| POST | `/api/admin/suppliers/mastershop/products/:id/publish` (+ `/unpublish`) |
| POST | `/api/admin/suppliers/mastershop/products/publish-bulk` |
| PATCH | `/api/admin/suppliers/mastershop/settings` |
| POST | `/api/admin/suppliers/mastershop/sync` |
| GET | `/api/admin/suppliers/mastershop/sync-history` |
| GET | `/api/admin/admins/sessions` |
| POST | `/api/admin/admins/sessions/revoke-all` |
| DELETE | `/api/admin/admins/sessions/:id` |
| GET | `/api/admin/admins/security` |
| POST | `/api/admin/admins/security/backup-codes` |
| GET | `/api/admin/me` |
| GET | `/api/admin/dashboard/summary` |

#### Clientes / usuarios (ADM-9)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/admin/users` | `{ users, total, limit, offset }` con filtros `q`, `segment` (`con_compras`/`sin_compras`), `consent` (`email`/`whatsapp`/`ninguno`), `registeredFrom`/`registeredTo`; resumen por fila (`ordersCount`, `totalSpent`) sin N+1 |
| GET | `/api/admin/users/export.csv` | CSV de clientes: contacto + consentimientos + resumen. JAMAS password, tokens ni hashes |
| GET | `/api/admin/users/:id` | Perfil, direcciones, resumen `{ ordersCount, totalSpent, lastOrderAt }`, consentimientos y estado |
| GET | `/api/admin/users/:id/orders` | Pedidos del cliente (paginados) |
| PATCH | `/api/admin/users/:id` | Edita `name`, `lastName`, `phone` (normalizado), `address`, `marketingOptIn`, `whatsappOptIn` y `disabled`. Exige `users.write`; cambiar `disabled` exige además **step-up** (`users.disable`) y revoca sesiones (tokenVersion+1). Ignora `role`, `admin`, `password` y `email` |

Reglas: editar el perfil recalcula `profileComplete` con la misma regla de
`Services/profile.js` (no rompe la sesión del cliente); todo cambio queda en
`audit_logs`; los listados nunca exponen campos sensibles.

#### Difusión por email con Gmail (ADM-7)

Consentimiento, campañas y envío por lotes. La lógica vive en
`Services/campaigns/*` y `Services/consent.js`; el esquema lo aplica
`ensureCampaignSchema` (idempotente) y las columnas de consentimiento
(`marketingOptIn`, `marketingOptInAt`, `unsubscribedAt`, `emailBouncedAt`)
viven en `usuarios`. Sin `GMAIL_TOKEN_ENCRYPTION_KEY` (base64 de 32 bytes) el
token OAuth **no se guarda** (nunca en claro) y el panel muestra «Gmail no
configurado»; el refresh token solo viaja de la base a la API de Gmail y jamás
sale en respuestas ni en logs.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/admin/campaigns/status` | `{ configured, connected, from, dailyLimit, sentToday, redirectPath }` — nunca tokens |
| GET | `/api/admin/campaigns/oauth/start` | URL de Google con `state` JWT (`purpose: gmail_oauth`, 10 min); el `state` también va en cookie httpOnly `upbuy.gmail_oauth` |
| GET | `/api/admin/campaigns/oauth/callback` | Valida `state` (JWT + cookie), exige sesión admin, guarda el refresh token cifrado |
| POST | `/api/admin/campaigns/audience` | `{ segment }` → conteo + muestra (10) del segmento |
| POST | `/api/admin/campaigns/test-send` | Envía `{ subject, body }` al correo del propio admin (obligatorio en la UI antes del envío real) |
| POST | `/api/admin/campaigns` | Crea la campaña con `{ subject, body, segment }`; calcula destinatarios. Exige `campaigns.send` + **step-up** |
| POST | `/api/admin/campaigns/:id/send` | Envía UN lote de 25; responde `{ sent, failed, remaining, errors, dailyLimitReached, done }`. Reintentable sin duplicar |
| GET | `/api/admin/campaigns` · `/api/admin/campaigns/:id` | Historial y detalle por destinatario |
| GET | `/api/public/campaigns/unsubscribe?token=` | Baja sin sesión (token JWT firmado por usuario); responde una página HTML simple de confirmación |
| GET | `/api/admin/whatsapp/status` | `{ configured, apiVersion, templateMarketing, templateLang, dailyLimit, sentToday }` — nunca tokens |
| POST | `/api/admin/whatsapp/test` | Prueba de plantilla SOLO al teléfono del propio admin (exige teléfono válido en su cuenta) |
| POST | `/api/admin/campaigns` con `channel: "whatsapp"` | Crea la campaña de WhatsApp (`{ channel, body, segment }`); destinatarios con teléfono E.164 válido. Exige `campaigns.send` + **step-up** |
| POST | `/api/admin/campaigns/whatsapp/audience` | `{ segment }` → conteo de elegibles + `invalidCount` (teléfonos no normalizables, excluidos) |
| POST | `/api/admin/campaigns/:id/send-whatsapp` | Envía UN lote de 20 por WhatsApp Cloud API con la plantilla marketing (`{{1}}` = mensaje renderizado). Reintentable sin duplicar |
| GET | `/api/admin/campaigns/:id/whatsapp/manual` | Filas del modo manual: mensaje renderizado + enlace `wa.me` |
| POST | `/api/admin/campaigns/:id/whatsapp/manual-sent` | Marca un envío manual hecho (`{ recipientId }`). Idempotente |
| GET | `/api/admin/campaigns/:id/whatsapp/export.csv` | CSV del modo manual (nombre, teléfono, mensaje, estado) |

Reglas de envío:

- **Consentimiento**: solo `marketingOptIn = true` y `unsubscribedAt = null`;
  se excluyen admins/staff (`role != customer`), correos rebotados
  (`emailBouncedAt`) y cuentas desactivadas. El consentimiento se revalida por
  destinatario en cada lote: una baja surte efecto aunque la campaña ya exista.
- **Segmentos**: `todos`, `compradores` (con pedidos) y `sin_compras`.
- **Idempotencia**: `campaign_recipients` es único por `(campaignId, userId)`;
  el lote reclama filas `pending` con `FOR UPDATE SKIP LOCKED` y las filas
  `claimed` de hace más de 10 minutos vuelven a `pending` (crash recovery).
- **Lotes**: máx. 25 por petición; el cron `/api/cron/campaigns` (Bearer
  `CRON_SECRET`) continúa las campañas con pendientes. El techo diario global
  es `CAMPAIGN_DAILY_LIMIT` (400 por defecto, por debajo de la cuota de Gmail).
- **Plantillas**: variables `{{nombre}}`, `{{ultimoPedido}}` y `{{ciudad}}`,
  renderizadas en el servidor y SIEMPRE escapadas. El correo va
  `multipart/alternative` (texto plano + HTML simple con enlace de baja).
- **Baja**: el token de baja no expira; darse de baja apaga `marketingOptIn`
  y fija `unsubscribedAt`. Es idempotente.
- **WhatsApp (ADM-8)**: consentimiento INDEPENDIENTE por canal
  (`whatsappOptIn`, `whatsappUnsubscribedAt`); el opt-in de email no se
  hereda. Difusión SOLO con plantilla aprobada por Meta
  (`WHATSAPP_TEMPLATE_MARKETING`, con un parámetro de cuerpo `{{1}}` = texto
  renderizado); `sendText` queda reservado a la ventana de 24 h
  (operacional). Teléfonos en E.164 Colombia (`+57...`); los inválidos se
  excluyen y se reportan. Sin credenciales, el panel ofrece modo manual
  (enlaces `wa.me` uno a uno + CSV) y NO simula envíos. Librerías no
  oficiales (whatsapp-web.js, Baileys) prohibidas. El cron de campañas
  prioriza el lote de WhatsApp (20) cuando el canal está configurado y tiene
  pendientes.

Esquema y migración: `npm run db:migrate:campaigns` (también corre al arrancar
la API junto a los demás `ensure*`).

#### Perfil y resumen del panel (ADM-1)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/admin/me` | `{ id, email, username, name, lastName, phone, image, role, permissions, mfaEnabled, session: { expiresAt, mfaAt } }`, sin campos sensibles |
| GET | `/api/admin/dashboard/summary?periodo=mes` | `stats` + `sales` + `accounting` del mes + `recentOrders` (5) + `providers` en una sola llamada |

`/api/admin/me` exige sesión administrativa; el resumen exige además
`orders.read`. El rol y los permisos se leen de la base en cada petición
(`requireAdminSession`) y nunca del JWT.

#### Seguridad personal del administrador (ADM-S2 / ADM-S3)

`GET /api/admin/admins/security` devuelve `mfa` (`enabled`, `enrolledAt`),
`backupCodes` (`total`, `remaining`), `sessions` (`active`,
`currentSessionId`) y `policy` (`idleMinutes`, `maxHours`, `stepUpMinutes`).
No incluye el secreto TOTP ni los hashes de los códigos. Lo puede consultar
cualquier administrador autenticado: es su propia cuenta.

`POST /api/admin/admins/security/backup-codes` genera un juego nuevo de 10
códigos y **invalida los anteriores** en una transacción. Exige step-up
reciente (`security.backup_codes`, sin permiso de gobierno) y MFA activo
(`409 MFA_NOT_ENABLED` en caso contrario). Los códigos en claro se devuelven
una sola vez; el evento queda en `auth_events`.

`GET/POST/DELETE /api/admin/admins/sessions*` listan y revocan las sesiones
del propio administrador. Revocar la sesión actual (o todas) limpia la cookie
y obliga a iniciar sesión de nuevo.

#### Detalle de pedido y sincronización (ADM-2)

`GET /api/admin/orders/:id` agrega a la respuesta del pedido:

- `providerSync`: `provider`, `providerOrderId`, `outOfSync`, `manualOverride`,
  `lastSyncAt`, `lastSyncOk`, `lastSyncDirection`, `lastSyncError` y el estado
  **mapeado** (`fulfillmentStatus`/`paymentState` + etiquetas). El valor crudo
  `providerStatus` nunca sale al cliente.
- `lastSyncAt` / `lastSyncOk` en la raíz, tomados del último `SyncLog`.
- `allowedTransitions`: transiciones válidas desde `fulfillmentStatus`, con
  `requiresTracking` (`shipped`) y `requiresStepUp` (`cancelled`). El front no
  duplica la máquina de estados.

`GET /api/admin/orders/:id/sync-history` devuelve `{ logs }` (máx. 20, del más
reciente al más antiguo) con `direction`, `attempt`, `ok`, `error` y
`createdAt`; no incluye los payloads crudos del proveedor. Exige `orders.read`.

#### Ventas manuales e importación CSV (ADM-3)

`POST /api/admin/orders/manual` registra una venta externa. El cuerpo lleva
`items`, `shipping`, `channel`, `paymentMethod`/`paymentStatus` y notas; el
**total siempre lo calcula el servidor** desde el catálogo. Exige
`orders.write`.

`POST /api/admin/orders/manual/preview` calcula ese total **sin escribir nada**
para que el panel lo muestre mientras se arma el pedido. Mismo cuerpo que la
creación.

`POST /api/admin/orders/import?dryRun=1` recibe `text/csv` (máx. 2 MB y 2.000
filas) y:

- Con `dryRun=1` devuelve `{ summary, errors, warnings, rows }` sin escribir.
- Sin `dryRun`, importa en transacción y devuelve `{ summary, created,
  duplicates, errors }`; una fila inválida no bloquea a las válidas.
- La columna `ref_externa` se guarda en `orders.externalRef` y el par
  `(channel, externalRef)` es único: reimportar el mismo archivo no duplica.
- Los pedidos importados usan `channel = otro`; nunca pisan pedidos web.
- Si el producto no está en el catálogo, `total` es obligatorio; si está, el
  precio se recalcula y las diferencias se reportan como avisos.

Esquema: `externalRef` y su índice único viven en `ensureDropshippingSchema`
(idempotente); no se usa `sequelize.sync()` en producción. Exige `orders.write`
y el rate limit de importación.

#### Proveedores y control operativo (ADM-4)

No distingas las dos integraciones por el nombre: **Venndelo Pro** (doble N) es
el catálogo; **Vendelo** (una N) y **Dropi** son los pedidos.

`GET /api/admin/suppliers/overview` devuelve, en una sola llamada:

- `catalogProviders[]`: `id`, `slug`, `name`, `label`, `isActive`, `configured`,
  `supplierProducts`, `publishedProducts`, `lastActivityAt` y `lastRun`
  (última corrida de `catalog_sync_runs`).
- `orderProviders[]`: `name`, `label`, `configured`, `mode` (`api` | `manual`),
  `totalOrders`, `outOfSyncOrders`, `lastActivityAt`, `lastSyncOk`,
  `lastSyncError`.
- `outOfSync`: suma de pedidos desincronizados de todos los proveedores.
- `health`: `{ days, endDate, services[] }` con 14 días de actividad por
  proveedor (`incidents`, `missing`, `totalEvents`, `failures`). Los días con
  fallos parciales son `degraded`; sin ningún intento exitoso, `down`.

Exige `providers.manage` y solo lee: no toca credenciales ni estados de pedido.
`configured` sale de `integrations/suppliers` (catálogo) y de
`Services/providers` (pedidos); un proveedor sin credenciales queda en `manual`
y el panel lo muestra como tal, sin ocultarlo.

`GET /api/admin/orders` acepta además `outOfSync=1` para listar solo pedidos con
`providerOutOfSync = true` (el enlace del contador). El resto de filtros
(`status`, `paymentStatus`, `channel`, `paymentMethodCode`, `provider`, `q`,
`from`, `to`) se comparten con la exportación.

`GET /api/admin/orders/export.csv` usa **los mismos filtros** y exporta hasta
5000 filas (`X-Upbuy-Rows` indica cuántas). Columnas: pedido, fecha, canal,
cliente, contacto, dirección, productos, total, método y estado de pago,
estado de cumplimiento, transportadora, guía, `providerOrderId`, referencia
externa y notas. Los estados van **traducidos** y nunca incluye
`providerStatus`. Exige `orders.read`; la ruta se registra antes de `/:id`.

#### Catálogo UPBUY: visibilidad y curaduría

Importar, publicar y ser visible son tres pasos distintos. Publicar crea la fila
en `products`; nace en `draft` salvo que el proveedor tenga
`publishPolicy = auto_visible`. Un producto es visible con
`status = active AND active = true`; el stock 0 se muestra como agotado y no
oculta el producto.

Cada corrida de sincronización hace, en este orden: **importar** el catálogo del
proveedor, **sincronizar** los productos ya publicados y **auto-publicar** los
nuevos según `suppliers.publishPolicy`:

| Política | Efecto en productos nuevos |
| --- | --- |
| `manual` | No publica nada: el administrador decide desde la bandeja |
| `auto_draft` | Publica en borrador para revisar la ficha |
| `auto_visible` | Publica y activa si el proveedor lo tiene disponible |

La política y la categoría por defecto se editan en el panel del proveedor
(`/admin/proveedores/<slug>`, pestaña Catálogo) con
`PATCH /api/admin/suppliers/:slug/settings`. El cambio se aplica a los productos
nuevos desde la **próxima sincronización**; no publica lo que ya está pendiente
en la bandeja.

La auto-publicación solo mira productos **sin fila en `products`**: nunca
resucita archivados, no pisa `manualOverrides` y omite los que no tienen
disponibilidad (se publican cuando el proveedor los repone).

El resumen de la corrida incluye `publishPolicy`, `publishedCreated`,
`publishedUpdated`, `hidden` y `skipped`; los mismos contadores se guardan en
`catalog_sync_runs` y se muestran en el historial del panel.

Dropi no tiene catálogo por API: sus productos se cargan **manualmente**. No hay
importador CSV mientras no exista un contrato; la integración de pedidos no
cambia.

`GET /api/admin/products` acepta `q`, `status`, `provider`, `visibility`
(`visible`/`hidden`), `hasCategory` (`true`/`false`), `published` (`1`/`0`) y
`stock` (`in`/`out`).

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/api/admin/products/:id/visibility` | `{ visible: boolean }`. Ocultar exige step-up `catalog.unpublish` |
| POST | `/api/admin/products/bulk` | `{ ids, action, payload }`; acciones `make_visible`, `hide`, `archive`, `restore_draft`, `apply_markup`, `set_categories`, `feature` |
| GET | `/api/admin/products/unpublished` | Bandeja global: importados de **todos** los proveedores sin fila en `products`; filtros `q`, `availability`, `provider` (slug) |
| PUT | `/api/admin/products/:id/images` | `{ images: [{ url }] }`, máximo 8 URLs `https`; marca `manualOverrides.images` |
| POST | `/api/admin/products/:id/images/restore` | Quita el override y reconstruye desde `supplier_product_assets` |
| POST | `/api/admin/suppliers/:slug/products/publish-bulk` | `{ productIds?, filters?, markup?, visibility? }`; idempotente, devuelve `{ requested, updated, skipped }` |
| PATCH | `/api/admin/suppliers/:slug/settings` | `{ publishPolicy?, defaultCategoryId? }` |

`PATCH /api/admin/products/:id` ya no acepta `stock` cuando el producto viene de
un proveedor (422): solo la sincronización mueve el stock. El `slug` solo se
puede cambiar en borradores o con `confirmSlugChange: true` si el producto está
visible. La sincronización respeta `manualOverrides` de precio, nombre,
descripción, stock, imágenes y visibilidad; publicar de nuevo no resucita un
producto oculto o archivado. Si no se elige categoría, se usa
`suppliers.defaultCategoryId` o la categoría `Sin clasificar`.

La relación producto–categoría es N:M (`product_categories`): un producto puede
tener varias. `PATCH /api/admin/products/:id` acepta `categoryIds` y reemplaza
la selección; `POST /api/admin/categories` crea una categoría al vuelo. En una
base nueva se siembran `masculino`, `femenino`, `accesorios` y `calzado` (solo
si ninguna existe); el home las muestra desde `GET /api/categories`.

#### Avisos de compra en vivo (ADM-5)

`GET /api/admin/orders/recent?since=<ISO>` alimenta el polling del panel y
exige `orders.read`. Devuelve `{ orders, count, serverTime }`:

- Solo `channel = "web"`: las ventas manuales o importadas por CSV nunca
  generan aviso.
- Con `since`, solo pedidos con `createdAt > since`, hasta 20 y en **orden
  ascendente**.
- Sin `since`, devuelve los últimos 20 pedidos web (línea base de la primera
  carga). Un `since` que no sea una fecha ISO válida responde `400`.
- `serverTime` se calcula antes de la consulta para que el siguiente `since`
  no se salte pedidos creados durante la petición. Un pedido repetido es
  inofensivo: el front deduplica por `id`.
- `Cache-Control: no-store` lo aplica el prefijo `/api/admin`; no se repite en
  la ruta. La serialización reutiliza la de la lista y elimina
  `providerStatus`, así que el estado crudo del proveedor nunca sale.

El aviso dentro de la aplicación sigue usando `notifyAdminsOfNewOrder`
(`Services/notifications.js`): es idempotente por administrador, enlaza a
`/admin/pedidos/:id` y no crea un segundo sistema de notificaciones.

#### Roles, permisos y sesiones (ADM-S1)

La fuente de verdad del rol es `usuarios.role` (`customer`, `support`,
`admin`, `superadmin`). La columna legacy `admin` se mantiene sincronizada.
Los permisos se derivan del rol en `Services/permissions.js`:

| Permiso | support | admin | superadmin |
|---|:---:|:---:|:---:|
| `orders.read`, `users.read` | ✅ | ✅ | ✅ |
| `orders.write`, `orders.refund`, `catalog.write`, `users.write` | — | ✅ | ✅ |
| `campaigns.read`, `campaigns.send`, `providers.manage` | — | ✅ | ✅ |
| `admins.manage`, `audit.read` | — | — | ✅ |

Cada petición a `/api/admin/*` pasa por `requireAdminSession`, que revalida
contra la base el rol, la cuenta activa, `tokenVersion` y la sesión (`sid`)
registrada en `admin_sessions`. Logout, cambio de rol y `revoke-all` revocan
la sesión de inmediato; el token no espera a expirar.

#### MFA obligatorio para administradores (ADM-S2)

Con `ADMIN_MFA_REQUIRED=true` (default en producción), todo rol del panel
(`support`, `admin`, `superadmin`) necesita TOTP. El login es en dos pasos:

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Contraseña correcta → `202 { mfaRequired, challengeId }` (admin con MFA) o `403 { code: "ADMIN_MFA_SETUP_REQUIRED", enrollmentTicket }` |
| POST | `/api/auth/admin/mfa` | `{ challengeId, code }` → cookie de sesión |
| POST | `/api/auth/admin/mfa/setup` | `{ enrollmentTicket }` → `otpauthUrl`, `secret` y 10 códigos de respaldo (una sola vez) |
| POST | `/api/auth/admin/mfa/enroll` | `{ enrollmentTicket, code }` → activa MFA y emite cookie |

- El secreto TOTP se guarda cifrado con AES-256-GCM
  (`ADMIN_MFA_ENCRYPTION_KEY`, base64 de 32 bytes). La clave anterior se puede
  mantener en `ADMIN_MFA_ENCRYPTION_KEY_PREVIOUS` para rotar sin perder acceso.
- Los códigos de respaldo se guardan con bcrypt y son de un solo uso.
- El reto expira a los `ADMIN_MFA_CHALLENGE_MINUTES` (10) y se bloquea tras
  `ADMIN_MFA_MAX_ATTEMPTS` (5) intentos fallidos.
- `requireAdminSession` exige `mfaEnabled` y que la sesión tenga `mfaAt`.
  El login social (Google/Facebook) pasa por el mismo flujo: no hay atajo.
- Los eventos `mfa`, `mfa_setup`, `mfa_enroll` quedan en `auth_events`.

#### Step-up y gobierno de administradores (ADM-S3)

Las acciones destructivas exigen un segundo factor **reciente**
(`admin_sessions.mfaAt` dentro de `ADMIN_STEP_UP_MINUTES`, 10 por defecto):

| Acción | Permiso | Ruta protegida |
|---|---|---|
| Reembolso / anulación de pago | `orders.refund` | `PATCH /api/admin/orders/:id/payments/:paymentId` |
| Cancelación de pedido | `orders.write` | `PATCH /api/admin/orders/:id/status` cuando el destino es `cancelled` |
| Despublicar producto | `catalog.write` | `PATCH /api/admin/products/:id` con `active: false` o `status != "active"`; `POST /:id/visibility` con `visible: false`; `POST /bulk` con `hide` o `archive` |
| Cambiar rol o estado de un admin | `admins.manage` | `PATCH /api/admin/admins/:id` |
| Envío de campañas | `campaigns.send` | `POST /api/admin/campaigns` (creación y envío de lotes, email y WhatsApp) |
| Desactivar cuenta de cliente | `users.write` | `PATCH /api/admin/users/:id` **solo** cuando el payload cambia `disabled` (editar contacto no la exige) |

Si el segundo factor no es reciente, la API responde
`403 { code: "STEP_UP_REQUIRED", action, maxAgeMinutes }`. El panel pide el
código y lo valida con:

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/admin/step-up` | `{ code }` (TOTP o código de respaldo) refresca `mfaAt` de la sesión actual |

Gestión de administradores (solo `superadmin`, permiso `admins.manage`):

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/admin/admins?q=&limit=&offset=` | Lista cuentas con rol del panel |
| PATCH | `/api/admin/admins/:id` | `{ role?, disabled? }`; revoca sesiones y audita el cambio |

- Nadie puede cambiar su propio rol ni desactivar su propia cuenta
  (`409 SELF_ADMIN_CHANGE`).
- No se puede degradar ni desactivar al último superadmin activo
  (`409 LAST_SUPERADMIN`).
- Todo cambio incrementa `tokenVersion`, cierra las sesiones del afectado y
  queda en `audit_logs` (`admin_role_changed`, `admin_disabled_changed`,
  `admin_updated`) y `auth_events` (`admin_updated`, `step_up`).

Bootstrap del primer superadmin (escribe en `audit_logs`):

```bash
cd Back
node scripts/grantAdmin.js --email=correo@dominio.com --role=superadmin --confirm
```

Migración manual del esquema (también corre al arrancar la API):

```bash
cd Back
npm run db:migrate:admin
```

#### Endurecimiento de sesión, IP y auditoría (ADM-S4)

- **Cookie `__Host-`**: en producción la sesión viaja en
  `__Host-upbuy_session` (`Secure`, `Path=/`, sin `Domain`), que ningún
  subdominio puede sobrescribir. Fuera de producción se mantiene
  `access_token`. Durante la transición el backend lee **ambas** cookies y el
  logout limpia las dos; `Front/src/proxy.ts` también acepta las dos. El nombre
  se puede forzar con `SESSION_COOKIE_NAME` (coordinado con el front).
- **Rotación de sesión**: al validar el step-up se crea una sesión nueva,
  se revoca la anterior y se reemite el JWT/cookie
  (`rotateAdminSession`). Un código interceptado no reutiliza el `sid` viejo.
- **IP allowlist**: `ADMIN_IP_ALLOWLIST` (IPs exactas y CIDR IPv4/IPv6
  separadas por comas, vacío = sin restricción) protege `/api/admin`,
  `/api/auth/admin/*` y el login de un administrador. Si la IP no está
  permitida responde `403 { code: "ADMIN_IP_NOT_ALLOWED" }` antes de tocar la
  base. La IP se toma de `req.ip`, que respeta `TRUST_PROXY`.
- **Alertas por intentos fallidos**: `SECURITY_ALERTS_ENABLED` (default true)
  avisa a los admins cuando una cuenta o IP acumula
  `ADMIN_ALERT_FAILED_ATTEMPTS` (5) fallos en
  `ADMIN_ALERT_WINDOW_MINUTES` (15). Las notificaciones son idempotentes por
  ventana y nunca incluyen códigos, contraseñas ni tokens.
- **Revisión y retención de `auth_events`** (solo `superadmin`,
  `audit.read`):

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/admin/audit/events?event=&result=&userId=&from=&to=&limit=&offset=` | Eventos de autenticación paginados (máx. 200) |
| POST | `/api/admin/audit/prune` | `{ olderThanDays? }` (mínimo 7); exige step-up `admins.manage` |

La limpieza manual por CLI es `npm run security:prune -- --days=90 [--confirm]`.
Sin `--confirm` solo cuenta lo que borraría. `AUTH_EVENTS_RETENTION_DAYS` (90)
define la retención; `0` la desactiva. **Solo borra `auth_events`**: los
`audit_logs` de negocio se conservan.

`PATCH .../status` acepta `pushToProvider: true`. Si el push falla, el cambio
local se mantiene y el pedido queda con `providerOutOfSync = true`.

### Cron

| Método | Ruta | Auth |
|---|---|---|
| GET | `/api/cron/sync-providers` | `Authorization: Bearer ${CRON_SECRET}` |
| GET | `/api/cron/sync-catalog` | `Authorization: Bearer ${CRON_SECRET}` |
| GET | `/api/cron/campaigns` | `Authorization: Bearer ${CRON_SECRET}` — envía UN lote de 25 de la campaña con pendientes más antigua |

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

## 6.b Catálogo de proveedores (Venndelo Pro / MasterShop)

El catálogo de cada proveedor se importa a PostgreSQL y se publica en la tienda
por decisión del administrador. Detalle completo en
[`docs/PROVEEDORES.md`](docs/PROVEEDORES.md).

Proveedores de catálogo disponibles hoy:

- **Venndelo Pro** (`venndelo`) — OAuth 2.0 con rotación de refresh token.
- **MasterShop** (`mastershop`) — llave estática `ms-api-key`, sin OAuth.

### Modelos

| Tabla | Qué guarda |
|---|---|
| `suppliers` | El proveedor (Venndelo, MasterShop, Dropi…). |
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

- `POST /api/admin/suppliers/<slug>/sync` importa el catálogo original, aplica
  los cambios a los productos publicados y auto-publica los nuevos según la
  política del proveedor. Es idempotente: correrlo dos veces no duplica nada ni
  republica lo ya publicado.
- Paginación: **cursor** en Venndelo (`page_token` / `next_page_token`;
  `page_size` ≤ 500) e **índice de página** en MasterShop (`page` ≥ 1,
  `limit` ≤ 50, fin por `resultsCount.totalProducts`).
- Reglas: el **stock** sigue a las unidades reales del proveedor; el **precio de
  venta nunca se pisa**; si un producto deja de estar disponible se
  **oculta** (no se borra); un producto con pedidos jamás se elimina. El stock
  0 no oculta: se muestra agotado.
- La importación **no borra** productos que falten en una página parcial.
- Concurrencia: un advisory lock de Postgres impide dos corridas a la vez (409).
  Hay una clave de lock por proveedor.
- El cron `/api/cron/sync-catalog` sincroniza **todos** los proveedores
  configurados; si uno falla, los demás continúan. Cada corrida importa,
  concilia lo publicado y auto-publica según la política del proveedor.

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
5. Crear la fachada y el controlador con las fábricas compartidas:

```js
// Services/suppliers/<slug>.service.js
module.exports = createCatalogSupplierService({ slug, providerName });
// Controllers/suppliers/<slug>.controller.js
module.exports = createCatalogSupplierController({ service, providerName });
```

Los servicios de `Services/catalog/` no cambian: si el proveedor necesita
SKU/slug/tallas propios, expone los hooks `normalizeProduct`, `productSizes`,
`buildProductSku` y `buildProductSlug` dentro de `catalog`.

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
- `/api/cron/campaigns`

En el dashboard, el **Root Directory** del proyecto debe ser `Back`.

`index.js` exporta la app de Express. La base se inicializa una vez por
instancia en el primer request: `ensureBaseSchema` crea las tablas base si la
base esta vacia (p. ej. un Neon nuevo), y `ensureCatalogSchema` /
`ensureDropshippingSchema` aplican el resto (CHECKs, indices parciales,
secuencia, semillas). Todo es idempotente. Sin `sequelize.sync()` en
produccion.

Para preparar una base Neon a mano antes del primer deploy:
`node scripts/bootstrapSchema.js` (o `npm run db:bootstrap`) con
`DATABASE_URL` apuntando a la base. En producción `index.js` **no** llama a
`app.listen()`: Vercel usa el export.

Plan Pro: cambiar el schedule de `vercel.json` a `*/15 * * * *`. Vercel **no
lee variables de entorno para el schedule**; `CRON_SCHEDULE` solo documenta lo
desplegado.

### Índices del panel (ADM-10)

`ensurePanelIndexes()` (corre al arrancar, tras `ensureDropshippingSchema`;
manual: `npm run db:migrate:indexes`) crea con `CREATE INDEX IF NOT EXISTS`:

| Índice | Sirve para |
|---|---|
| `orders_provider_created_at_idx` | Filtro por proveedor en listados y ventas/accounting |
| `orders_user_created_at_idx` | Pedidos de un cliente (detalle ADM-9) |
| `usuarios_created_at_idx` | Listado de clientes (orden por defecto) |
| `campaign_recipients_status_sent_at_idx` | Techo diario y pendientes del cron |

Revision de N+1: los listados del panel usan subconsultas/agregados por fila
(`ordersCount`, `totalSpent` de clientes) en una sola consulta, y todos los
listados acotan `limit` (100 max en orders/usuarios, 200 en campanas,
paginacion en audit). Todo es idempotente y no hace nada cuando ya esta al dia.

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
