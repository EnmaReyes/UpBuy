# BACKEND_INTEGRATION.md — E-commerce Frontend

Base URL: `NEXT_PUBLIC_API_URL` (dev: `http://localhost:3000`). Todas las rutas bajo `/api/*`.

Autenticación: cookie `httpOnly` `access_token` (JWT, 12h). El frontend nunca lee el token; las peticiones deben usar `credentials: "include"`. CORS permite `FRONTEND_URL`.

## 1. Endpoints disponibles

> **Refactor completado:** el backend migró a un modelo de dropshipping
> (Venndelo/Dropi) y ya expone el catálogo público en `/api/products` y
> `/api/categories`. La FASE 3 del frontend consume estos endpoints.
> Siguen eliminados (sin reemplazo) banners, DTF, posts, precios y envío.

### Públicos (sin sesión)

| Método | Ruta | Funcionalidad | Notas |
|---|---|---|---|
| GET | `/` | Health básico | `{ message }` |
| GET | `/health` | Health de BD | `{ ok, db, latencyMs }` |
| GET | `/products?q=&category=&featured=&new=1&sort=best_sellers&limit=&offset=` | **Catálogo publicado** | ver §2 |
| GET | `/products/:slug` | **Detalle** (slug, sku o id) | ver §2 |
| GET | `/home` | **Portada curada** (selección, novedades, favoritos, categorías) | ver §2 |
| GET | `/categories` | **Categorías activas** | `[{ id, name, slug, ... }]` |
| GET | `/orders/:id/tracking?phone=&email=` | Tracking público | `phone` o `email` |
| POST | `/webhooks/wompi` | Webhook Wompi (firma) | (backend) |
| POST | `/webhooks/vendelo` | Webhook Vendelo (HMAC) | (backend) |
| POST | `/payments/webhook` | Compatibilidad Wompi | (backend) |

### 1.1 Catálogo: contrato vigente (Venndelo Pro)

El backend normaliza el catálogo del proveedor en una tabla `products` y lo
expone en `/api/products`. El front ya **no** usa `mock-data.ts` para el
catálogo: consume estos endpoints.

- Solo aparecen productos `status="active"` y `active=true` (publicados).
- El stock son **unidades reales**. Si llega a 0 el producto **sigue visible**
  como agotado; solo se oculta cuando el proveedor deja de ofrecerlo (sin
  borrarlo).
- Las categorías son **internas de Upbuy** (el proveedor no las entrega):
  `/api/products?category=<slug>` filtra por slug de categoría. Un producto
  puede tener **varias** (`product_categories` es N:M) y la ficha del panel
  permite crearlas al vuelo (`POST /api/admin/categories`).
- El home muestra las cuatro primeras categorías activas (sin
  `sin-clasificar`) desde `GET /api/home`; si la API falla, la Home muestra un
  estado vacío honesto (nunca productos de ejemplo).
- Siguen **eliminados** (sin reemplazo): `/banner`, `/dtf`, `/posts`,
  `/prices`, `/shipping/*`, `/admin/campaigns`. Modelos eliminados: `Banner`,
  `Campaign`, `Dtf`, `PriceVariant`, `ProductPrice`, `ShippingRate`, `Articulos`
  (reemplazado por `products`). Servicios eliminados: `catalog.js` (catalogo
  articulos+dtfs), `shipping.js`, `ensurePricing.js`.

### Autenticación

| Método | Ruta | Funcionalidad | Body | Respuesta |
|---|---|---|---|---|
| POST | `/auth/register` | Registro | `{ username, email, password }` | `"Usuario creado con éxito"` |
| POST | `/auth/login` | Login | `{ username, password }` | Usuario (sin password) + cookie |
| POST | `/auth/logout` | Logout | — | 204 |
| GET | `/auth/me` | Sesión actual | — | Usuario o 401 |
| POST | `/auth/google` | Login social Google | `{ credential }` (ID token de GIS) | Usuario + cookie |
| POST | `/auth/facebook` | Login social Facebook | `{ accessToken }` (token del SDK JS) | Usuario + cookie |

#### Login social (Google y Facebook)

- **Google**: Google Identity Services en el navegador. El botón oficial
  (`renderButton`) devuelve un `credential` (ID token JWT) que se envía tal
  cual. El backend verifica firma, audiencia (`GOOGLE_CLIENT_ID`) y
  `email_verified`. No se usa el flujo de redirección OAuth y el front nunca ve
  el secreto de la app de Google.
- **Facebook**: SDK de JavaScript cargado bajo demanda al pulsar el botón.
  `FB.login` con `scope: "email,public_profile"`, `cookie: false` y Graph API
  `v27.0` (constante `GRAPH_VERSION` en `src/lib/facebook-sdk.ts`). Solo viaja
  el `accessToken`; el secreto de la app queda en el backend.
- Ambos responden **igual que `/auth/login`**: usuario + cookie, o
  `202 { mfaRequired: true, challengeId, expiresAt }` para administradores con
  MFA, o `403 { code: "ADMIN_MFA_SETUP_REQUIRED", enrollmentTicket }` si aún no
  lo configuraron. El front reutiliza `AdminMfaForm` sin duplicar el flujo.
- Errores visibles en el front:

| Respuesta | Cuándo | Texto en la UI |
|---|---|---|
| `400` | Falta `credential`/`accessToken` | Error genérico del proveedor |
| `401` | Token inválido, expirado o de otra app | «No pudimos validar tu cuenta…» |
| `409` | Facebook: el correo ya tiene cuenta (no auto-vincula) | Enlace a `/login` |
| `422` | Sin correo verificado (Google) o sin correo (Facebook) | Enlace a `/registro` |
| `429` | `authLimiter` compartido con `/auth/login` | «Demasiados intentos…» |
| `503` | Proveedor sin credenciales en el backend | Botón deshabilitado + aviso |

