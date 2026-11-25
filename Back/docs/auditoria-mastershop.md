# Auditoría — pago Wompi aprobado → creación automática de pedido en MasterShop

**Fase 0 (solo lectura). No se modificó ningún archivo de `Back/` ni de `Front/`.**
Fecha: 2026-11-24.
Base del análisis: rama `main`, árbol limpio salvo `CREAR_PEDIDO_MASTERSHOP.md`.

Resumen ejecutivo: la mitad "Wompi" ya está construida y es reutilizable casi
tal cual (webhook con firma, reconsulta de la transacción, idempotencia por
`webhook_events`, promoción del pedido a `paid`). La mitad "MasterShop" está a
medio camino: existe un cliente HTTP único, pero **el catálogo descarta las
variaciones a propósito** (`normalizeProduct` devuelve `variations: []`) y no
hay nada de pedidos. El hueco real no son "tablas de mapeo nuevas" sino
**enseñar al sincronizador a leer `variation[]` y resolver talla/color a
`idVariant`**, porque hoy `order_items` no guarda ni el color ni el id de la
variante del proveedor.

---

## 1.1 Inventario de lo existente

### Integración con MasterShop

| Qué | Dónde |
| --- | --- |
| Cliente HTTP (único) | `Back/integrations/suppliers/mastershop/mastershop.client.js` |
| Autenticación (llave estática) | `.../mastershop.auth.js` |
| Catálogo | `.../mastershop.catalog.js` |
| Normalización | `.../mastershop.normalize.js` |
| Assets | `.../mastershop.assets.js` |
| Registro del adaptador | `Back/integrations/suppliers/index.js:46` |
| Fachada para el panel | `Back/Services/suppliers/mastershop.service.js:13` |
| Config | `Back/config.js:640-652` (`MASTERSHOP_API_URL`, `MASTERSHOP_API_KEY`, `MASTERSHOP_HTTP_TIMEOUT_MS`, `MASTERSHOP_SYNC_PAGE_SIZE`) |

El adaptador cumple el contrato común de `integrations/suppliers/index.js`
(`isConfigured`, `auth.*`, `client.*`, `catalog.*`, `assets.*`). No hay un
segundo cliente paralelo: **la Fase 2 debe extender este mismo módulo**
(`requestJson` ya soporta `POST` con cuerpo JSON, aunque hoy nadie lo use).

Funciones clave del cliente (`mastershop.client.js`):
- `requestJson(method, path, { params, body, retries })` — :86. Ya arma
  `Content-Type: application/json` cuando hay cuerpo y **fuerza
  `allowRetryOnNonIdempotent: false`** (:112): un POST hoy no se reintenta.
- `mapStatus` (:62) traduce 400→400, 404→404, 429→503, resto→502. **Pierde el
  cuerpo del error** (el `data[]` de validación de MasterShop no llega al
  llamador). Para la Fase 2 hay que adjuntar `response.data`.
- `readRateLimit` (:75) ya lee `RateLimit-Limit|Remaining|Reset`.
- `checkAuth` (:156) usa `GET /api/products?page=1&limit=1`.

### Autenticación contra MasterShop

Header `ms-api-key` desde `process.env` vía `config.js` (`MASTERSHOP_API_KEY`).
**No hay multi-negocio ni credenciales en base de datos** para MasterShop:
`mastershop.auth.js:9` lee la llave del entorno y `resolveCredentials()` informa
`source: "env"`. `supplier_credentials` (cifrada con AES-GCM) se usa solo para
Venndelo. Es una decisión válida: la llave es estática y no rota.

### Cómo se obtienen y guardan productos/variantes

- `catalog.listPage` / `iteratePages` / `getProduct`
  (`mastershop.catalog.js:45,100,76`). La paginación es por índice, tope real 50.
- `normalizeProduct` (`mastershop.normalize.js:46`) devuelve
  **`variations: []`** (:56) y `productSizes() => []` (:69) con el comentario
  explícito "el esquema de `variation[]` NO está documentado".
