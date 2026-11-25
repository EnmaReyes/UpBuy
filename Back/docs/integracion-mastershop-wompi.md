# Integración MasterShop ↔ Wompi

Flujo automático: **pago aprobado en Wompi ⇒ pedido creado en MasterShop**, sin
intervención manual. Este documento explica el flujo, las variables de entorno,
cómo leer los logs, cómo reintentar un pedido fallido y el runbook de
incidentes.

- **Fuente de verdad del dinero**: UpBuy (Wompi).
- **Fuente de verdad del pedido físico**: MasterShop.
- MasterShop **nunca** expone sus estados crudos al comprador; UpBuy sigue
  mandando en la UI.

---

## 1. Flujo extremo a extremo

```
Comprador paga
      │
      ▼
Wompi ──POST /api/webhooks/wompi──┐
                                  ▼
                    verifyEventSignature (SHA256 timing-safe)
                                  │
                    ventana anti-replay + ambiente (test/prod)
                                  │
                    GET /v1/transactions/{id}   ← fuente de verdad
                                  │
                    webhook_events (dedupe por provider+eventId)
                                  │
                    registerPayment(APPROVED) → orders.fulfillmentStatus=paid
                                  │
                    INSERT mastershop_order_outbox(orderId,'pending')
                                  │
                    res.status(200)   ← < 1 s; NO crea pedido aquí
                                  │
──────────────────────────────────┼────────────────────────────
   cron /api/cron/sync-providers   │  (o botón "reintentar" del panel)
                                  ▼
              processMastershopOutbox()  ← toma filas pending listas
                                  │
              resolveOrderItem() → (id_product, id_variant)  ← Fase 1
                    │ falta mapeo → needs_review + intento registrado
                    ▼
              buildOrderPayload()  ← decimal exacto, valida total/moneda
                    ▼
              POST /api/orders  (timeout 20 s)
             /        |              \
        200 OK    500 "ya existe"    4xx/5xx
          │           │                │
     guardar       GET /api/orders   retryable → pending + backoff
     msIdOrder     ?externalOrderId  400       → needs_review
     outbox=done   → guardar idOrder 401/403   → failed + alerta
```

## 2. Capas del código

| Pieza | Archivo |
| --- | --- |
| Cliente HTTP (único) | `integrations/suppliers/mastershop/mastershop.client.js` |
| Crear/consultar/listar pedidos | `integrations/suppliers/mastershop/mastershop.orders.js` |
| Normalización de variantes | `integrations/suppliers/mastershop/mastershop.normalize.js` |
| Resolución item → variante | `Services/mastershopMapping.service.js` |
| Orquestador + outbox + conciliación | `Services/mastershopOrders.service.js` |
| Webhook de Wompi | `Services/wompi.js`, `Controllers/webhooks.js`, `Rutas/webhooks.js` |
| Esquema (idempotente) | `DataBase/ensureMastershopSchema.js` |
| Cron | `Services/cron.js` → `processMastershopOutbox` |
| Conciliación | `scripts/reconcileMastershop.js` (`npm run reconcile:mastershop`) |
| Sincronización de catálogo | `scripts/mastershopSync.js`, `scripts/mastershopReport.js` |

## 3. Variables de entorno

Nunca se escriben valores en el repo; solo en `.env.local` o en las variables de
Vercel.

| Variable | Para qué | Obligatoria |
| --- | --- | --- |
| `MASTERSHOP_API_URL` | Base de la API (`https://prod.api.mastershop.com`) | sí (tiene default) |
| `MASTERSHOP_API_KEY` | Header `ms-api-key`. Sin ella el flujo queda deshabilitado. | sí |
| `MASTERSHOP_HTTP_TIMEOUT_MS` | Timeout del cliente (default 20000) | no |
| `MASTERSHOP_SYNC_PAGE_SIZE` | Tamaño de página (máx. 50) | no |
| `WOMPI_PUBLIC_KEY` / `WOMPI_PRIVATE_KEY` | Checkout / reconsulta de transacción | sí |
| `WOMPI_INTEGRITY_SECRET` | Firma del checkout | sí |
| `WOMPI_EVENTS_SECRET` | Firma de los eventos del webhook | sí |
| `WOMPI_ENV` | `test` o `prod` (rechaza cruces) | sí |
| `WOMPI_BASE_URL` | API de Wompi (`production`/`sandbox`) | no (deriva de `WOMPI_ENV`) |
| `CRON_SECRET` | `Bearer` del endpoint de cron. Vacío ⇒ cron responde 401. | sí en prod |

Sin `MASTERSHOP_API_KEY` y sin llaves de Wompi el pedido sigue su curso manual
(transferencia/Nequi). La integración **no** rompe la tienda cuando falta algo.

## 4. Estados de sincronización (`orders.msSyncState`)