Si `NEXT_PUBLIC_GOOGLE_CLIENT_ID` o `NEXT_PUBLIC_FACEBOOK_APP_ID` faltan, el
botón correspondiente no se renderiza y el login tradicional sigue intacto.

### Comprador autenticado (`requireAuth`)

| Método | Ruta | Funcionalidad | Parámetros/Body |
|---|---|---|---|
| GET | `/users/me` | Perfil + dirección por defecto | — |
| PUT | `/users/me` | Actualizar perfil | body perfil |
| GET | `/users/me/addresses` | Listar direcciones | — |
| POST | `/users/me/addresses` | Crear dirección | body dirección |
| PUT | `/users/me/addresses/:id` | Actualizar dirección | body |
| DELETE | `/users/me/addresses/:id` | Eliminar dirección | — |
| PUT | `/users/me/addresses/:id/default` | Marcar por defecto | — |
| GET/POST | `/orders`, `/orders/mine` | Listar/crear pedidos | `limit, offset, status/fulfillmentStatus, paymentState` |
| GET | `/orders/:id` | Detalle de pedido (dueño o admin) | — |
| POST | `/orders/:id/cancel` | Cancelar si `canCancel` (antes de preparación) | — |
| POST | `/orders/:id/payment` | Iniciar pago Wompi | — |
| POST | `/orders/:id/payment/verify` | Verificar pago | `{ transactionId }` |
| POST | `/payments/intent` | Crear intento de pago | body |
| GET | `/notifications/...` | Notificaciones del usuario | ver rutas |
| GET/PUT | `/user/edit` | Perfil legacy | — |

Creación de pedido: `POST /orders` exige perfil completo; si falta, responde `400` con `{ code: "PROFILE_INCOMPLETE", missing: [...] }`. Body: `{ items, shipping, notes }`. Items referencian producto y variante; el backend valida precios/disponibilidad.

### Administración (`requireAuth` + `requireAdmin`)

Incluye: `/admin/orders` (+ stats, ventas, accounting, providers, export.csv, manual, manual/preview, import, status, tracking, sync, push, payments) y `/admin/users`.

### Seguridad personal (`/admin/perfil/seguridad`)

| Método | Ruta | Uso en el front |
|---|---|---|
| GET | `/admin/admins/security` | Estado de MFA, códigos restantes y política de sesión |
| POST | `/admin/admins/security/backup-codes` | Regenerar códigos (exige step-up) |
| GET | `/admin/admins/sessions` | Sesiones activas, con `current` |
| DELETE | `/admin/admins/sessions/:id` | Cerrar una sesión |
| POST | `/admin/admins/sessions/revoke-all` | Cerrar todas (incluida la actual) |

Las lecturas se hacen en el servidor; las mutaciones desde el cliente con
`apiSend` (cookie + `X-Upbuy-CSRF`). Regenerar códigos puede responder
`403 STEP_UP_REQUIRED`: el panel abre `StepUpDialog` y reintenta. Revocar la
sesión actual o todas limpia la cookie y redirige al login. La página no exige
permiso de auditoría: es la seguridad de la propia cuenta.

### Ventas manuales e importación (ADM-3)

| Método | Ruta | Uso en el front |
|---|---|---|
| POST | `/admin/orders/manual/preview` | Total calculado por el servidor, sin escribir |
| POST | `/admin/orders/manual` | Registrar una venta presencial/WhatsApp |
| POST | `/admin/orders/import?dryRun=1` | Vista previa del CSV (no escribe) |
| POST | `/admin/orders/import` | Importación confirmada, fila por fila |

La importación envía el archivo como `text/csv` (2 MB / 2.000 filas). El front
hace siempre dos pasos: `dryRun` y confirmación con el conteo de filas válidas.
La idempotencia la garantiza el backend con `(channel, externalRef)`; el panel
muestra los duplicados y no los reintenta. El total y los precios salen del
catálogo del servidor, nunca del CSV ni del navegador.

### Proveedores (ADM-4)

El panel usa tres lecturas y reutiliza las rutas Venndelo ya existentes:

| Método | Ruta | Uso en el front |
|---|---|---|
| GET | `/admin/suppliers/overview` | Tarjetas de proveedor, contador `outOfSync` y salud de 14 días |
| GET | `/admin/orders?outOfSync=1` | Pedidos desincronizados (enlace del contador) |
| GET | `/admin/orders/export.csv` | Exportación operativa con los filtros de la lista |

`overview` devuelve `catalogProviders[]` (Venndelo Pro y MasterShop:
`configured`, productos importados/publicados, última corrida),
`orderProviders[]` (Vendelo y Dropi: `configured`, `mode` `api`/`manual`, total y
desincronizados, último sync), `outOfSync` y `health.services[]`. Exige
`providers.manage`. El front **no** interpreta estados crudos: solo muestra
`label`, `mode`, contadores y la salud ya calculada.

Catálogo (`/admin/suppliers/venndelo/*` y `/admin/suppliers/mastershop/*`): la
UI de catálogo, publicación, stock, precio, sincronización e historial usa las
rutas de proveedor; no se duplican por slug. Pedidos, wallet e historial
operativo de Venndelo también se consumen tal cual
(`/admin/suppliers/venndelo/...` y `/admin/orders`). MasterShop solo expone
catálogo: no tiene rutas de pedidos ni de billetera. Los paneles
`/admin/proveedores/venndelo` y `/admin/proveedores/mastershop` comparten
estado, acciones, catálogo e historial (`CatalogSupplierParts`,
`CatalogSupplierSections`, `SupplierCatalog`).