- Persistencia genérica: `SupplierProduct` (`Back/DataBase/models/SupplierProduct.js`,
  unique `(supplierId, externalId)`) y `SupplierProductVariation`
  (`.../SupplierProductVariation.js`, unique `(supplierProductId, externalId)`,
  `sku` indexado **no único**, `attributes` JSONB, `quantity`, `available`,
  `rawData`). Upsert idempotente en `Back/Services/catalog/catalogImport.service.js:36`
  (`syncVariations`) — **borra las variaciones que ya no vienen en la respuesta**.
- Publicación: `Back/Services/catalog/catalogSync.service.js:315`
  (`publishSupplierProduct`). `products` guarda `supplierId`,
  `supplierProductId`, `provider`, `providerSku`, `sizes` (lista de tallas),
  `stock`, `price`, `cost`.
- **No hay tabla de mapeo SKU local ↔ variante de proveedor.** `order_items`
  guarda `productId`, `size` (texto libre), `providerSku`, `supplierProductId`
  **nunca se llena** (`Back/Services/pricing.js:112-130`), `variantId` siempre
  `null` (:115). `shirtColor` existe en el modelo pero el checkout web no lo
  usa.

### Consulta de estados de pedido / webhooks de MasterShop

**No existe.** Grep de `mastershop` en `Back/Services/**`, `Back/Rutas/**` y
`Back/integrations/**` solo devuelve catálogo, assets, auth y la fachada del
panel. No hay rutas de pedidos, ni webhooks entrantes de MasterShop, ni
validación de firma de MasterShop (la API de MasterShop no documenta firma para
sus webhooks; ver Anexo A del encargo).

### Wompi en el repo

Todo vive en `Back/Services/wompi.js` (714 líneas) y está bien resuelto:

| Pieza | Línea |
| --- | --- |
| Firma de integridad del checkout | `:119` |
| `verifyEventSignature` (properties dinámicas + `timestamp` + secreto) | `:182` |
| Comparación timing-safe (`crypto.timingSafeEqual`) | `:173` |
| Reconsulta `GET /v1/transactions/{id}` con llave privada | `:235` |
| Aplicación del estado sobre `payments` + pedido | `:275` |
| `handleWebhook` (evento, ambiente, anti-replay, dedupe) | `:484` |
| `verifyOrderPayment` (respaldo manual / localhost) | `:609` |

Rutas: `POST /api/webhooks/wompi` (`Back/Rutas/webhooks.js:8`,
`Back/Controllers/webhooks.js:20`) y el alias legacy `POST /api/payments/webhook`
(`Back/Rutas/payments.js:17`). `rawBody` disponible por el `verify` de
`express.json` (`Back/index.js:201-204`).

El estado del dinero se aplica con `registerPayment`
(`Back/Services/payments.js:441`) y el cumplimiento se promueve dentro de la
misma transacción con `transitionFulfillment` (`:253`). **Ese es el punto de
enganche natural del orquestador de la Fase 4.**

### ORM, migraciones, patrón

- Sequelize 6 + PostgreSQL (`Back/DataBase/models/index.js`), CommonJS.
- **No hay runner de migraciones.** El esquema se garantiza con módulos
  idempotentes: `ensureBaseSchema`, `ensureDropshippingSchema`,
  `ensureCatalogSchema`, `ensureAdminSecuritySchema`, `ensureCampaignSchema`,
  `ensurePanelIndexes`, cada uno con su `pg_advisory_xact_lock` y su llave
  propia (`Back/DataBase/ensureCatalogSchema.js:836`,
  `ensurePanelIndexes.js:60`). `Back/migrations/` está **vacío**.
  → La Fase 1 debe crear `ensureMastershopOrdersSchema.js` **con una llave de
  advisory lock nueva** y registrarlo en el arranque, no un `.sql` suelto.
- Patrón capas: `Rutas → Controllers → Services → DataBase/models`. Lógica pura
  separada (ej. `Services/statusMachine.js`).

### Trabajo asíncrono / colas

No hay Redis, BullMQ ni pg-boss (`Back/package.json` solo trae express,
sequelize, pg, etc.). El patrón vigente es **"tabla de intentos + cron"**:
`sync_logs` (`Back/DataBase/models/SyncLog.js`) registra cada intento
direccional y `retryFailedOutbound` (`Back/Services/syncService.js:422`) lo
reintenta desde `Services/cron.js:23`, expuesto en `/api/cron/*`
(`Back/vercel.json`, 1×/día en Hobby, `maxDuration` de Vercel por defecto).
→ La Fase 5 debe reutilizar exactamente ese patrón (`mastershop_order_attempts`
+ reintento desde el cron), no inventar un worker.