| Estado | Significado | Acción |
| --- | --- | --- |
| `pending` | En cola, aún sin enviar | automática (cron) |
| `synced` | Pedido creado; `msIdOrder` guardado | ninguna |
| `needs_review` | Falta mapeo de variante o MasterShop rechazó el esquema (400) | revisar el intento y corregir el mapeo/datos |
| `failed` | Error no reintentable (401/403) o reintentos agotados | revisar llave/logs y reintentar a mano |

Estados del **outbox** (`mastershop_order_outbox.status`): `pending`,
`processing`, `done`, `needs_review`, `failed`.

## 5. Cómo leer los logs

Todos los logs son estructurados por `scope` (filtrables en Vercel/Neon):

| Scope | Qué contiene |
| --- | --- |
| `wompi.webhook` | `firma_invalida`, `ambiente_distinto`, `ya_procesado`, `aplicado`, `encolado_outbox` |
| `mastershop.orders.service` | `Fallo creando pedido en MasterShop`, `Faltan mapeos de variante`, alarma de tasa de fallos |
| `mastershop.orders` | `createOrder ok` / `rechazado por validacion` / `rate limit` / `duplicado` |
| `mastershop.client` | `Respuesta de error de MasterShop` (status + rateLimit) |

Cada pedido lleva `correlationId` (= `order.id` en la creación, `reference` en el
webhook). **Nunca** aparecen la `ms-api-key`, la llave privada de Wompi ni datos
de tarjeta.

Ejemplo de búsqueda en Vercel: filtrar por `scope=mastershop.orders.service` y
`orderId=<uuid>`.

## 6. Diagnosticar un pedido que no se creó

```bash
cd Back

# 1. Qué desajustes hay (solo lectura, sin red)
npm run reconcile:mastershop

# 2. Añadir la comparación en vivo con MasterShop (últimos 7 días)
npm run reconcile:mastershop -- --remote

# 3. Salida completa en JSON (para pegar en un ticket)
npm run reconcile:mastershop -- --json
```

El informe lista:

- **Pagos aprobados SIN pedido en MasterShop** (lo más grave: cobró y no hay
  pedido en el proveedor).
- Pedidos en `failed` / `needs_review` con su `msSyncError`.
- Filas de outbox atascadas (>1 h sin avanzar).
- Con `--remote`: pedidos en MasterShop sin pago local y `msStatus`
  desincronizado.

Para ver el detalle de cada llamada:

```sql
SELECT attempt, action, ok, "httpStatus", retryable, error, "msIdOrder",
       "requestPayload", "responseBody", "durationMs", "createdAt"
FROM mastershop_order_attempts
WHERE "orderId" = '<uuid>'
ORDER BY "attempt";
```

El `requestPayload`/`responseBody` están **redactados** (sin secretos).

## 7. Cómo reintentar un pedido fallido

### 7.1 Fallo reintentable (5xx / 429 / timeout)

No hay que hacer nada: el outbox lo devuelve a `pending` con backoff exponencial
(tope 4 h) y el cron lo retoma. Para forzarlo antes:

```sql
UPDATE mastershop_order_outbox
   SET status = 'pending', "nextAttemptAt" = now(), attempts = 0
 WHERE "orderId" = '<uuid>';
```

Luego ejecutar el cron (o esperar la corrida diaria de Vercel Hobby).

### 7.2 Fallo de mapeo (`needs_review`)

1. Corregir el mapeo:
   ```bash
   npm run mastershop:sync        # vuelve a importar productos + variantes
   npm run mastershop:report      # muestra huecos de mapeo
   ```
2. Si el problema es una excepción de atributos, añadir una fila en
   `mastershop_attr_alias` (`kind='value'`, `source`, `target`).
3. Reencolar el pedido:
   ```sql
   UPDATE orders SET "msSyncState" = 'pending', "msSyncError" = NULL
    WHERE id = '<uuid>';
   UPDATE mastershop_order_outbox
      SET status = 'pending', "nextAttemptAt" = now(), attempts = 0
    WHERE "orderId" = '<uuid>';
   ```

### 7.3 Error 401/403 de configuración

Revisar `MASTERSHOP_API_KEY` en el entorno. **No** se reintenta solo (para no
martillar con una llave inválida). Al corregirla, reencolar como en 7.2.

## 8. Runbook de incidentes

| Síntoma | Causa probable | Acción |
| --- | --- | --- |
| Alarma "Tasa de fallos por encima del umbral" | MasterShop caído o llave inválida | mirar `httpStatus` en `mastershop_order_attempts`; si 401/403 revisar la llave |
| Pagos aprobados sin pedido | proceso murió tras el 200 / outbox atascado | `npm run reconcile:mastershop`; reencolar (7.1) |
| `needs_review` masivo | catálogo sin variantes o cambio de esquema | `npm run mastershop:sync` + `npm run mastershop:report` |
| Wompi reintenta el webhook | respondimos != 200 (firma/DB) | revisar `wompi.webhook`; la firma inválida repetida es señal de ataque |
| Pedido duplicado en MasterShop | doble POST (no debería: outbox único) | el 500 "ya existe" se resuelve solo con `GET ?externalOrderId`; verificar `msIdOrder` |