Curaduría del catálogo publicado (`/admin/catalogo`), con permiso
`catalog.write`:

| Método | Ruta | Uso en el front |
|---|---|---|
| GET | `/admin/products` | Listado con `q`, `status`, `provider`, `visibility`, `hasCategory`, `published`, `stock` |
| POST | `/admin/products` | Alta manual; `sku`, `name`, `price` obligatorios. `markup` lo calcula el backend desde `cost` y `price`. `supplierId` vincula la fila de `suppliers` para que sincronice. |
| GET | `/admin/products/suppliers` | Proveedores activos `{ suppliers: [{ id, slug, name }] }` para el selector del alta |
| GET | `/admin/products/supplier-products` | Buscador de artículos originales sin publicar (alta asistida) |
| POST | `/admin/products/:id/restore-sync` | `{ fields?: string[] }`; quita overrides y devuelve campos al proveedor |
| PATCH | `/admin/products/:id` | Edición de ficha (el stock de proveedor es solo lectura) |
| POST | `/admin/products/:id/visibility` | Mostrar/ocultar; ocultar exige step-up `catalog.unpublish` |
| POST | `/admin/products/bulk` | Acciones en lote: `make_visible`, `hide`, `archive`, `restore_draft`, `apply_markup`, `set_categories`, `feature` |
| PUT | `/admin/products/:id/images` | Galería por URL (máx. 8, `https`); marca `manualOverrides.images` |
| POST | `/admin/products/:id/images/restore` | Vuelve a las imágenes del proveedor |
| GET | `/admin/products/home-sections` | Curaduría de la portada (`featured`, `newArrivals`, `communityFavorites`, `ranking`) |
| PUT | `/admin/products/home-sections/:section` | `{ productIds }` en orden; secciones `seleccion`, `novedades`, `favoritos` (máx. 4) |
| GET | `/admin/suppliers/:slug/products?published=0` | Bandeja por proveedor (endpoint de proveedor) |
| GET | `/admin/products/unpublished` | Bandeja global: sin publicar de todos los proveedores conectados |
| POST | `/admin/suppliers/:slug/products/publish-bulk` | Publicar seleccionados (respeta la política del proveedor) |
| PATCH | `/admin/suppliers/:slug/settings` | `publishPolicy` y `defaultCategoryId` |

La política se configura en el panel de cada proveedor (`/admin/proveedores/<slug>`,
pestaña Catálogo): `manual` no publica, `auto_draft` crea en borrador y
`auto_visible` crea visible si hay stock. Se aplica a los productos nuevos desde
la próxima sincronización; la bandeja sigue siendo manual.

Cada corrida de sync devuelve `publishPolicy`, `publishedCreated`,
`publishedUpdated`, `hidden` y `skipped`; el historial del proveedor los muestra
en la columna “Auto-publicación”.

`export.csv` responde `text/csv` con BOM UTF-8 y `X-Upbuy-Rows`. Se descarga con
`apiDownload`, nunca con `apiFetch`, porque la respuesta no es JSON.

### Avisos de compra en vivo (ADM-5)

| Método | Ruta | Uso en el front |
|---|---|---|
| GET | `/admin/orders/recent?since=<ISO>` | Polling de compras web nuevas (`useAdminOrderStream`) |

Devuelve `{ orders, count, serverTime }`. Solo incluye `channel = "web"`, como
máximo 20 pedidos y en orden ascendente. Sin `since` devuelve los últimos 20
(línea base marcada por `serverTime`); con `since` solo los posteriores; un
`since` inválido responde `400`. La serialización elimina `providerStatus`.
El front usa `apiGetOptional`, envía `since = serverTime` de la respuesta
anterior (sin depender del reloj del navegador) y deduplica por `id`.

La bandeja del panel vive en `/admin/notificaciones` y reutiliza
`/notifications` (lista), `/notifications/unread-count` y las mutaciones
`PATCH /notifications/:id/read` y `PATCH /notifications/read-all`. Los avisos
ya enlazan a `/admin/pedidos/:id`, ruta que `safeInternalPath` permite.

> Las mutaciones de `/banner`, `/category`, `/dtf`, `/posts` y `/prices`
> fueron eliminadas en el refactor (§1.1). Las rutas `/admin/campaigns` hoy
> son la difusión por email real de ADM-7 (ver arriba), no el modelo antiguo
> de bloques de contenido.

### Ventas, gráficos y Spending Ring (ADM-6)

| Método | Ruta | Uso en el front |
|---|---|---|
| GET | `/admin/orders/ventas?periodo=dia\|semana\|mes\|anio` | Serie de la tarjeta principal (`metric-card`) |
| GET | `/admin/orders/accounting?from=&to=&provider=` | Anillo por proveedor, contabilidad y tablas |

Ambas lecturas se hacen desde el cliente (`apiGet`, cookie + `credentials`),
así que el selector de periodo y los filtros actualizan la vista sin recargar
la página. El backend revalida sesión y `orders.read` en cada petición.

- `ventas` cuenta **solo pagos settled** de pedidos no cancelados: la UI la
  etiqueta «Ventas liquidadas». El KPI grande es `actual` (cubo actual) y la
  comparación usa `anterior` (cubo previo); la serie completa alimenta el
  gráfico.