### Logger, errores, respuestas

- `Utils/logger.js` (`createLogger(scope)`, `LOG_LEVEL`), nunca `console.log`.
- `Utils/HttpError.js` + `Middlewares/errors.js` + `Utils/respond.js`
  (`sendError` responde **string plano** para errores conocidos, JSON genérico
  para lo inesperado).
- Los servicios devuelven objetos planos y los controllers hacen
  `res.status(x).json(...)`.

### Idempotencia existente

- `webhook_events` con unique `(provider, eventId)`
  (`Back/Services/webhookEvents.js:22`). El `eventId` que arma Wompi es
  `sha256(event|transactionId|status)` (`Services/wompi.js:560`) — **incluye el
  status**, así que APPROVED y VOIDED son eventos distintos (deseado).
- `payments.reference` unique y `payments.providerTransactionId` unique
  (`Back/DataBase/models/Payment.js:40-50`), más un índice único parcial
  "un solo pago aprobado por pedido".
- `orders` tiene unique `(channel, externalRef)` (`Order.js:382`) — **no hay
  columna `reference`**; la referencia de Wompi vive en `payments.reference`.
  → En la Fase 4, "cargar la orden por reference" = `Payment.findOne({reference})`
  → `payment.orderId`.

### Tests

`cd Back && npm test` → `node --test --test-concurrency=1 test/*.test.js`.
**Estado real hoy: 249 tests, 249 pass, 0 fail (52 s).** Hay mock de
`global.fetch` en `Back/test/mastershop.client.test.js` (patrón
`jsonResponse()` + `captureFetch()`), reutilizable para las Fases 2 y 6.
No existe `wompi.webhook.test.js`: la firma de Wompi no tiene tests propios
(solo Venndelo en `test/webhook.signatures.test.js`).

---

## 1.2 Llamada de prueba real contra la API (solo lectura)

Ejecutada con la llave de `Back/.env.local` (nunca impresa, nunca escrita).
Sin escrituras: solo `GET /api/products`, `GET /api/products/:id` y
`POST /api/orders/list` (lectura).

### Catálogo observado

- `GET /api/products?page=1&limit=5` → `{ results: [...], resultsCount: { totalProducts: 11 } }`.
  La cuenta tiene 11 productos y el rate limit reportado fue
  `limit 500 / remaining 498`.
- Llaves de un item: `idProduct, name, description, affiliationsActive,
  baseCurrencyPrice, basePrice, suggestedPrice, urlImageProduct, warrantyPeriod,
  supportEmail, warrantyPhone, warrantyUrlTerms, warrantyConditions, nameType,
  nameState, prodFormatName, tags, productProperties, variation, productOwner,
  stockTotal`.
- **`variation` viene poblado ya en el listado** (no solo en el detalle): los 11
  productos traen entre 2 y 25 elementos.

### Esquema real de `variation[]` (confirmado)

```json
{
  "sku": "M101",
  "name": "BRONCE/37",
  "price": 65000,
  "stock": 20,
  "weight": 0.5,
  "options": [
    { "nameValue": "BRONCE", "propertyName": "COLOR" },
    { "nameValue": "37",     "propertyName": "TALLAS" }
  ],
  "package": { "width": null, "height": null, "length": null, "weight": 0.5 },
  "isEnable": 1,
  "idProduct": 269130,
  "idVariant": 753806,
  "weightUnit": "kg"
}
```

Tipos: `sku` string **o null**, `name` string, `price` number, `stock` number,
`weight` number, `options` array **o null**, `package` objeto con 4 llaves,
`isEnable` number (1/0), `idProduct` number, `idVariant` number,
`weightUnit` string.

Hallazgos que condicionan el diseño:

1. **Existe siempre una variante "Default Variant"** con `idVariant` propio,
   `sku: null`, `options: null` y `stock: 0`
   (ej. `{ idVariant: 753796, name: "Default Variant", stock: 0 }` en el
   producto 269130). Enviar ese `idVariant` en un pedido sería un error de
   negocio; hay que excluirla salvo que el producto solo tenga esa.
