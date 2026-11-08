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
# Vendelo
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

## 6. Agregar un proveedor nuevo

1. Crear `Services/providers/<nombre>.client.js` cumpliendo el contrato.
2. Registrarlo en `CLIENTS` de `Services/providers/index.js`.
3. Añadir el valor al enum `PROVIDER` en `DataBase/models/enums.js`.
4. Añadir sus palabras clave en `OVERRIDES_POR_PROVEEDOR`
   (`Services/statusMachine.js`) si su vocabulario no está cubierto.
5. Añadir las variables al `.env.example`.

No hay que tocar `syncService`, `orderService` ni las rutas.
