# Fase C — Validación contra la API real (solo lectura) y diagnóstico

**Fecha:** 2026-11-26
**Entorno:** `MASTERSHOP_API_URL = prod.api.mastershop.com` (configurada),
`WOMPI_ENV = test`. Base local accesible.

> Esta fase hizo **solo lecturas** (base local + `GET` a MasterShop). No se creó
> ni canceló ningún pedido real. El smoke test de escritura queda pendiente de
> aprobación explícita (ver §5).

---

## 1. Resultado de la conciliación

```
node scripts/reconcileMastershop.js --json            # local
node scripts/reconcileMastershop.js --remote --json   # local + remoto
```

- **Acceso remoto OK**: `remoteError: null`. La llave sirve para
  `GET /api/orders/list`.
- `remoteWithoutLocal: []` y `msStatusMismatch: []`: no hay pedidos en
  MasterShop (últimos 7 días) sin pago local.
- **2 pagos Wompi aprobados SIN pedido en MasterShop:**
  - `UPBUY-2026-000190` (ref `...-7a6b4812`, `msSyncState = null`)
  - `UPBUY-2026-000189` (ref `...-b19f48a1`, `msSyncState = null`)

## 2. Por qué esos dos pedidos no existen (causa histórica)

- Ambos pagos son del **2026-11-23**, con webhooks `processed=true`.
- `mastershop_order_outbox`: **0 filas en toda la tabla**.
- `mastershop_order_attempts`: **0 filas en toda la tabla**.
- `resolveOrderProvider(items)` sobre esos pedidos devuelve
  `{ ok: true, provider: "mastershop" }`.

**Conclusión:** el enrutamiento funciona, pero esas órdenes se pagaron **antes de
que existiera el patrón outbox** (la Fase 0 es del 2026-11-24). Nunca se
encolaron porque la función no existía. **No es un bug del código actual.**

## 3. Dry-run del payload real (sin enviar) — hallazgo importante

Se armó el payload de `UPBUY-2026-000190` con el mismo camino del servicio
(`resolveOrderItem` → `mapAddress`/`mapCustomer` → `buildOrderPayload`), sin
llamar a `POST /api/orders`.

Resultado: **el pedido NO se podría crear tal cual** por dos motivos:

1. **Variante ambigua (bloqueante real).**
   `"Chaqueta Champion Urban"` no tiene `size` ni `shirtColor` en `order_items`,
   pero el producto MasterShop tiene **12 variantes** (3 colores × 4 tallas).
   `resolveVariation` devuelve `reason: "ambiguo"` → el servicio marcaría
   `needs_review` (`faltan_mapeos_de_variante`) y **no enviaría nada**.
   - Esto afecta a cualquier producto con más de una variante si el checkout no
     persiste talla/color en la línea del pedido.
2. **Total (artefacto del dry-run parcial).** Como la chaqueta no resolvió, el
   dry-run solo sumó la gorra (19.500) y comparó contra `order.total` (224.900):
   `total no coincide`. En el flujo real, un ítem sin resolver aborta antes de
   `buildOrderPayload`, así que este error **no se produciría**; es consecuencia
   de evaluar solo el subconjunto resuelto.

La línea de la gorra **sí resuelve**: `id_product = 70255`,
`id_variant = 153076` (justo la del intento de 2026-11-24), peso `0.6`, precio
`19500`.

## 4. Lo que queda confirmado

| Aspecto | Estado |
| --- | --- |
| Llave de MasterShop (lectura) | ✅ funciona |
| Enrutamiento por proveedor | ✅ resuelve `mastershop` |
| Idempotencia / outbox (código actual) | ✅ implementado; sin filas por ser previo |
| Payload para ítem resoluble | ✅ cumple el contrato (salvo el total parcial del dry-run) |
| Productos multivariante sin talla/color | ❌ `ambiguo` → `needs_review` |
| `POST /api/orders` (el 500 opaco) | ⏳ **sin verificar**: requiere escritura real |