2. **`sku` puede ser `null`** (las "Default Variant" y otras). Por eso el mapeo
   **no puede ser solo por SKU**: hace falta `(idProduct, idVariant)` y, para
   resolver desde `order_items`, atributos normalizados.
3. **`isEnable` existe** (1 en todo lo observado): hay que filtrarlo al importar.
4. `stockTotal` del producto = suma de `stock` de **todas** las variaciones
   (verificado: 360 = 360 en el producto 269130).
5. `productProperties` da el catálogo de atributos del producto:
   `[{ name: "COLOR", values: [{ nameValue: "NEGRO" }, ...] }, { name: "TALLAS", values: [...] }]`.

### Diferencia `includeAllVariations=true` vs `false` (**no concluyente**)

- Producto 269130 (19 variaciones): **ambas llamadas devolvieron 19**. El
  parámetro no recorta nada cuando el producto tiene variaciones reales.
- No existe en esta cuenta **ningún producto con una sola variación**, así que
  no se pudo reproducir el caso documentado ("con `false` `variation` llega
  vacío si el producto solo tiene la variante por defecto").
- **TODO: verificar con api@mastershop.com** (o con un producto de variante
  única) antes de la Fase 2. Mitigación propuesta: llamar siempre con
  `includeAllVariations=true` en los caminos de escritura.

### Atributos: inconsistencia real de nombres

Recorriendo las variaciones de los 11 productos, los `propertyName` observados
son: `COLOR`, `TALLAS`, `TALLA`, `Talla`, `Color`. Mismo concepto, 5 grafías.
Los valores también vienen en mayúsculas (`BRONCE`, `NEGRO`, `ORO`).
→ Confirma la necesidad de una tabla de alias
(`mastershop_attr_alias`) o, preferible, de una función pura de
normalización + tabla solo para excepciones.

### Endpoints de pedidos verificados en vivo (solo lectura)

- `GET /api/orders?externalOrderId=__upbuy_probe_none__` →
  **400** con
  `{ success:false, error:"Datos de los parámetros inválidos", data:[{ code:"custom", path:["externalOrderId"], message:"Solo letras, números y guiones" }] }`.
  → **Dato crítico**: `externalOrderId` no admite `_`; sí letras, números y
  guiones. La referencia de Wompi es `UPBUY-2026-000011-<hex>` → **compatible**.
- `GET /api/orders?idOrder=1` → **404** `{ success:false, error:"Orden no existe!", data:null }`.
  Confirma la forma del error y que `idOrder` es numérico.
- `POST /api/orders/list?page=1&limit=1` (cuerpo `{}`) → **200 `[]`**.
  Es el endpoint correcto para conciliación (no `GET`).
- El `data[]` de error de MasterShop **no llega** hoy al llamador porque
  `mastershop.client.js:125-142` descarta el cuerpo. Arreglo puntual en F2.

### Confrontación con las tablas propuestas en el encargo

| Propuesta del encargo | Ya existe | Acción recomendada |
| --- | --- | --- |
| `mastershop_product_map(ms_id_product, sku_base, name, active, raw_json, last_synced_at)` | `supplier_products` (`externalId`, `name`, `availability`, `rawData`, `lastSyncedAt`) | **No crear tabla paralela.** Usar `supplier_products` filtrando por el `suppliers.slug = 'mastershop'`. |
| `mastershop_variant_map(ms_id_variant, sku, attributes, stock, price, active, raw_json)` | `supplier_product_variations` (`externalId`, `sku`, `attributes`, `quantity`, `originalPrice`, `available`, `rawData`) | **Extender el normalizador** para llenarla. Faltan dos cosas: índice único por `idVariant` dentro del producto (hoy es `(supplierProductId, externalId)` — ya sirve) y `isEnable`. |
| `mastershop_attr_alias` | no existe | Crear tabla pequeña **o** normalizador puro + excepciones. Decisión abierta (pregunta 3). |
| Unique "un SKU local no apunta a dos variantes" | `products.sku` unique, `products.supplierProductId` (sin unique) | Falta el vínculo local↔variante que haría cumplir esa regla. Ver pregunta 2. |
| `ms_id_order`, `ms_synced_at`, `ms_status` en la orden | no existen | Añadir columnas a `orders` (aditivo, nullable) o tabla `mastershop_orders`. |
| `mastershop_order_attempts` | análogo: `sync_logs` | Reutilizar `sync_logs` (`direction:'out'`, `action:'create_order'`) en vez de una tabla nueva, o crear la específica. Decisión abierta (pregunta 5). |

---

## 1.3 Diagnóstico

### Reutilizable tal cual

- Cliente HTTP MasterShop con `ms-api-key`, timeout, rate limit y traducción de
  errores (`mastershop.client.js`).
- Todo el flujo Wompi: firma, reconsulta, dedupe, promoción a `paid`.
- `webhook_events` como tabla de eventos y `payments.reference` unique.
- Patrón de migración idempotente por `ensure*Schema`.
- Patrón de reintento `sync_logs` + cron.
- Mock HTTP de `global.fetch` en tests.

### Hay que extender

1. `mastershop.normalize.js`: leer `variation[]` → `variations[]` normalizadas
   (`externalId`=`idVariant`, `sku` nullable, `attributes` desde `options`,
   `quantity`=`stock`, `available`=`isEnable===1 && stock>0`,
   `supplierPrice`=`price`), y `productSizes` derivado de `TALLAS/TALLA`.
2. `mastershop.client.js`: exponer el cuerpo del error (`error.upstreamBody`) y
   permitir reintento controlado de un POST idempotente (`allowRetryOnNonIdempotent`
   configurable por llamada).
3. `orders` / `order_items`: agregar `msIdOrder`, `msSyncedAt`, `msStatus`,
   `msSyncError` y —el punto fino— una forma de resolver la variante.
4. `Services/wompi.js` o `Services/payments.js`: punto de enganche post-commit
   para disparar el orquestador (hoy todo termina en `registerPayment`).

### Hay que crear

- `integrations/suppliers/mastershop/mastershop.orders.js`:
  `buildOrderPayload` (pura) + `createOrder` + `getOrder`.
- `Services/mastershopOrders.service.js` (orquestador
  `syncPaidOrderToMastershop`).
- `DataBase/ensureMastershopOrdersSchema.js` (advisory lock nuevo).
- `scripts/reconcileMastershop.js` + `npm run reconcile:mastershop`.
- Tests: `mastershop.orders.test.js`, `wompi.webhook.mastershop.test.js`.

### Riesgos concretos del código actual

| Riesgo | Evidencia | Impacto en este flujo |
| --- | --- | --- |
| **Variaciones descartadas por diseño** | `mastershop.normalize.js:56,69` | `syncVariations` **borra** las variaciones al re-sincronizar; sin arreglo, no hay `idVariant` que enviar. Bloqueante para F1/F4. |
| **`sku` nullable en MasterShop** | sonda 1.2 | Un mapeo por SKU deja productos sin resolver. Hay que ir por `idVariant` + atributos. |
| **Sin color en el pedido** | `pricing.js:119` (`shirtColor: null`), `OrderItem.shirtColor` | Si se vende una variante por color, no hay dato para resolverla. Decisión abierta (pregunta 2). |
| **Webhook procesa todo en la petición** | `Services/wompi.js:484` síncrono | El encargo prohíbe crear el pedido en el handler. Hay que desacoplar (outbox + respuesta 200 rápida). En Vercel, trabajo "en background" tras responder no está garantizado → outbox es obligatoria. |
| **Montos: integer COP en todo el dominio** | `Order.js:134-157`, `pricing.js` | Bien para evitar floats, pero MasterShop pide `total` decimal y valida suma exacta. Se resuelve con aritmética en centavos enteros (no hay `decimal.js` en `package.json`). |
| **Cliente descarta el `data[]` de 400** | `mastershop.client.js:125-142` | Sin el detalle no se puede diagnosticar un rechazo de esquema. |
| **Un POST no se reintenta** | `mastershop.client.js:112` | Correcto por defecto; pero el encargo pide backoff para 5xx y tratar "Código 409 - La orden ya existe" como éxito. Requiere control explícito, no el default. |
| **`externalOrderId` no admite `_`** | sonda en vivo | Validar antes de llamar. La referencia UPBUY actual cumple. |
| **Sin tests de firma Wompi** | `test/` | F3 debe añadirlos. |
| **`orders.provider` tiene CHECK con solo `dropi`** | `enums.js` `PROVIDER_VALUES` | **No** usar `orders.provider='mastershop'`; el vínculo va por columnas `ms_*`. |
| Secretos | `MASTERSHOP_API_KEY` / `WOMPI_PRIVATE_KEY` solo en `.env.local`, `.env.example` vacío | Sin riesgo actual. Mantener. |

### Propuesta de arquitectura (1 página)

Módulos y responsabilidades:

```
integrations/suppliers/mastershop/
  mastershop.client.js     (existente) + upstreamBody + reintento opt-in
  mastershop.normalize.js  (extender) variation[] -> variations[]
  mastershop.catalog.js    (existente) getProduct(includeAllVariations=true)
  mastershop.orders.js     NUEVO: buildOrderPayload (pura) / createOrder / getOrder

Services/
  wompi.js                 responde 200 y encola; NO crea pedidos
  payments.js              sin cambios de contrato
  mastershopOrders.service.js  NUEVO: orquestador + reintentos + conciliacion

DataBase/
  ensureMastershopOrdersSchema.js  NUEVO (advisory lock propio)

scripts/
  reconcileMastershop.js   NUEVO (npm run reconcile:mastershop)
```

Flujo del evento:

```
Wompi ──POST /api/webhooks/wompi──┐
                                  v
                    verifyEventSignature (existente)
                                  |
                    webhook_events (dedupe, existente)
                                  |
                    GET /v1/transactions/{id} (fuente de verdad)
                                  |
              registerPayment(APPROVED)  -> orders.fulfillmentStatus=paid
                                  |
                    INSERT mastershop_order_outbox(orderId, 'pending')
                                  |
                        res.status(200).json(...)   < 1 s

cron /api/cron/sync-providers (+ endpoint manual)
                                  |
              outbox 'pending' FOR UPDATE SKIP LOCKED
                                  |
        resolver items -> (idProduct, idVariant)  ── falta mapeo? ──> 'needs_review' + alerta
                                  |
                          buildOrderPayload (pura, decimal exacto)
                                  |
                          POST /api/orders  (timeout 20 s)
                        /          |             \
                   200 OK      500 "ya existe"   4xx/5xx
                     |             |                |
              guardar msIdOrder  GET /api/orders  'retry' (5xx/429/red)
              'done'             -> msIdOrder      'failed' (400/401/403)
```

Puntos de fallo y reintento:

| Punto | Detección | Reintento |
| --- | --- | --- |
| Proceso muere tras el 200 del webhook | fila `pending` en outbox sin `msIdOrder` | cron la retoma (idempotente por `orderId` unique) |
| MasterShop 5xx / timeout | `createOrder` devuelve `retryable: true` | backoff exponencial con jitter, máx 3, luego `failed` |
| MasterShop 429 | `retryAfterSeconds` del cliente | reprograma `nextAttemptAt` con ese valor |
| MasterShop 400 de esquema | `retryable: false` + `data[]` | `failed` + alerta (no se reintenta) |
| Duplicado "Código 409" | mensaje del 500 | `GET /api/orders?externalOrderId=...` → guarda `msIdOrder` como éxito |
| Falta mapeo de variante | resolución previa | no se llama a MasterShop; `needs_review` + notificación al admin |

---

## Preguntas abiertas (necesito tu respuesta antes de la Fase 2)

1. **Tablas**: ¿acepto reutilizar `supplier_products` /
   `supplier_product_variations` (extendiendo el normalizador) en vez de crear
   `mastershop_product_map` / `mastershop_variant_map`? Es menos código, cero
   duplicación y ya es idempotente. (Recomendado: reutilizar.)
2. **Color**: el checkout web hoy **no captura color** (`shirtColor` siempre
   null) y solo vende tallas de `products.sizes`. MasterShop vende variantes
   color+talla. Opciones:
   a) solo se automatizan productos cuya variante se resuelva por talla y quede
      única; el resto va a revisión manual (recomendado para F1);
   b) añadir selector de color al front (fuera de alcance según el encargo);
   c) automatizar solo productos con una única variante habilitada.
