# Fase A — Análisis estático y validación del flujo de pedidos MasterShop

**Fecha:** 2026-11-26
**Alcance:** solo lectura + `npm test`. Sin red, sin cambios de código.
**Base:** `main`. Suite `Back`: **306/306 tests pasan** (120 s).

---

## 1. Resumen ejecutivo

El flujo «pago Wompi aprobado → pedido MasterShop» está **bien construido en su
arquitectura** (outbox, idempotencia, reintentos, redacción de secretos,
aislamiento de proveedores). La causa del fallo **no está en el aislamiento ni
en el encolado**: está en **(a)** la consistencia del identificador externo y
**(b)** posiblemente en detalles del payload contra la API real (el `500` opaco
documentado el 2026-11-24).

Hallazgos accionables, en orden de severidad:

| # | Severidad | Hallazgo |
| --- | --- | --- |
| 1 | **Alta** | El `id_order` que se **envía** (`order.orderNumber`) no coincide con el `externalOrderId` que se usa para **recuperar duplicados** y para **conciliar** (la `reference` de Wompi). Rompe la idempotencia y la conciliación. |
| 2 | **Media (latente)** | `additionalCharge` siempre vacío frente a `total = subtotal - descuento + envío`: si algún día hay envío o descuento manual, `buildOrderPayload` rechaza el pedido (`payload_invalido`). Hoy no se dispara porque el envío web es 0. |
| 3 | **Media** | `splitName()` no sanea dígitos/símbolos en el nombre; MasterShop exige «solo letras y espacios». Riesgo de 400. |
| 4 | **Baja / a confirmar** | `payment_gateway: "Wompi"` se envía siempre (y `buildOrderPayload` lo exige), pero el ejemplo del contrato no lo manda. Candidato a parte del `500`. |
| 5 | **Baja / a confirmar** | Se envían arrays vacíos (`additional_charge: []`, `notes: []`, `tags: []`). Si MasterShop valida «si viene, con elementos», podría ser parte del `500`. |
| 6 | **Baja** | `payment_method` fijo en `"pia"` con TODO pendiente; correcto para Wompi prepago, pero no distingue COD. |

Aislamiento MasterShop ↔ Venndelo: **correcto** (checklist en §6).

---

## 2. Trazado del flujo (con archivo:línea)

```
Services/wompi.js
  applyProviderTransaction(...)                              (wompi.js:594)
  result.applied && status === APROBADO && result.order      (wompi.js:612-616)
  resolveOrderProvider(items)                                (wompi.js:621)
  enqueue(MastershopOrderOutbox, "mastershop")               (wompi.js:648-649)

Services/cron.js → runProviderSync()
  processMastershopOutbox({ limit })                         (cron.js:37)

Services/mastershopOrders.service.js
  processMastershopOutbox()                                  (:602)
    reclama filas pending / processing atascadas             (:605-623)
    Payment.findOne(APROBADO) por orderId                    (:639-641)
    syncPaidOrderToMastershop(payment.reference)             (:650)
      Payment.findOne por reference                          (:241)
      Order.findByPk + items                                 (:254)
      idempotencia si order.msIdOrder                        (:267)
      solo si payment.status === APROBADO                    (:284)
      resolveOrderItems(items)                               (:302)
      mapAddress(snapshot) / mapCustomer(snapshot)           (:357-366)
      buildOrderPayload(input)                               (:373)
      createOrder(payload, {...})                            (:414)

integrations/suppliers/mastershop/mastershop.orders.js
  buildOrderPayload(input)  [PURA]                           (:68)
  createOrder(payload) → requestJson("POST", "/api/orders") (:314, :323)

integrations/suppliers/mastershop/mastershop.client.js
  requestJson(method, path, { body })                        (:86)
  Utils/httpClient.js → request(url, ...)                    (:118)
```

Resultado persistido: `orders.msIdOrder`, `msSyncState`, `msSyncedAt`,
`msStatus`, `msExternalOrderId`; bitácora en `mastershop_order_attempts`;
estado de la cola en `mastershop_order_outbox`.

---

## 3. Contrato vs payload armado (campo por campo)