## 9. Idempotencia y garantías

- **Webhook**: dedupe por `webhook_events(provider, eventId)`; `eventId =
  sha256(evento|transactionId|status)`. Reenviar el mismo evento no duplica.
- **Outbox**: `orderId` único. Un pedido solo tiene una fila de envío.
- **Orden**: `orders.msIdOrder` único parcial. Un `idOrder` no puede quedar en
  dos pedidos locales.
- **Duplicado en MasterShop**: el 500 "Código 409 - La orden ya existe" se trata
  como éxito y se recupera el `idOrder` real vía `externalOrderId`.
- **Proceso muerto**: la fila queda `pending`/`processing`; el cron la retoma
  (las `processing` viejas se reclaman a los 15 min).

## 10. Smoke test controlado (API real)

No hay sandbox documentado de MasterShop. Un pedido de prueba se crea en
producción y **hay que cancelarlo**. Procedimiento:

1. Elegir un producto barato resoluble (una sola variante o talla única).
2. Crear el pedido desde un pago de prueba (Wompi `test`) o llamando al
   orquestador con una `reference` de prueba.
3. Verificar `idOrder` devuelto y persistido en `orders.msIdOrder`.
4. Cancelar con:
   ```http
   PUT /api/orders/{idOrder}
   Content-Type: application/json
   ms-api-key: <llave>

   { "idStatus": 9 }
   ```
5. Registrar en el ticket: `idOrder`, fecha, monto, resultado de la
   cancelación.

### Resultado del intento del 2026-11-24 (importante)

Ejecutado contra la API real dos veces (2026-11-24) con:

| Intento | `idProduct` | `idVariant` | SKU | Precio usado | Resultado |
| --- | --- | --- | --- | --- | --- |
| 1 | 70255 | 153076 | `""` | 19.500 (precio venta UpBuy) | 500 opaco |
| 2 | 266536 | 748819 | `A544` | 36.500 (precio real proveedor) | 500 opaco |

**No se creó ningún pedido**: la API devolvió 400 en la primera validación y
después un 500 opaco (`Código 400 - Request failed with status code 400 -
Error interno del servidor`, `data: null`). Al no haberse creado el pedido, no
hubo que cancelar nada. Al repetir con otro producto, variante, SKU y precio
reales el error es el mismo, así que **no es específico del producto**.

La validación 400 sí reveló detalles del contrato que el Anexo A no indicaba y
que **ya están corregidos en el código**:

| Campo | Comportamiento real | Ajuste aplicado |
| --- | --- | --- |
| `shipping_address.first_name` / `last_name` | No admiten `null` ni `""`; exigen solo letras y espacios | Se derivan de `addressSnapshot.recipientName` (`splitName`) |
| `customer.first_name` / `last_name` | Igual | Igual |
| `order_items[].weight` | Debe ser > 0 | Se toma el peso de la variante de la Fase 1 (mín. 0.01) |
| `order_transaction.payment_method` | Solo `cod` \| `pia`; rechaza `Wompi`/`Tarjeta` | Se fija `pia` — **TODO: confirmar con api@mastershop.com** |

Queda abierto el 500 interno de MasterShop: el proveedor no devuelve `data[]`
con el detalle y ocurre con productos distintos. Hipótesis a confirmar: la
llave actual tiene **alcance solo de catálogo** (lectura) y no permisos de
creación de pedidos, o hay un fallo interno del endpoint `POST /api/orders`.
Dado que UpBuy cobra con Wompi fuera de MasterShop (la API del proveedor no
conecta con la pasarela), conviene confirmar con `api@mastershop.com` si
existe una llave/permiso distinto para escribir pedidos.
**TODO: verificar con api@mastershop.com** antes de reintentar.

> **TODO adicional: verificar con api@mastershop.com** el caso de producto con
> variante única con `includeAllVariations=false`.

## 11. Checklist end-to-end en staging (Wompi test)

- [ ] `GET /health` → `{ ok: true, db: "up" }`.
- [ ] `MASTERSHOP_API_KEY`, `WOMPI_*` cargadas en el entorno de staging.
- [ ] `npm run mastershop:sync` sin errores; `npm run mastershop:report` revisado.
- [ ] Pago con tarjeta de prueba Wompi (`test`) → webhook responde 200.
- [ ] `webhook_events` tiene el evento (`processed=true`).
- [ ] `mastershop_order_outbox` tiene una fila `pending`/`done`.
- [ ] Correr el cron → `orders.msIdOrder` poblado, `msSyncState=synced`.
- [ ] `mastershop_order_attempts` muestra `ok=true`.
- [ ] Reenviar el mismo webhook → no se crea un segundo pedido.
- [ ] `npm run reconcile:mastershop` sin desajustes.
- [ ] Cancelar el pedido de prueba en MasterShop (`PUT {"idStatus":9}`).