3. **Alias de atributos**: ¿tabla `mastershop_attr_alias` editable por el admin,
   o normalización en código (`COLOR/Color/color → color`, `TALLA/TALLAS → talla`)
   + tabla solo para excepciones? (Recomendado: normalización + tabla pequeña.)
4. **`externalOrderId`**: ¿uso la **referencia de Wompi**
   (`UPBUY-2026-000011-a1b2c3d4`) o el **`orderNumber`** (`UPBUY-2026-000011`) como
   `externalOrderId` e `id_order`? La referencia de Wompi es única por intento
   (permite reintentos de pago) pero cambia si el comprador reintenta; el
   `orderNumber` es estable pero puede tener varios intentos. (Recomendado:
   `externalOrderId = payment.reference`, y `id_order = order.orderNumber` —
   MasterShop devuelve 409 si se repite.)
5. **Tabla de intentos**: ¿reutilizo `sync_logs` (`direction:'out'`,
   `action:'create_order'`) o creo `mastershop_order_attempts` con
   request/response redactados? (Recomendado: `mastershop_order_attempts`;
   `sync_logs` no guarda payloads.)
6. **Outbox**: ¿te vale una tabla `mastershop_order_outbox` explícita
   (unique `orderId`, `status`, `attempts`, `nextAttemptAt`) procesada por el
   cron existente, sabiendo que en Vercel Hobby el cron corre **1×/día**? Si
   quieres reintento rápido, habría que exponer un endpoint admin
   "reintentar ahora" (recomendado) o subir el plan.
