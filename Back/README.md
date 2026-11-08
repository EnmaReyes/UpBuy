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
| `npm run db:migrate` | Aplica la migración idempotente |
| `npm run db:verify-migration` | Prueba destructiva de la migración (15/15) |
| `npm run db:create` | Crea la base local |

La migración es **idempotente** (`DataBase/ensureDropshippingSchema.js`) y corre
sola al arrancar. No usa `sequelize-cli`.

---

## 3. Arquitectura

```
Back/
  index.js              app de Express + bootstrap de la base
  api/index.js          entry point de Vercel
  config.js             lectura/validación de variables de entorno
  DataBase/
    models/             modelos Sequelize + enums canónicos
    ensureDropshippingSchema.js
  Services/
    statusMachine.js    reglas puras de estados (sin DB)
    orderService.js     transiciones + auditoría + historial
    orders.js           alta/baja/tracking de pedidos
    payments.js         ciclo del intento de pago
    accounting.js       contabilidad por rango
    profile.js          perfil completo + normalización de teléfono
    addresses.js        direcciones del comprador
    catalog.js          vista unificada articulos + dtfs
    providers/          adaptadores Vendelo / Dropi
    syncService.js      sincronización IN/OUT
    webhookEvents.js    idempotencia de webhooks
    wompi.js / vendeloWebhook.js
    cron.js             corrida periódica
  Controllers/          capa HTTP delgada
  Rutas/                routers de Express
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
| GET | `/api/products` | Catálogo unificado (articulos + dtfs) |
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

## 7. Proveedores

Contrato, variables y modo manual de Dropi: [`docs/PROVEEDORES.md`](docs/PROVEEDORES.md).

Resumen:

- **Vendelo**: API. Rutas configurables por `VENDELO_PATH_*` (no confirmadas
  hasta validarlas con su documentación).
- **Dropi**: sin API pública confirmada. Modo **manual** por defecto: registra
  la exportación en `sync_logs` y genera CSV para el panel.

Sin credenciales, el proveedor no se llama: el flujo manual sigue funcionando.

---

## 8. Despliegue (Vercel)

`vercel.json`:

- build de `api/index.js` (`@vercel/node`),
- rewrites de `/api/*` y del resto del sitio,
- cron diario `0 12 * * *` (plan Hobby = 1 corrida/día).

`api/index.js` exporta la app de Express. La base se inicializa una vez por
instancia en el primer request (`ensurePricingSchema` +
`ensureDropshippingSchema`), sin `sequelize.sync()` en producción.

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
