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
| GET | `/products?q=&category=&featured=&limit=&offset=` | **Catálogo publicado** | ver §2 |
| GET | `/products/:slug` | **Detalle** (slug, sku o id) | ver §2 |
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
- El stock son **unidades reales**; si llega a 0, el producto se desactiva y
  desaparece del listado.
- Las categorías son **internas de Upbuy** (el proveedor no las entrega):
  `/api/products?category=<slug>` filtra por slug de categoría.
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
| POST | `/auth/google` | Login social Google | token Google | Usuario + cookie |
| POST | `/auth/facebook` | Login social Facebook | token Facebook | Usuario + cookie |

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

Incluye: `/admin/orders` (+ stats, ventas, accounting, providers, manual, status, tracking, sync, push, payments) y `/admin/users`.

> Las mutaciones de `/admin/campaigns`, `/banner`, `/category`, `/dtf`,
> `/posts` y `/prices` fueron eliminadas en el refactor (§1.1).

### Cron

| Método | Ruta | Auth |
|---|---|---|
| GET | `/cron/sync-providers` | `Authorization: Bearer ${CRON_SECRET}` |

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
}
```

Respuesta de listado: `{ products: Product[], total, limit, offset }`.

Reglas:

- Solo productos publicados y activos (`status="active"`, `active=true`).
- `price` llega como entero COP; el front solo formatea (ver `src/lib/format.ts`).
- `images` puede venir vacío: la UI ya tiene placeholders.
- Filtros: `q` (nombre), `category` (slug), `featured`, `limit` (≤100), `offset`.

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
| Catálogo / listado de productos | ✅ `/products` | ✅ `/productos` (búsqueda, categoría, destacados, paginación) |
| Detalle de producto | ✅ `/products/:slug` | ✅ `/producto/[slug]` (galería, ficha, relacionados, JSON-LD) |
| Categorías | ✅ `/categories` | ✅ Pills de filtro en `/productos` |
| Importar/sincronizar catálogo | ✅ `/admin/suppliers/venndelo/*` | Admin UI pendiente |
| DTF por categoría | ❌ Ya no aplica (DTF retirado) | Ya no aplica como fuente separada |
| Tarifa de precios / variantes | ❌ Eliminado (antes `/prices`) | **Bloqueado** |
| Envío (rates/quote) | ❌ Eliminado (antes `/shipping/*`) | **Bloqueado** (se resolverá en checkout) |
| Sync de proveedores (Vendelo/Dropi) | ✅ `/cron/sync-providers` (Bearer `CRON_SECRET`) | N/A (backend) |
| Proveedores (lista/estado) | ✅ `/admin/orders/providers` | Admin UI pendiente |
| Registro/login/logout | ✅ `/auth/*` | ✅ `/login`, `/registro` (social **no** implementado) |
| Perfil y direcciones | ✅ `/users/me*` | ✅ `/cuenta/perfil`, `/cuenta/direcciones` |
| Pedidos (crear/listar/detalle) | ✅ `/orders*` | ✅ Crear, confirmar y listar (`/checkout`, `/pedido/[id]`, `/cuenta/pedidos`) |
| Cancelar pedido | ✅ `/orders/:id/cancel` + `canCancel` | ✅ `/pedido/[id]` (FASE 7) |
| Tracking público | ✅ `/orders/:id/tracking` | ✅ `/seguimiento/[id]` (FASE 7) |
| Pago Wompi | ✅ `/orders/:id/payment`, `/payment/verify`, `/payments/intent` | ✅ `/pedido/[id]` + `/mis-pedidos/[id]` (requiere `WOMPI_*`) |
| Webhooks Wompi/Vendelo | ✅ firmados | N/A (backend) |
| Notificaciones | ✅ `/notifications/*` | ✅ Campana en navbar + `/cuenta/notificaciones` (FASE 8) |
| Banners | ❌ Eliminado | La Home usa contenido propio |
| Campañas email | ❌ Eliminado | Ya no aplica |
| Admin pedidos/usuarios | ✅ | Admin UI pendiente |
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

Solo se usa una. El mercado está fijado en `src/config/market.config.ts`
(Colombia, COP, `es-CO`), así que no hay variables separadas para país/moneda
hasta que exista un segundo mercado.

```
NEXT_PUBLIC_API_URL=http://localhost:3000   # backend (sin barra final)
```

Plantilla versionada: `Front/.env.example`. El valor real va en `Front/.env.local`
(ignorado por git).

El backend usa `FRONTEND_URL` para CORS (dev: `http://localhost:5173`); al pasar
a Next.js hay que actualizar `FRONTEND_URL` en `Back/.env.local` al puerto real
del frontend.

**Nota de entorno (FASE 2):** en esta máquina el puerto 3000 lo ocupa otro
proceso, así que el frontend Next de desarrollo corre en
`http://localhost:3001`. `Back/.env.local` debe declarar
`FRONTEND_URL=http://localhost:3001` antes de que la FASE 3 consuma la API
desde el navegador. Alternativa: detener el proceso que ocupa el 3000 y dejar
Next en el puerto por defecto.