7. **Dirección**: MasterShop exige 11 llaves por dirección y valida
   `country`/`currency`. Nuestro snapshot tiene `recipientName, phone, email,
   address, city, department, postalCode, reference, notes` pero **no
   `country`, `district`, `company` ni `address2`**. ¿Mando `country: "CO"`,
   `state: department`, `city: city`, `address2: null`, `district: null`,
   `company: null`? ¿O exiges una dirección normalizada antes de crear pedidos?
   (Recomendado: mapear y no bloquear.)
8. **Documento del cliente**: `documentType`/`documentNumber` no existen en
   `orders` ni en el perfil. MasterShop acepta **ambos o ninguno**. ¿Mando
   `null`/`null` (recomendado) o añadimos captura de cédula en el perfil?

---

## Plan por fases (ajustado al código existente)

| Fase | Entrega | Toca |
| --- | --- | --- |
| F1 | Normalizar `variation[]`, `products.sizes` real, resolución `order_items → idVariant`, reporte de huecos, `ensureMastershopOrdersSchema` (columnas `ms_*` en `orders` + outbox/attempts) | `mastershop.normalize.js`, `ensureMastershopOrdersSchema.js`, `scripts/syncMastershop*.js` |
| F2 | `mastershop.orders.js`: `buildOrderPayload` puro + `createOrder` con mapeo de errores y reintentos; `upstreamBody` en el cliente | `mastershop.client.js`, `mastershop.orders.js`, tests |
| F3 | Endurecer el webhook: firma timing-safe (ya), ambiente (ya), persistir evento, **encolar** en outbox y responder 200 (<1 s) | `Services/wompi.js`, `Controllers/webhooks.js`, tests de firma |
| F4 | `syncPaidOrderToMastershop(orderId)` + reintento desde cron + handler de duplicado | `Services/mastershopOrders.service.js`, `Services/cron.js` |
| F5 | Conciliación `npm run reconcile:mastershop`, alertas, índice único `msIdOrder` | `scripts/reconcileMastershop.js` |
| F6 | Tests de integración con fetch mockeado, smoke test real (pedido barato + `PUT /api/orders/{idOrder}` `{"idStatus":9}`), runbook | `docs/integracion-mastershop-wompi.md` |

**Criterio de aceptación de esta fase**: inventario con rutas reales ✔,
esquema de variantes verificado en vivo ✔ (con dos `TODO` acotados),
diagnóstico y plan coherentes ✔, ningún archivo de `Back/`/`Front/` modificado ✔.