## 5. Pendiente: smoke test de escritura (requiere aprobación)

Para confirmar o descartar el `500` opaco hay que **crear un pedido real** en
producción y cancelarlo. Procedimiento propuesto:

1. Elegir un producto MasterShop **resoluble** (sin variantes o una sola
   variante) y barato.
2. Crear el pedido con el servicio real (`syncPaidOrderToMastershop` sobre una
   `reference` controlada) o con un payload construido por `buildOrderPayload`.
3. Verificar `idOrder`, `msIdOrder` y `mastershop_order_attempts` (`ok`,
   `httpStatus`, `responseBody`).
4. Si se creó: cancelar con `PUT /api/orders/{idOrder}` `{ "idStatus": 9 }`.
5. Registrar `idOrder`, fecha, monto y resultado de la cancelación.

Riesgo: crea un registro real en la cuenta de MasterShop. Si el `POST` falla con
500, no hay nada que cancelar; si funciona, hay que cancelarlo de inmediato.

## 6. Recomendación previa al smoke test

- Confirmar que el checkout **actual** guarda `size` y `color` en `order_items`
  para productos multivariante (los dos pedidos de noviembre no los tienen).
  Sin eso, esos pedidos seguirán yendo a `needs_review`.
- Para el smoke test, usar un producto de **una sola variante** para aislar el
  `POST` del problema de mapeo.

---

## 7. Smoke test real ejecutado (2026-11-26)

Aprobado por el usuario. Producto usado: `idProduct 261838`,
`idVariant 763962` (Camibuso, precio 37.000, peso 1). Todos los pedidos que se
crearon se **cancelaron con `PUT {"idStatus":9}`** («Cancelada Por API»).

| Variante probada | Resultado | idOrder |
| --- | --- | --- |
| Mínimo documentado (`payment_method: cod`, sin extras) | ✅ creado y cancelado | 3247708 |
| `payment_method: "pia"` | ✅ creado y cancelado | 3247718 |
| `payment_gateway: "Wompi"` | ✅ creado y cancelado | 3247719 |
| Arrays vacíos (`additional_charge`/`notes`/`tags`) | ✅ creado y cancelado | 3247722 |
| `customer.tags` | ✅ creado y cancelado | 3247724 |
| Email `smoke-test@upbuy.local` | ❌ **400/500 interno** (`data: null`) | — |

### Conclusión del smoke test

- **`POST /api/orders` funciona.** El payload de UpBuy es válido salvo un caso.
- **`pia`, `payment_gateway: "Wompi"`, arrays vacíos y `customer.tags` NO son el
  problema.**
- **Culpable del `400` opaco: el email con dominio `.local`.** MasterShop lo
  valida internamente y devuelve «Error interno del servidor» con `data: null`
  (no lo reporta como error de esquema). Un email real no lo dispara.
- **`id_order`**: la API respondió «Solo alfanuméricos, guiones y guiones
  bajos», es decir, **acepta `_`**. Nuestra validación más estricta
  (`^[A-Za-z0-9-]+$`) sigue siendo segura (los `orderNumber` no usan `_`).

## 8. Hallazgo operativo crítico: catálogo vs llave

- `GET /api/products` con la llave actual devuelve **1 solo producto**
  (`261838`, negocio *Colombia moda Online*).
- `GET /api/products/70255` (la gorra del catálogo local y del intento del
  2026-11-24) responde **404 «Producto no encontrado»**.
- Por eso el `POST` con `id_product 70255` da
  `500 Cannot read properties of undefined (reading 'variation')`.

**El catálogo publicado en UpBuy no corresponde a la cuenta de la
`MASTERSHOP_API_KEY` actual.** Los ids que hay en la base local no existen para
esa llave. Hay que **re-sincronizar el catálogo con la llave correcta** (o
corregir la llave) antes de que los pedidos reales puedan crearse.