El payload final lo produce `buildOrderPayload` (`mastershop.orders.js:269-303`).
Entrada desde `mastershopOrders.service.js:355-371`.

| Campo | Contrato | Lo que se envía | Veredicto |
| --- | --- | --- | --- |
| `id_order` | `[A-Za-z0-9-]` | `order.orderNumber` (`UPBUY-2026-000011`) | ✅ cumple charset |
| `shipping_address` | 12 llaves (pueden ser `null`) | `mapAddress` → 12 llaves, `country:"CO"` | ✅ |
| `billing_address` | 12 llaves | mismo objeto que shipping | ✅ (aceptable) |
| `order_transaction.total` | `Σ price×qty + Σ cargos` exacto | `Number(order.total)`; cargos `[]` | ⚠️ ver §4 |
| `order_transaction.currency` | legal en país (CO→COP) | `"COP"` | ✅ |
| `order_transaction.payment_method` | `cod`\|`pia` | `"pia"` fijo | ⚠️ fijo/TODO |
| `order_transaction.payment_gateway` | (schema) | `"Wompi"` | ⚠️ no aparece en el ejemplo |
| `customer.full_name` | texto | `snapshot.recipientName` | ⚠️ ver §5 |
| `customer.first_name/last_name` | solo letras/espacios | `splitName(recipientName)` | ⚠️ ver §5 |
| `customer.phone` | 10-20 | `snapshot.phone` | ✅ (depende del dato) |
| `customer.email` | email | `snapshot.email` | ✅ |
| `customer.documentType/Number` | ambos o ninguno | `null`/`null` | ✅ |
| `order_items[].id_product` | int>0 | `Number(supplierProduct.externalId)` | ✅ |
| `order_items[].id_variant` | int>0 si hay variantes | `resolution.idVariant` u omitido | ✅ mecánica |
| `order_items[].quantity` | >0 | `item.quantity` | ✅ |
| `order_items[].price` | número | `item.unitPrice` (precio de venta UpBuy) | ✅ (a confirmar si MasterShop espera su precio) |
| `order_items[].weight` | >0 | peso de variante, mín. `0.01` | ✅ |
| `order_items[].name/sku` | texto | `nameSnapshot`/`providerSku` | ✅ |
| `additional_charge` | array | `[]` siempre | ⚠️ ver §4 |
| `notes` / `tags` | arrays | `[]` / `["upbuy","wompi"]` | ⚠️ arrays vacíos (§1 #5) |

Validaciones locales de `buildOrderPayload` (rechazan antes de llamar a la API):
`idOrder` obligatorio, direcciones objeto, `payment_method`/`payment_gateway`
obligatorios, `currency` obligatoria y legal, `customer.full_name`/`phone`
obligatorios, documento en pareja, `order_items` no vacío, `id_product` entero
positivo, `quantity` >0, `price` no negativo, sin duplicados
`id_product|id_variant`, y **total exacto** (`:244-257`).

---

## 4. Aritmética del total (hallazgo #2)

- El pedido se crea con `total = subtotal - descuento + shippingCost`
  (`Services/orders.js:466`); hoy en web `shippingCost = 0` (`:453`) y el
  descuento por ítem ya viene dentro de `unitPrice` (`pricing.js:216,242`).
- El servicio envía `input.orderTransaction.total = Number(order.total)` y
  `additionalCharge: []` (`mastershopOrders.service.js:360,368`).
- `buildOrderPayload` exige `total == Σ(price×qty) + Σ(cargos)` (`:244-257`) y
  lo calcula en **centavos enteros** (`:196-198,233-236`), correcto.
- **Consecuencia:** mientras `shippingCost === 0` y no haya descuento manual, se
  cumple. Si en el futuro `shippingCost > 0` o hay `manualDiscount`, el total no
  cuadrará → `payload_invalido` → `needs_review` (no llega a MasterShop).
  **Recomendación:** enviar el envío como `additional_charge`
  (`{ type_charge: "shipping", value }`) y/o restar el descuento, o calcular el
  total de items para el payload en vez de reutilizar `order.total`.

> El `500` del 2026-11-24 **no** fue este caso: ocurrió tras pasar la validación
> local (antes hubo un 400 de MasterShop).

---

## 5. `mapAddress` / `mapCustomer` / `resolveOrderItems`

`services/mastershopOrders.service.js`:

- `mapAddress` (`:112-128`) usa `snapshot.recipientName, postalCode, city,
  address, department, phone`; fuerza `country:"CO"`, `company/district/address2
  = null` (permitido: llave presente con `null`). ✅
- `mapCustomer` (`:132-145`) usa `recipientName, phone, email`; documento
  `null/null`; tags `["upbuy","wompi"]`. ✅
- `splitName` (`:57-66`): **divide por espacios pero no elimina dígitos ni
  símbolos**. Si `recipientName` trae números/símbolos, `first_name`/`last_name`
  llegan inválidos → MasterShop 400. Además, con nombre de una sola palabra,
  `last_name` se duplica (`parts[0]`), aceptable.
- `resolveOrderItems` (`:149-193`): `weight` toma `variation.rawData.weight` o
  `variation.weight`, mín. `0.01` ✅. `price = unitPrice`. La resolución de
  variante es estricta: si es ambigua o falta el mapeo, **no** crea pedido
  parcial (`:304-350`). ✅

`services/mastershopMapping.service.js`:
- `loadMastershopProduct` verifica `supplier.slug === "mastershop"` (`:115`):
  evita resolver un producto de Venndelo como MasterShop. ✅ (aislamiento).
- Producto sin variaciones vendibles → se crea solo con `id_product`
  (`:168-178`), coherente con el contrato.

---

## 6. Propiedad del error y de la bitácora

- `mastershop.client.js` adjunta `upstreamStatus` y `upstreamBody` al `HttpError`
  (`:131-132`) y **no** filtra la llave. ✅
- `createOrder` distingue y propaga en cada rama (`:314-462`): `400→rejected`,
  `401/403→config_error`, `429→rate_limited`, `500+"ya existe"→duplicate`,
  `5xx→server_error`, red/timeout→`network_error`; en todos devuelve `raw`.
  ✅
- `mastershopOrders.service.js` persiste el intento redactado en
  `mastershop_order_attempts` (`:199-225`), mapea a `msSyncState` y estado del
  outbox (`:502-575`), y dispara alarma por tasa de fallos (`:690-715`). ✅
- **Consecuencia práctica:** el `500` opaco sí queda guardado redactado, así que
  la Fase C podrá leer el `responseBody` real del proveedor.

---

## 7. Aislamiento MasterShop ↔ Venndelo (checklist)

| Regla | Resultado | Evidencia |
| --- | --- | --- |
| Outbox separados | ✅ | `MastershopOrderOutbox` (`mastershop_order_outbox`) vs `VenndeloOrderOutbox` |
| Servicios separados | ✅ | `mastershopOrders.service.js` vs `venndeloOrders.service.js` |
| Mapeos separados | ✅ | `mastershopMapping.service.js`; el de MasterShop no se usa en Venndelo |
| Enrutamiento conservador | ✅ | `providerRouting.service.js:21,106-141` (mismo proveedor; mixto ⇒ no) |
| Encolado único por proveedor | ✅ | `wompi.js:648-651` |
| Cron independiente | ✅ | `cron.js:37,39` |
| Columnas `ms*` vs `vd*` | ✅ | `Order.js:340-403` |
| Config separada | ✅ | `MASTERSHOP_API_KEY` (env) vs credenciales OAuth de Venndelo (cifradas) |
| Rutas del panel | ✅ | `mastershop.routes.js:49-50`: pedidos/webhooks no montados |
| Utilidades compartidas | ✅ | solo genéricas (`Utils/attributes.js`, `productIdentity.service.js`) |

**No se detectó acoplamiento entre proveedores.**

---

## 8. Causa raíz del fallo (hipótesis ordenadas)

1. **Identificador externo inconsistente (hallazgo #1, Alta — corregible ya).**
   Se crea con `id_order = order.orderNumber` (`:356`) pero se guarda
   `msExternalOrderId = reference` (`:462`) y se recupera con
   `getOrder({ externalOrderId: reference })` (`:442`). Un duplicado **no** se
   puede resolver → `needs_review`, y la conciliación con `--remote` da falsos
   positivos. Si el `500` fue en realidad un pedido ya existente, el flujo lo
   trataría como fallo recuperable y **no** lo recuperaría.
2. **Alcance de la llave** (`catalog` de lectura vs creación de pedidos):
   coincide con «catalog funciona / POST falla», no verificable sin red. → Fase C
   / confirmar con `api@mastershop.com`.
3. **Campos que MasterShop acepta o rechaza de forma no documentada**
   (`payment_gateway: "Wompi"`, arrays vacíos, `payment_method: "pia"`). → Fase C
   con un payload mínimo.

---

## 9. Pendientes para la Fase C

- Leer `requestPayload`/`responseBody` reales en `mastershop_order_attempts` de
  los pedidos afectados.
- `npm run reconcile:mastershop -- --json` (y `--remote`).
- Probar variantes del payload (sin `payment_gateway`, sin arrays vacíos,
  `documentType` en pareja) y capturar el `upstreamStatus`/`upstreamBody`.
- Confirmar con `api@mastershop.com` el permiso de la llave para `POST /api/orders`.

## 10. Correcciones propuestas (no aplicadas)

1. **Unificar el identificador externo** a `order.orderNumber`:
   `msExternalOrderId = order.orderNumber` y
   `getOrder({ externalOrderId: order.orderNumber })` en la recuperación por
   duplicado. Alinear la conciliación.
2. **Sanear `splitName`** (quitar dígitos/símbolos, colapsar espacios) y validar
   que `first_name`/`last_name` no queden vacíos.
3. **`additional_charge`**: enviar el envío (y descuento, si aplica) de forma
   que `total` cuadre con `Σ items + cargos`.
4. **Tests**: cubrir el identificador externo, nombres con caracteres no
   permitidos y el total con envío/descuento.

---

## 11. Estado de cierre (Fase D aplicada — 2026-11-26)

| Hallazgo | Estado | Evidencia |
| --- | --- | --- |
| #1 Identificador externo (orderNumber vs `reference`) | ✅ **Corregido** | `msExternalOrderId = order.orderNumber` y recuperación por duplicado con `getOrder({ externalOrderId: order.orderNumber })` |
| #2 `additional_charge` / total | ✅ **Envío cubierto** | El envío viaja en `additional_charge`; el descuento manual no representable → `needs_review` (documentado en el código) |
| #3 `splitName` sin sanear | ✅ **Corregido** | Nuevo `sanitizeName()` (solo letras y espacios) en `mapAddress`/`mapCustomer` |
| — `weight > 0` (refuerzo) | ✅ **Añadido** | `buildOrderPayload` exige `weight > 0` |
| — `id_order` charset (refuerzo) | ✅ **Añadido** | `buildOrderPayload` exige `^[A-Za-z0-9-]+$` |
| #4 `payment_gateway: "Wompi"` | ✅ **Confirmado válido** | Smoke test Fase C (creado y cancelado) |
| #5 Arrays vacíos (`additional_charge`/`notes`/`tags`) | ✅ **Confirmados válidos** | Smoke test Fase C |
| #6 `payment_method: "pia"` fijo | ✅ **Confirmado válido** | Smoke test Fase C |
| Email inválido (dominio `.local`) | ✅ **Validado en código** | `buildOrderPayload` rechaza dominios de uso especial y correos mal formados |
| Aislamiento MasterShop ↔ Venndelo | ✅ **Verificado** | Sin acoplamiento (ver §7) |

**Pruebas:** `Back/test/mastershop.gaps.test.js` (15) + `Back/test/mastershop.orderSync.test.js`
(2, integración con auto-skip). Suite `Back`: **323/323**, con las correcciones
de #1, #2 (envío), #3, `weight > 0`, `id_order` charset y validación de email.

**Confirmado en Fase C:** `payment_gateway`, los arrays vacíos y `payment_method:
"pia"` NO son el problema; el `400` opaco lo producía un email con dominio
`.local`, ya validado localmente.