- `accounting` cubre un rango `from`/`to` (días de Bogotá) y filtra por
  `provider`. Sin filtros, el panel usa el mes en curso. `byProvider` alimenta
  el Spending Ring (Vendelo, Dropi, Sin proveedor) y `byPaymentMethodCode` la
  tabla de métodos de pago; `cod` alimenta el desglose COD por estado. Bruto y
  utilidad llevan etiquetas propias: nunca se mezclan con las ventas
  liquidadas.

### Difusión por email con Gmail (ADM-7)

| Método | Ruta | Uso en el front |
|---|---|---|
| GET | `/admin/campaigns/status` | Tarjeta de estado de Gmail y contador de cuota |
| GET | `/admin/campaigns/oauth/start` | «Conectar Gmail»: devuelve `{ url }` y fija la cookie `state`; el front navega a la URL |
| POST | `/admin/campaigns/audience` | Conteo + muestra del segmento antes de escribir el correo |
| POST | `/admin/campaigns/test-send` | Prueba obligatoria al correo del admin antes del envío real |
| POST | `/admin/campaigns` | Crea la campaña (exige step-up: `403 STEP_UP_REQUIRED` → `StepUpDialog`) |
| POST | `/admin/campaigns/:id/send` | Lote de 25; el front repite mientras `remaining > 0` y no haya techo diario |
| GET | `/admin/campaigns` | Historial en `/admin/difusion` |
| GET | `/public/campaigns/unsubscribe?token=` | Destino del enlace de baja del correo (responde HTML; el front `/baja` solo usa el código HTTP) |

Contrato de la página `/admin/difusion/email`:

- Sin `GMAIL_*` o sin token, `status` responde `configured: false` / `connected:
  false` y la UI muestra «Gmail no configurado» con un `inline-alert`: no se
  finge ningún envío ni se muestra el editor.
- Solo recibe quien tenga `marketingOptIn = true`, sin baja y sin rebote. Los
  admins, correos rebotados y cuentas desactivadas se excluyen en el backend.
- El envío se confirma con **Hold Button** (mantener presionado) y puede
  responder `403 STEP_UP_REQUIRED`: el panel abre `StepUpDialog` y reintenta.
- El envío corre lote a lote desde el cliente (25 por lote); si el backend
  reporta `dailyLimitReached`, se detiene y el cron continúa.
- Reintentar nunca duplica: la idempotencia la garantiza el backend con el
  índice único `(campaignId, userId)` y el reclamo de filas `pending`.
- Variables de plantilla: `{{nombre}}`, `{{ultimoPedido}}`, `{{ciudad}}`. Se
  renderizan y escapan en el servidor; la vista previa del panel usa valores
  de ejemplo.

La baja pública vive en `/baja` (`(store)/baja`, noindex): el correo de
campañas enlaza ahí con el `token` firmado; la página llama al endpoint
público y confirma en español. Un usuario dado de baja nunca vuelve a recibir
promociones, aunque siga dentro de una campaña ya creada.

### Difusión por WhatsApp (ADM-8)

| Método | Ruta | Uso en el front |
|---|---|---|
| GET | `/admin/whatsapp/status` | Estado de la Cloud API (`configured`, plantilla marketing, cuota) en `/admin/difusion/whatsapp` |
| POST | `/admin/whatsapp/test` | Prueba de plantilla SOLO al teléfono del admin |
| POST | `/admin/campaigns/whatsapp/audience` | Conteo de elegibles + `invalidCount` (teléfonos inválidos excluidos y reportados) |
| POST | `/admin/campaigns` con `channel: "whatsapp"` | Crea la campaña de WhatsApp (`{ channel, body, segment }`; exige step-up) |
| POST | `/admin/campaigns/:id/send-whatsapp` | Lote de 20 con plantilla Meta (`{{1}}` = mensaje renderizado); el front repite mientras `remaining > 0` |
| GET | `/admin/campaigns/:id/whatsapp/manual` | Filas del modo manual: mensaje + enlace `wa.me` |
| POST | `/admin/campaigns/:id/whatsapp/manual-sent` | Marca un envío manual hecho (idempotente) |
| GET | `/admin/campaigns/:id/whatsapp/export.csv` | Descarga CSV del modo manual |

Contrato de la página `/admin/difusion/whatsapp`:

- Consentimiento INDEPENDIENTE del email: `whatsappOptIn`, con baja por
  `whatsappUnsubscribedAt`. El opt-in de correo NO se hereda entre canales.
- Teléfonos en E.164 Colombia (`+57...`); los inválidos se excluyen y se
  muestran como `invalidCount` con un `inline-alert`.
- Con Cloud API configurada: mensaje con variables (`{{nombre}}`,
  `{{ultimoPedido}}`, `{{ciudad}}`), vista previa tipo burbuja, prueba
  obligatoria al teléfono del admin y envío por lotes de 20 con Hold Button +
  step-up. Errores de Meta se muestran por destinatario.
- SIN configuración: modo manual — «Abrir WhatsApp» (`wa.me` con texto
  precargado), copiar mensaje, exportar CSV y «Marcar enviado». Es envío uno
  a uno desde el WhatsApp del administrador; nunca se simula un envío
  automático.
- Librerías no oficiales (whatsapp-web.js, Baileys) quedan prohibidas.

### Clientes / usuarios (ADM-9)