## 9. Acciones recomendadas (Fase C → cierre)

1. **Corregir/verificar la llave** y re-sincronizar el catálogo
   (`npm run mastershop:sync` + `npm run mastershop:report`). Mientras el
   catálogo local y la llave no sean de la misma cuenta, ningún pedido de esos
   productos se podrá crear.
2. **Validar/normalizar el email** antes de enviar (o aceptar que un email
   inválido deja el pedido en `needs_review` con el motivo). El `400` del
   proveedor es opaco.
3. **Talla/color**: asegurar que los pedidos multivariante guardan `size` y
   `color`; sin eso, van a `needs_review` (`ambiguo`).
4. Los dos pedidos de noviembre (`000189`, `000190`) siguen sin crear; son
   previos al outbox. Se pueden reencolar a mano cuando el catálogo/llave esté
   correcto (ojo: la chaqueta es ambigua).

---

## 10. Prueba end-to-end final (catálogo ya sincronizado) — 2026-11-26

Tras sincronizar MasterShop con UpBuy (dev), el catálogo quedó enlazado:

- `SupplierProduct externalId 261838` ("Camibuso clásico polo-3"), 40 variaciones.
- Variante AMARILLO/L → `idVariant 763962`, SKU `2519723`, peso 1, stock 50.
- `Product 36c5e9ae-...` enlazado (`provider: mastershop`, `supplierProductId`).

Se ejecutó el **flujo real completo**: `Order` + `OrderItem` (size `L`, color
`AMARILLO`) + `Payment` aprobado → `syncPaidOrderToMastershop(reference)`.

Resultado:

| Comprobación | Resultado |
| --- | --- |
| `createOrder` (POST real) | ✅ `ok`, `idOrder = 3247815`, status «Por Confirmar» |
| `orders.msIdOrder` | ✅ `3247815` |
| `orders.msExternalOrderId` | ✅ `UPBUY-E2E-...` (= `orderNumber`, corrección Fase D) |
| `orders.msSyncState` | ✅ `synced` |
| `mastershop_order_attempts` | ✅ `ok=true`, `httpStatus=200` |
| `order_items` en MasterShop | ✅ `id_product 261838`, `id_variant 763962`, `price 48100`, `priceProvider 37000` |
| Cancelación `PUT {idStatus:9}` | ✅ «Cancelada» |
| Limpieza de la DB de prueba | ✅ |

**Conclusión: el sistema de creación de pedidos MasterShop funciona con el
catálogo sincronizado.**

### Alertas que devolvió MasterShop (operativas, no bloquean la creación)

- ⚠️ **«No hay saldo suficiente en la billetera»**: el pedido se crea, pero la
  cuenta de MasterShop necesita saldo para procesarlo/despacharlo. Hay que
  recargar la billetera del proveedor.
- «Cliente Riesgoso» y «Encontramos una sugerencia para esta dirección»: avisos
  informativos.

### Pendientes reales tras la prueba

1. **Saldo de la billetera MasterShop** (alerta del proveedor).
2. ✅ **Email inválido**: resuelto en código. `buildOrderPayload` ahora exige un
   email real y rechaza correos mal formados y dominios de uso especial
   (`.local`, `.test`, `.invalid`, `.example`, `.localhost`, `.internal`, `.lan`).
   Un email inválido deja el pedido en `needs_review` con motivo accionable, sin
   llegar al `400` opaco del proveedor.
3. ✅ **Talla/color**: resuelto. `resolveOrderItem` ahora usa el
   `order_items.variantId` exacto que guarda el checkout (variante de
   `supplier_product_variations`) y solo cae a talla/color si no hay variante
   guardada. Asi un pedido multivariante se crea aunque la linea no traiga los
   atributos, y no se elige "la primera" variante.
4. Los dos pedidos históricos de noviembre son de **pruebas del entorno local**;
   no hace falta reencolarlos.