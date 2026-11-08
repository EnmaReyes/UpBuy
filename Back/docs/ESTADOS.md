# Modelo de estados y contratos — Upbuy (dropshipping)

Upbuy es la **fuente de verdad**. Ni el usuario ni el administrador ven los
estados crudos de Dropi o Vendelo: esos se mapean a los estados canónicos de
este documento.

---

## 1. Los dos ciclos

El pedido tiene **dos ciclos independientes**. Nunca se mezclan en un solo campo.

| Campo | Qué responde |
|---|---|
| `fulfillmentStatus` | ¿Dónde va el pedido **físicamente**? |
| `paymentState` | ¿Dónde va el **dinero**? |

> `fulfillmentStatus = "paid"` significa **"cumplimiento liberado"**, NO
> "dinero cobrado". En COD el cumplimiento se libera al confirmar el pedido
> (el courier garantiza el cobro) y el dinero entra al entregar.

### Ciclo de cumplimiento

```
pending_payment → paid → packing → shipped → delivered
       │            │        │         │
       └────────────┴────────┴─────────┴──→ cancelled
```

`delivered` y `cancelled` son terminales. De `delivered` solo sale un
reembolso (ciclo del dinero).

### Ciclo del dinero

```
unpaid → pending_collection → collected → settled
   │            │                 │           │
   └────────────┴─────────────────┴───────────┴──→ refunded
```

`refunded` es terminal.

---

## 2. Vocabulario

### `fulfillmentStatus`

| Valor | Significado | Lo ve el usuario como |
|---|---|---|
| `pending_payment` | Pedido confirmado, sin liberar | "Pedido confirmado, pagas al recibir" |
| `paid` | Cumplimiento liberado | "Pagado ✓" |
| `packing` | En preparación | "En preparación" |
| `shipped` | Despachado, con guía | "En camino — pagas al recibir" (COD) |
| `delivered` | Entregado | "Entregado ✓" |
| `cancelled` | Cancelado / devuelto | "Devolución" |

### `paymentState`

| Valor | Significado |
|---|---|
| `unpaid` | No se ha cobrado nada |
| `pending_collection` | El courier va a cobrar (COD en camino) |
| `collected` | El courier cobró, el dinero no está en nuestra cuenta |
| `settled` | El dinero está liquidado en nuestra cuenta |
| `refunded` | Se devolvió el dinero |

### `paymentMethodCode`

| Valor | Significado |
|---|---|
| `wompi` | Pago online con Wompi |
| `vendelo` | Pago online con Vendelo |
| `cod_dropi` | Pago contra entrega, courier Dropi |
| `cod_vendelo` | Pago contra entrega, courier Vendelo |

Los dos últimos son **COD**: el dinero entra *después* de la entrega.

### `provider`

`vendelo` | `dropi` — de qué proveedor logístico sale el pedido.

### `statusSource`

Quién produjo el último cambio. Es lo que permite que el auto-sync (cron)
**no pise** un cambio manual del administrador.

| Valor | Significado |
|---|---|
| `auto_sync` | Lo puso el cron al leer el estado del proveedor |
| `manual_admin` | Un admin lo cambió, sin empujarlo al proveedor |
| `manual_admin_pushed` | Un admin lo cambió y el push al proveedor funcionó |
| `webhook` | Lo puso un webhook del proveedor |

---

## 3. Matriz de referencia

| Escenario | fulfillment | payment | Ve el usuario | Ve el admin |
|---|---|---|---|---|
| COD recién creado | `pending_payment` | `unpaid` | "Pedido confirmado, pagas al recibir" | Por despachar |
| COD en camino | `shipped` | `pending_collection` | "En camino — pagas al recibir" | Por cobrar |
| COD entregado y cobrado | `delivered` | `collected` | "Entregado ✓" | Por liquidar con proveedor |
| COD rechazado / devolución | `cancelled` | `unpaid` | "Devolución" | Pérdida (flete) |
| Wompi/Vendelo online pagado | `paid` | `settled` | "Pagado ✓" | Listo para packing |

---

## 4. Reglas del servidor

Estas reglas se validan **siempre en el backend**. El front nunca decide un
estado por su cuenta.

1. **Transición inválida → `422`.** (No `400`, no `409`: el estado es válido
   como valor, lo que no es válido es la transición.)
2. **`shipped` exige guía** (`trackingNumber` o `trackingUrl`). Sin guía →
   `422`.
3. **COD: `shipped` → `paymentState = pending_collection`** (automático).
4. **COD: `delivered` → `paymentState = collected`** (automático).
5. **Pago online confirmado → `paymentState = settled` + `fulfillmentStatus = paid`.**
6. **Todo cambio se guarda en Upbuy.** Un push fallido al proveedor **no**
   revierte el cambio local: marca `providerOutOfSync = true` y avisa al admin.
7. **El auto-sync nunca pisa `manualOverride = true`.**
8. **Todo cambio deja rastro** en `audit_logs` (quién, qué, antes, después, IP).
9. **Los webhooks son idempotentes**: `webhook_events` tiene unique
   `(provider, eventId)`. Reprocesar el mismo evento no duplica pagos.
10. **Nunca se confía el monto del front.** Al procesar un pago se relee el
    total desde `Order`.

---

## 5. Contabilidad

Por pedido:

```
netProfit = subtotal + shippingCost - providerCost - gatewayFee - providerFee
```

En `Payment`:
`amount`, `collectedAt`, `settledAt`, `payoutAmount`, `payoutDate`.

El panel separa dos cosas que se confunden fácil:

- **Utilidad ganada** — pedidos entregados. Es lo que se ganó.
- **Efectivo recibido** — COD liquidado (`settled`). Es lo que hay en caja.

Un pedido COD entregado puede tener utilidad ganada y todavía no tener un
peso en caja: la diferencia es la que se está financiendo con el flete.

---

## 6. Proveedores

### Contrato común (`Services/providers/`)

```js
{
  async listProducts(page) {},              // catálogo
  async createOrder(orderPayload) {},       // crear el pedido en el proveedor
  async getOrderStatus(providerOrderId) {}, // leer el estado crudo
  async updateOrderStatus(id, status) {},   // push del cambio manual
}
```

### Vendelo

Tiene API. Las rutas reales van en constantes en `vendelo.client.js`: no se
inventan. Sin `VENDELO_API_URL` / `VENDELO_TOKEN` el proveedor no está
conectado y sus rutas responden `503`.

### Dropi

**No tiene API pública confirmada.** El adaptador funciona en modo manual:

- `createOrder` **no falla**: registra el pedido como "listo para carga manual"
  en `sync_logs` (`direction: "out"`, `ok: true`).
- `exportOrderForDropiCsv(order)` devuelve un objeto listo para pegar en el
  panel de Dropi.

Si el proveedor habilita la API, se configuran `DROPI_API_URL` y
`DROPI_TOKEN` y el mismo adaptador la usa, sin tocar el resto del sistema.

### Mapeo de estados

`mapProviderToCanonical(provider, providerStatus)` devuelve
`{ fulfillmentStatus?, paymentState? }`. El estado crudo se guarda siempre en
`orders.providerStatus` para poder auditar el mapeo.

---

## 7. Gating de perfil

Antes de comprar, el usuario debe tener: nombre, apellido, teléfono y
dirección principal.

`POST /api/orders` sin perfil completo →

```json
{ "code": "PROFILE_INCOMPLETE", "missing": ["phone", "address"] }
```

con `403`. El front abre el modal con esos campos.

Los teléfonos se guardan en E.164 (`+573001234567`), que es el único formato
que los couriers aceptan sin ambigüedad.