| Método | Ruta | Uso en el front |
|---|---|---|
| GET | `/admin/users` | Listado `/admin/usuarios`: filtros `q`, `segment`, `consent`, `registeredFrom/To` + paginación por querystring; filas con `ordersCount` y `totalSpent` |
| GET | `/admin/users/export.csv` | Botón «Exportar CSV» (descarga con cookie del panel; sin password ni tokens) |
| GET | `/admin/users/:id` | Detalle `/admin/usuarios/[id]`: resumen, consentimientos, estado y direcciones |
| GET | `/admin/users/:id/orders` | Tabla de pedidos del cliente (enlace a `/admin/pedidos/:id`) |
| PATCH | `/admin/users/:id` | Edición de perfil y consentimientos (`users.write`); `disabled` responde `403 STEP_UP_REQUIRED` → `StepUpDialog`, acción disparada con Hold Button |

Contrato del detalle `/admin/usuarios/[id]`:

- Solo se editan `name`, `lastName`, `phone`, `address`,
  `marketingOptIn`, `whatsappOptIn` y `disabled`. El backend IGNORA `role`,
  `admin`, `password` y `email`: no se puede escalar a admin desde el panel.
- Editar recálcula `profileComplete` en el backend y devuelve `missing` (los
  campos que faltan, en español en la UI).
- `disabled: true` revoca sesiones (`tokenVersion`+1); `requireAuth` rechaza a
  los desactivados. La UI confirma con Hold Button y step-up.
- Los toggles de consentimiento no sobreescriben una baja formal
  (`unsubscribedAt` / `whatsappUnsubscribedAt` manda en la difusión).

### Rendimiento del panel (ADM-10)

- Índices dedicados aplicados por el backend al arrancar (idempotentes):
  `orders(provider, createdAt)`, `orders(userId, createdAt)`,
  `usuarios(createdAt)`, `campaign_recipients(status, sentAt)`. Detalle en
  `Back/README.md` (sección «Índices del panel»).
- Los listados del panel calculan resúmenes por fila con subconsultas (sin
  N+1) y acotan resultados: máx 100 filas por página en pedidos/usuarios,
  200 en campañas, paginación en auditoría.

### Cron

| Método | Ruta | Auth |
|---|---|---|
| GET | `/cron/sync-providers` | `Authorization: Bearer ${CRON_SECRET}` |
| GET | `/cron/campaigns` | `Authorization: Bearer ${CRON_SECRET}` — continúa el envío de campañas (un lote de 25 por corrida) |

## 2. Formato de datos clave

### Producto — contrato público (`GET /api/products`)

Tabla `products`. La respuesta pública **no** incluye `cost` ni `markup`.

```ts
{
  id: string;
  sku: string;                    // VEN-<externalId> para proveedores
  slug: string | null;            // URL de detalle (/producto/[slug])
  name: string;
  description: string | null;
  images: string[];               // principal primero; puede venir vacío
  price: number;                  // precio final COP (con descuento aplicado)
  priceBase: number;              // precio antes del descuento
  compareAtPrice: number | null;  // precio "antes"
  discountPercent: number;        // 0 si no hay descuento
  currency: "COP";
  stock: number;                  // unidades reales
  available: boolean;             // active && stock > 0
  sizes: string[];                // tallas; [] si no aplica
  combo: boolean;
  featured: boolean;              // destacadas
  categories: { id, name, slug }[];
  createdAt: string;
  badge?: "bestseller" | "nuevo" | null; // solo en GET /api/home
  categoryLabel?: string | null;         // primera categoría resuelta
}
```

Respuesta de listado: `{ products: Product[], total, limit, offset }`.

Reglas:

- Solo productos publicados y activos (`status="active"`, `active=true`).
- `price` llega como entero COP; el front solo formatea (ver `src/lib/format.ts`).
- `images` puede venir vacío: la UI ya tiene placeholders.
- Filtros: `q` (nombre), `category` (slug), `featured`, `new=1` (publicados en
  los últimos 30 días), `sort=best_sellers` (unidades vendidas de 90 días),
  `limit` (≤100), `offset`.

### Portada — `GET /api/home`

```ts
{
  sections: {
    featured: PublicProduct[];           // selección, máx. 4, badge null
    newArrivals: PublicProduct[];        // badge "nuevo"
    communityFavorites: PublicProduct[]; // badge "bestseller"
  };
  categories: { id, name, slug, description }[];
}
```

- Cada sección trae **como máximo 4** productos publicados y nunca repite un
  grid vacío en la UI (la sección no se renderiza si no hay productos).
- Prioridad: pines `manual` del panel → filas `default` de la semilla →
  relleno automático (destacadas, fecha o ventas según la sección).
- El `badge` depende de la sección donde se muestra, no es un campo del
  producto.
- `publishedAt` es la primera publicación real; «Novedades» usa
  `COALESCE(publishedAt, createdAt)`.
- El front lo consume con `getHomePayload()` (`revalidate: 60`); si falla,
  estado vacío honesto con enlace a `/productos`.

### Pedido (Order)

Campos relevantes para UI: `id`, `orderNumber`, `channel`, `fulfillmentStatus`, `paymentState`, `paymentMethodCode`, `currency`, `subtotal`, `shippingCost`, `discountTotal`, `total`, `recipientName`, `email`, `phone`, `address`, `city`, `department`, `postalCode`, `notes`, `shippingZone`, `estimatedDeliveryDays`, `paymentApprovedAt`, `trackingCarrier`, `trackingNumber`, `trackingUrl`, `shippedAt`, `deliveredAt`, `cancelledAt`, `canCancel`, `provider`, `providerStatus`, `providerOutOfSync`, `items[]` (OrderItem con snapshot), `addressSnapshot`, `history[]`, timestamps.

Estados:
- `fulfillmentStatus`: `pending_payment → paid → packing → shipped → delivered` (más cancelado).
- `paymentState`: `unpaid → pending_collection → collected → settled` (COD) o `paid`+`settled` (online).
- Transición inválida → 422. `shipped` sin guía → 422.

