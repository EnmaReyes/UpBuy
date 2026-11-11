# BACKEND_INTEGRATION.md — E-commerce Frontend

Base URL: `NEXT_PUBLIC_API_URL` (dev: `http://localhost:3000`). Todas las rutas bajo `/api/*`.

Autenticación: cookie `httpOnly` `access_token` (JWT, 12h). El frontend nunca lee el token; las peticiones deben usar `credentials: "include"`. CORS permite `FRONTEND_URL`.

## 1. Endpoints disponibles

> **Cambio importante (refactor en curso, ver §1.1):** el backend migró a un
> modelo de dropshipping (Vendelo/Dropi). Los endpoints de catálogo, precios,
> envío, DTF, posts, banners y campañas **fueron eliminados**. La FASE 3 queda
> bloqueada hasta que exista un endpoint público de catálogo.

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
| POST | `/orders/:id/cancel` | Cancelar (solo `pending_payment`) | — |
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
  oversize: boolean;
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

Campos relevantes para UI: `id`, `orderNumber`, `channel`, `fulfillmentStatus`, `paymentState`, `paymentMethodCode`, `currency`, `subtotal`, `shippingCost`, `discountTotal`, `total`, `recipientName`, `email`, `phone`, `address`, `city`, `department`, `postalCode`, `notes`, `shippingZone`, `estimatedDeliveryDays`, `paymentApprovedAt`, `trackingCarrier`, `trackingNumber`, `trackingUrl`, `provider`, `providerStatus`, `providerOutOfSync`, `items[]` (OrderItem con snapshot), `addressSnapshot`, timestamps.

Estados:
- `fulfillmentStatus`: `pending_payment → paid → packing → shipped → delivered` (más cancelado).
- `paymentState`: `unpaid → pending_collection → collected → settled` (COD) o `paid`+`settled` (online).
- Transición inválida → 422. `shipped` sin guía → 422.

### Usuarios

`Usuarios`: `id`, `username`, `email`, `admin`, `profileComplete` (calculado), `missing[]`, `defaultAddress`. Perfil completo requiere nombre, apellido, teléfono y dirección principal.

### Direcciones (Address)

`id`, `userId`, `label`, `recipientName`, `phone`, `address`, `city`, `department`, `postalCode`, `isDefault`.

## 3. Funcionalidades disponibles vs. pendientes

| Funcionalidad | Estado backend | Front |
|---|---|---|
| Catálogo / listado de productos | ✅ `/products` | **Por conectar**: `/productos` aún con mock |
| Detalle de producto | ✅ `/products/:slug` | **Por conectar**: `/producto/[slug]` |
| Categorías | ✅ `/categories` | **Por conectar**: filtros por categoría |
| Importar/sincronizar catálogo | ✅ `/admin/suppliers/venndelo/*` | Admin UI pendiente |
| DTF por categoría | ❌ Ya no aplica (DTF retirado) | Ya no aplica como fuente separada |
| Tarifa de precios / variantes | ❌ Eliminado (antes `/prices`) | **Bloqueado** |
| Envío (rates/quote) | ❌ Eliminado (antes `/shipping/*`) | **Bloqueado** (se resolverá en checkout) |
| Sync de proveedores (Vendelo/Dropi) | ✅ `/cron/sync-providers` (Bearer `CRON_SECRET`) | N/A (backend) |
| Proveedores (lista/estado) | ✅ `/admin/orders/providers` | Admin UI pendiente |
| Registro/login/logout | ✅ `/auth/*` + social | Pendiente (FASE 4) |
| Perfil y direcciones | ✅ `/users/me*` | Pendiente (FASE 4) |
| Pedidos (crear/listar/detalle) | ✅ `/orders*` | Pendiente (FASE 5) |
| Cancelar pedido | ✅ `/orders/:id/cancel` | Pendiente |
| Tracking público | ✅ `/orders/:id/tracking` | Pendiente |
| Pago Wompi | ✅ `/orders/:id/payment`, `/payment/verify`, `/payments/intent` | Pendiente |
| Webhooks Wompi/Vendelo | ✅ firmados | N/A (backend) |
| Notificaciones | ✅ `/notifications/*` | Pendiente |
| Banners | ❌ Eliminado | La Home usa contenido propio |
| Campañas email | ❌ Eliminado | Ya no aplica |
| Admin pedidos/usuarios | ✅ | Admin UI pendiente |
| Newsletter (suscripción) | ❌ No existe endpoint | En la Home (FASE 2): el formulario declara la integración pendiente y **no** simula la suscripción ni almacena el correo |
| Contacto | ❌ No existe endpoint | `/contacto` declara la integración pendiente y no envía ni almacena el formulario |
| Productos relacionados | ❌ No endpoint | Pendiente |
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

## 5. Variables de entorno del front (a definir en FASE 1)

```
NEXT_PUBLIC_API_URL=http://localhost:3000   # backend
NEXT_PUBLIC_MARKET=CO
NEXT_PUBLIC_CURRENCY=COP
NEXT_PUBLIC_LOCALE=es-CO
```

El backend usa `FRONTEND_URL` para CORS (dev: `http://localhost:5173`); al pasar
a Next.js hay que actualizar `FRONTEND_URL` en `Back/.env.local` al puerto real
del frontend.

**Nota de entorno (FASE 2):** en esta máquina el puerto 3000 lo ocupa otro
proceso, así que el frontend Next de desarrollo corre en
`http://localhost:3001`. `Back/.env.local` debe declarar
`FRONTEND_URL=http://localhost:3001` antes de que la FASE 3 consuma la API
desde el navegador. Alternativa: detener el proceso que ocupa el 3000 y dejar
Next en el puerto por defecto.