### Usuarios

`Usuarios`: `id`, `username`, `email`, `admin`, `name`, `lastName`, `phone`, `image`, `address`, `profileComplete` (calculado), `missing[]`, `defaultAddress`.

Perfil completo requiere **nombre, apellido, teléfono (≥7 dígitos) y una
dirección principal**. `missing[]` usa estos valores: `"name"`, `"lastName"`,
`"phone"`, `"address"`.

El teléfono se guarda normalizado a formato LATAM (`+57…`).

### Sesión

- `POST /auth/login` → usuario (sin `password`) + cookie `access_token`
  (`httpOnly`, 12 h). En dev `sameSite=lax`; en producción `none` + `secure`.
- `POST /auth/register` → texto `"Usuario creado con éxito"`; **no** emite
  sesión, así que el front inicia sesión después.
- `GET /auth/me` → usuario o 401.
- Los errores de auth llegan como **texto JSON** (`"Usuario Existente"`,
  `"Contraseña Errada"`), no como `{ message }`.

En el front:

- Las mutaciones usan `credentials: "include"` (`apiSend`).
- Los Server Components reenvían la cookie con `serverFetch` (`next/headers`).
- El middleware solo comprueba que la cookie **exista**; la validez la decide
  el backend. Una cookie caducada cae en `/login` sin bucles de redirección.
- `missing`/`profileComplete` se recalculan en el backend en cada cambio de
  perfil o de direcciones; el front solo los muestra.
- El navbar usa un marcador propio (`upbuy_session`, legible) para no sondear
  `/api/auth/me` en cada visita anónima. No es una credencial: si la cookie real
  caduca o apunta a un usuario borrado, la sonda devuelve 401/404, el marcador
  se limpia y el backend sigue siendo la única fuente de verdad.

### Direcciones (Address)

```ts
{
  id: string;
  userId: string;
  department: string | null;
  city: string | null;
  address: string;        // obligatoria
  reference: string | null;
  isDefault: boolean;
}
```

La primera dirección queda como principal automáticamente; si se borra la
principal, el backend promueve la más antigua. `isDefault`, `label`,
`recipientName`, `phone` y `postalCode` **no** forman parte de este modelo
(a diferencia del esquema anterior).

### Pedidos

Crear: `POST /api/orders` (sesión + perfil completo).

```ts
{
  items: { productId: string; quantity: number; size?: string | null }[];
  shipping?: { recipientName?, email?, phone?, address?, city?, department?, postalCode?, reference? };
  notes?: string;
}
```

Reglas del backend:

- `quantity` entre 1 y 20; máximo 50 líneas.
- `size` solo es **obligatorio** si el producto tiene tallas (`sizes.length > 0`)
  y no es `combo`. Un producto sin tallas (accesorio, cuidado personal) se
  pide sin talla.
- Precio, descuento, stock y total se resuelven siempre en el servidor.
- `shipping` es opcional: si falta, se completa con el perfil y la dirección
  principal. El pedido congela `addressSnapshot`.
- `shippingCost` es 0 y `shippingZone` "nacional" (tarifa fija pendiente).
- `estimatedDeliveryDays` = 10 hábiles (nacional).
- Errores: 403 `{ code: "PROFILE_INCOMPLETE", missing[] }`, 400 (talla o
  cantidad), 409 (producto agotado) y el resto como texto.

Confirmación: `GET /api/orders/:id` (dueño o admin) devuelve el pedido con
`items`, `payments`, `history` y `canCancel`.

### Cancelación y seguimiento

- `GET /api/orders/:id` y el listado incluyen `canCancel`. La regla vive en
  `Back/Services/statusMachine.js` (`canCustomerCancel`): se puede cancelar en
  `pending_payment` (Wompi impago) o `paid` (COD confirmado), nunca con el
  dinero `settled`/`refunded`/`collected` ni desde `packing`.
- `POST /api/orders/:id/cancel` (sesión, dueño) devuelve el pedido actualizado.
  Si el estado cambió desde que se cargó la ficha responde `409`.
- `GET /api/orders/:id/tracking?phone=&email=` es **público** y exige el UUID
  del pedido (no `orderNumber`) más teléfono o correo coincidentes. Responde
  `404` genérico si no coinciden. Devuelve solo: `orderNumber`,
  `fulfillmentStatus`/`paymentState` + etiquetas, `message`, `tracking`
  (carrier/number/url), `estimatedDeliveryDays` y `dates`
  (createdAt/shippedAt/deliveredAt/cancelledAt). No expone dirección ni
  contacto.
- El front lo usa en `/seguimiento/[id]` (`noindex`) y enlaza desde
  `/pedido/[id]` y `/cuenta/pedidos`.

### Notificaciones

- `GET /api/notifications?limit=&offset=` → `{ notifications, total, unread,
  limit, offset }`. Cada fila trae `titulo`, `texto`, `tipo` (`pedido` |
  `cuenta`), `to` (ruta interna o null), `leida`, `createdAt`.
- `GET /api/notifications/unread-count` → `{ count }`.
- `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`,
  `DELETE /api/notifications/:id` y `DELETE /api/notifications` (204).
- El front muestra una campana con contador en el navbar (solo si existe el
  marcador de sesión) y la bandeja en `/cuenta/notificaciones` (`noindex`).
- Los enlaces `to` se filtran con `safeInternalPath`: solo rutas internas y
  nunca `/admin/*` (el front público no tiene panel administrativo).

### Pagos (Wompi)

- `POST /api/payments/intent` `{ orderId, provider: "wompi" }` →
  `{ provider, url, reference, amountInCents, currency, env }`.
  Es la URL de Web Checkout a la que se redirige al comprador.
- `POST /api/orders/:id/payment/verify` `{ transactionId }` →
  `{ applied, reason, status }`. Respaldo del webhook.
- El webhook (`/api/webhooks/wompi`) es la fuente real de confirmación.
- La URL de retorno la arma el backend como
  `${FRONTEND_URL}/mis-pedidos/:id`; Wompi añade `?id=<transactionId>`.
  Por eso el front expone `/mis-pedidos/[id]`.
- Requisitos: `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`,
  `WOMPI_EVENTS_SECRET` y una URL de retorno **pública** (Wompi bloquea
  localhost con 403). Sin eso los endpoints responden 503.

### Problemas conocidos del backend

**✅ Resuelto — `categoryInclude` mutaba un objeto compartido.**

`catalogQuery.service.js` usaba un único objeto `categoryInclude` que
`listPublished` mutaba al filtrar, dejando el filtro fijo para todo el proceso
(una petición con `?category=` rompía el resto del catálogo).

Ya está corregido: el include es una función que devuelve un objeto nuevo por
consulta (`categoryInclude(where)`), usada como `categoryInclude()` en
`getBySlugOrSku`/`listAdmin`/`getAdmin` y `categoryInclude({ slug })` en
`listPublished`.

Verificado en vivo: `total=6` → `?category=camisetas` (1) → `total=6`, y los
detalles de otras categorías responden 200.

**✅ Resuelto — `POST /api/orders` ya acepta `paymentMethodCode`.**

El controlador lee el método y el servicio fija los estados iniciales según la
pasarela:

| Método | `paymentMethodCode` | `fulfillmentStatus` | `paymentState` |
|---|---|---|---|
| Pago en línea | `wompi` | `pending_payment` | `unpaid` |
| Contra entrega | `cod_vendelo` / `cod_dropi` | `paid` | `pending_collection` |

- Solo se aceptan los métodos que el checkout web puede ofrecer (`wompi` y los
  códigos COD). Cualquier otro valor cae a `wompi` en lugar de guardar un código
  inválido.
- En COD el cumplimiento se libera al confirmar (`paid`) y el dinero entra al
  entregar (`pending_collection`), según `statusMachine.js`.
- Un pedido COD no se puede cobrar en línea: `createCheckoutForOrder` exige
  `pending_payment`, y el front solo muestra «Pagar ahora» si el método es
  Wompi.

Verificado en vivo: pedido COD → `cod_vendelo / pending_collection / paid`;
pedido Wompi → `wompi / unpaid / pending_payment`; código inválido → `wompi`.

El front sigue mostrando un aviso si el pedido vuelve con un método distinto al
elegido (respaldo ante un fallback inesperado).

## 3. Funcionalidades disponibles vs. pendientes

| Funcionalidad | Estado backend | Front |
|---|---|---|
| Catálogo / listado de productos | ✅ `/products` | ✅ `/productos` (búsqueda, categoría, destacados, novedades, más vendidos, paginación) |
| Detalle de producto | ✅ `/products/:slug` | ✅ `/producto/[slug]` (galería, ficha, relacionados, JSON-LD) |
| Categorías | ✅ `/categories` · `/admin/categories` | ✅ Pills de filtro en `/productos`, portada en el home y alta/asignación múltiple en la ficha del producto |
| Importar/sincronizar catálogo | ✅ `/admin/suppliers/venndelo/*` · `/admin/suppliers/mastershop/*` | ✅ `/admin/proveedores/venndelo` y `/admin/proveedores/mastershop` (catálogo, política de publicación, publicación, stock, precio, historial) |
| Curaduría del catálogo UPBUY | ✅ `/admin/products/*` + bandeja global `/admin/products/unpublished` + `PATCH /settings` | ✅ `/admin/catalogo` (filtros, selección múltiple, lote, drawer de ficha, bandeja global) |
| Catálogo en la Home | ✅ `/home` | ✅ Home con secciones reales, estado vacío honesto, `sitemap.xml` solo con productos reales |
| Curaduría de la portada | ✅ `/admin/products/home-sections` | ✅ `/admin/catalogo?tab=home` (3 columnas de 4 ranuras, orden, buscador, ranking, badges de sección en el listado) |
| Catálogo de Dropi | ❌ Sin API de catálogo; carga manual | N/A (decisión: sin importador CSV por ahora) |
| Venta manual | ✅ `/admin/orders/manual` (+ `/preview`) | ✅ `/admin/pedidos/nuevo` |
| Importación CSV de pedidos | ✅ `/admin/orders/import` | ✅ `/admin/pedidos/importar` (vista previa + confirmación) |
| Exportación CSV de pedidos | ✅ `/admin/orders/export.csv` | ✅ `/admin/proveedores/pedidos` |
| Avisos de compra en vivo | ✅ `/admin/orders/recent` | ✅ Pila en todo el panel + `/admin/notificaciones` |
| DTF por categoría | ❌ Ya no aplica (DTF retirado) | Ya no aplica como fuente separada |
| Tarifa de precios / variantes | ❌ Eliminado (antes `/prices`) | **Bloqueado** |
| Envío (rates/quote) | ❌ Eliminado (antes `/shipping/*`) | **Bloqueado** (se resolverá en checkout) |
| Sync de proveedores (Vendelo/Dropi) | ✅ `/cron/sync-providers` (Bearer `CRON_SECRET`) | N/A (backend) |
| Proveedores (lista/estado) | ✅ `/admin/suppliers/overview` + `/admin/orders/providers` | ✅ `/admin/proveedores` (tarjetas, salud, contador, sync) |
| Registro/login/logout | ✅ `/auth/*` | ✅ `/login`, `/registro` (incluye Google y Facebook, mostrar/ocultar contraseña y MFA de administradores) |
| Perfil y direcciones | ✅ `/users/me*` | ✅ `/cuenta/perfil`, `/cuenta/direcciones` |
| Pedidos (crear/listar/detalle) | ✅ `/orders*` | ✅ Crear, confirmar y listar (`/checkout`, `/pedido/[id]`, `/cuenta/pedidos`) |
| Cancelar pedido | ✅ `/orders/:id/cancel` + `canCancel` | ✅ `/pedido/[id]` (FASE 7) |
| Tracking público | ✅ `/orders/:id/tracking` | ✅ `/seguimiento/[id]` (FASE 7) |
| Pago Wompi | ✅ `/orders/:id/payment`, `/payment/verify`, `/payments/intent` | ✅ `/pedido/[id]` + `/mis-pedidos/[id]` (requiere `WOMPI_*`) |
| Webhooks Wompi/Vendelo | ✅ firmados | N/A (backend) |
| Notificaciones | ✅ `/notifications/*` | ✅ Campana en navbar + `/cuenta/notificaciones` (FASE 8) |
| Difusión por email (campañas) | ✅ `/admin/campaigns/*` + `/public/campaigns/unsubscribe` (ADM-7) | ✅ `/admin/difusion` (historial), `/admin/difusion/email` (composición + envío con Hold Button y step-up), `/baja` (pública). Requiere `GMAIL_*` + `GMAIL_TOKEN_ENCRYPTION_KEY`; sin ellas la UI lo informa y no envía |
| Difusión por WhatsApp | ✅ `/admin/whatsapp/*` + `/admin/campaigns/*` (canal whatsapp, ADM-8) | ✅ `/admin/difusion/whatsapp`: con Cloud API, prueba + lotes de 20; sin configuración, modo manual (wa.me, copiar, CSV). Requiere `WHATSAPP_*` + plantilla Meta aprobada |
| Clientes / usuarios | ✅ `/admin/users` (listado + filtros + `export.csv`), `/admin/users/:id`, `/admin/users/:id/orders`, `PATCH /admin/users/:id` (ADM-9) | ✅ `/admin/usuarios` (búsqueda, filtros por compras/consentimiento/fecha, paginación, CSV), `/admin/usuarios/[id]` (datos, direcciones, pedidos, consentimientos email/WhatsApp, edición y desactivación con Hold Button + step-up), `/admin/perfil` (solo lectura de identidad). El backend ignora `role`/`admin`/`password`: no hay escalada desde el panel |
| Banners | ❌ Eliminado | La Home usa contenido propio |
| Campañas email (v1, banners/bloques) | ❌ Eliminado en el refactor | No aplica (la difusión real es ADM-7, ver fila anterior) |
| Admin pedidos/usuarios | ✅ | ✅ Pedidos (`/admin/pedidos`); usuarios pendiente |
| Newsletter (suscripción) | ❌ No existe endpoint | En la Home (FASE 2): el formulario declara la integración pendiente y **no** simula la suscripción ni almacena el correo |
| Contacto | ❌ No existe endpoint | `/contacto` declara la integración pendiente y no envía ni almacena el formulario |
| Productos relacionados | ❌ No hay endpoint dedicado | Se resuelven en el front con `/products?category=<slug>` excluyendo el actual |
| Dropi API | ⚠️ Modo manual por defecto (API si hay credenciales) | Mostrar estados pendientes de gestión |

## 4. Integración: reglas

- No duplicar lógica de negocio ni crear segunda API.
- No inventar endpoints; si falta, documentar como pendiente y no simular.
- El backend valida precios, disponibilidad y pago; el front no confía en el navegador.
- Confirmación de pago real depende del backend/webhook, nunca de la redirección.
- Wompi: usar flujo ya implementado (`/orders/:id/payment` → checkout Wompi → `/payment/verify`).
- Proveedores: comunicación solo desde backend; el front consume estados canónicos.
- Estados de pago y logística separados.
- No exponer secretos (`WOMPI_*`, `JWT_SECRET`, etc.) en el front.

## 5. Variables de entorno del front

Se usan tres. El mercado está fijado en `src/config/market.config.ts`
(Colombia, COP, `es-CO`), así que no hay variables separadas para país/moneda
hasta que exista un segundo mercado.

```
NEXT_PUBLIC_API_URL=http://localhost:3000   # backend (sin barra final)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=               # Client ID público de GIS
NEXT_PUBLIC_FACEBOOK_APP_ID=                # App ID público de Meta
```

Las tres se **incrustan en build**: al cambiar la URL del backend o cualquiera
de los IDs hay que volver a desplegar el frontend. Los secretos del backend
(de Google, Facebook, JWT, etc.) viven solo allí y no se copian a `Front/`.

Plantilla versionada: `Front/.env.example`. Los valores reales van en
`Front/.env.local` (ignorado por git).

El backend usa `FRONTEND_URL` para CORS. En desarrollo `Back/config.js` ya
apunta a `http://localhost:3001`, que es el puerto fijo del frontend
(`npm run dev` en `Front/package.json` usa `next dev -p 3001`). En producción
se define `FRONTEND_URL` como variable de entorno.

**Convención de puertos:** frontend en `3001`, API en `3000`. El backend fija
`PORT=3000` en `Back/.env.local`; en Vercel la plataforma inyecta `PORT`.
