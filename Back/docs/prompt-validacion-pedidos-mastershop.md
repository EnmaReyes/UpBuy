# Prompt de análisis y validación — creación de pedidos en MasterShop

> **Cómo usar este archivo.** Pega todo su contenido (o pásalo como instrucción a
> un agente de código) cuando quieras auditar por qué el flujo
> «pago Wompi aprobado → pedido creado en MasterShop» no está funcionando.
> El objetivo es doble: **encontrar la causa real** (no parchear síntomas) y
> **demostrar que la integración de MasterShop sigue aislada de la de Venndelo**.

---

## 0. Rol y objetivo

Actúa como ingeniero backend senior de **UpBuy** (Node 22 + Express 4 +
Sequelize 6 + PostgreSQL, CommonJS). Debes:

1. **Analizar** el flujo completo de creación de pedidos en MasterShop, de punta
   a punta, leyendo el código real del repo (no supongas).
2. **Reproducir o localizar** por qué el pedido no se crea (el síntoma conocido
   es un `500` opaco de MasterShop en `POST /api/orders`, ver `Back/docs/integracion-mastershop-wompi.md` §10).
3. **Validar** cada regla del contrato de la API contra lo que el código arma.
4. **Verificar el aislamiento** MasterShop ↔ Venndelo: ninguna ruta de pedido,
   outbox, modelo ni mapeo puede cruzarse entre proveedores.
5. **Entregar** un informe con hallazgos, evidencia, corrección propuesta y
   plan de prueba. No apliques cambios sin listarlos y justificarlos.

Trabaja **en español**, comentarios y docs en español (regla de `AGENTS.md`).
No uses `console.log`: usa `Back/Utils/logger.js`.

---

## 1. Contexto del sistema (lo que ya existe)

- **Fuente de verdad del dinero**: UpBuy / Wompi.
- **Fuente de verdad del pedido físico**: MasterShop.
- El webhook de Wompi **no** crea el pedido: solo encola una fila en
  `mastershop_order_outbox` y responde 200 (patrón outbox).
- El **cron** `/api/cron/sync-providers` ejecuta `processMastershopOutbox()`.
- MasterShop usa autenticación por **llave estática** en el header `ms-api-key`
  (no OAuth; `supplier_credentials` cifrado es solo para Venndelo).

### Flujo esperado

```
Wompi (pago aprobado)
  → Services/wompi.js  (encola según resolveOrderProvider)
  → mastershop_order_outbox (status=pending)
  → Services/cron.js → processMastershopOutbox()
  → Services/mastershopOrders.service.js → syncPaidOrderToMastershop(reference)
       ├─ resolveOrderItem()            (Services/mastershopMapping.service.js)
       ├─ buildOrderPayload()           (integración, PURA)
       └─ createOrder() → POST /api/orders  (integración, HTTP)
  → orders.msIdOrder / msSyncState + mastershop_order_attempts
```

### Mapa de archivos a leer (en este orden)

| Pieza | Ruta |
| --- | --- |
| Cliente HTTP único | `Back/integrations/suppliers/mastershop/mastershop.client.js` |
| Auth (llave estática) | `Back/integrations/suppliers/mastershop/mastershop.auth.js` |
| Crear/consultar/listar pedidos | `Back/integrations/suppliers/mastershop/mastershop.orders.js` |
| Normalización de variantes | `Back/integrations/suppliers/mastershop/mastershop.normalize.js` |
| Atributos / resolución de variante | `Back/integrations/suppliers/mastershop/mastershop.attributes.js` |
| Mapeo item → variante | `Back/Services/mastershopMapping.service.js` |
| Orquestador + outbox + conciliación | `Back/Services/mastershopOrders.service.js` |
| Encolado tras pago | `Back/Services/wompi.js` (~línea 605-670) |
| Enrutamiento por proveedor | `Back/Services/orders/providerRouting.service.js` |
| Cron | `Back/Services/cron.js` |
| Esquema idempotente | `Back/DataBase/ensureMastershopSchema.js` |
| Modelos | `Back/DataBase/models/MastershopOrderOutbox.js`, `MastershopOrderAttempt.js`, `MastershopAttrAlias.js` |
| Config | `Back/config.js` (`MASTERSHOP_*`) |
| Doc y runbook | `Back/docs/integracion-mastershop-wompi.md` |
| Auditoría previa | `Back/docs/auditoria-mastershop.md` |
| Tests existentes | `Back/test/mastershop.*.test.js` |
| Conciliación | `Back/scripts/reconcileMastershop.js` (`npm run reconcile:mastershop`) |

---

## 2. Contrato oficial de la API (dato de entrada a validar)

> Fuente: documentación pública de MasterShop (Postman) aportada por el negocio.
> **Trátala como el contrato a cumplir**, pero recuerda que el código puede
> haber añadido reglas propias correctas o reglas inventadas.

### 2.1 Crear pedido — `POST https://prod.api.mastershop.com/api/orders`

- Headers: `ms-api-key: <API Key>`, `Accept: application/json`,
  `Content-Type: application/json`.
- El cuerpo **no** lleva ids de negocio ni usuario: salen de la llave.

Estructura del body:

```jsonc
{
  "id_order": "<string>",
  "shipping_address": { "zip","country","city","address1","address2",
    "full_name","first_name","last_name","phone","company","state","district" },
  "billing_address": { /* mismas 12 llaves */ },
  "order_transaction": { "total": "<number>", "currency": "<string>",
    "payment_method": "<string>", "payment_gateway": "<string>" },
  "customer": { "full_name","first_name","last_name","phone","email",
    "documentType","documentNumber","tags": [] },
  "order_items": [ { "id_product","id_variant","quantity","sku","name",
    "weight","price" } ],
  "additional_charge": [ { "type_charge","value" } ],
  "notes": [], "tags": []
}
```

**Reglas estrictas (todas responden 400 nombrando cuál falló):**

1. `order_transaction.total` debe ser **exactamente**
   `Σ(price × quantity) + Σ(additional_charge.value)`, sin tolerancia decimal.
   Calcular con aritmética decimal/entera, nunca con float de JS.
2. `currency` debe ser legal en el país de `shipping_address.country`
   (CO → COP).
3. `documentNumber` y `documentType`: **ambos con valor o ambos `null`**.
4. `id_order`: **solo letras, números y guiones medios (`-`)**. Con guion bajo
   (`_`) el pedido se crea pero luego `GET /api/orders?externalOrderId=...`
   falla con 400 → rompe la idempotencia/recuperación por duplicado.
5. `first_name` / `last_name` (en dirección **y** en cliente): **solo letras y
   espacios**; no admiten `null` ni `""`.
6. `order_items[].weight` debe ser **> 0**.
7. `payment_method`: solo `cod` (contra entrega) o `pia` (pago anticipado).

### 2.2 Actualizar estado — `PUT /api/orders/{idOrder}`

- Solo pedidos en estado 1 (Por confirmar) o 2 (Pendiente).
- Confirmar: `{"idStatus": 2}`. Cancelar: `{"idStatus": 9}`.
- **Requiere el `idOrder` interno** que devuelve el `POST`. Por eso hay que
  guardar los dos ids (externo `id_order` y `idOrder`).

### 2.3 Webhooks

- `POST /api/webhooks` crea la suscripción (`idWebhook`, `url`, `name`,
  `webhookName`; `idProduct` se ignora). Devuelve `idProductWebhook`, que
  **no se puede recuperar después** (no hay listado) → hay que persistirlo.
- `PUT /api/webhooks` habilita/deshabilita con `idProductWebhook` + `isEnable`.
- Eventos relevantes: `16` cambio de estado del pedido (incluye `order_logistics`
  con `url_tracking` y `carrier_tracking_code`), `17` cambio de estado de la
  transportadora, `18` entregado.
- El webhook **no trae firma HMAC** → validar los cambios reconsultando
  `GET /api/orders`.

---

## 3. Hipótesis de fallo a investigar (punto de partida)

El intento real del **2026-11-24** dio 500 opaco en dos productos distintos
(`Back/docs/integracion-mastershop-wompi.md` §10). Evalúa, con evidencia, cada
hipótesis y descarta las que no apliquen:

1. **Alcance de la llave**: `MASTERSHOP_API_KEY` solo tiene permiso de catálogo
   (lectura) y no de creación de pedidos. → Verifica que `test-connection`
   (`GET /api/products`) funcione pero el `POST /api/orders` falle.
2. **Desajuste de `total`**: `orders.total` incluye envío u otros conceptos,
   pero `mastershopOrders.service.js` envía `additionalCharge: []`. Si el total
   del pedido ≠ suma de `price × quantity` de los items, `buildOrderPayload`
   lo rechaza (motivo `payload_invalido`), y si pasa, MasterShop responde 400.
3. **Peso inválido**: variantes con `weight` 0 o ausente → se fuerza mínimo
   `0.01`; comprueba que el valor enviado realmente llegue > 0.
4. **`id_variant` ausente cuando el producto sí tiene variantes**: el mapeo
   devuelve `hasVariants=false` por error de normalización.
5. **Moneda/país**: `currency` debe ser COP y `country` CO; verifica que
   `mapAddress` no deje `country` distinto.
6. **Nombre del cliente no limpiado**: `first_name`/`last_name` con dígitos o
   símbolos (MasterShop los rechaza). `splitName` no sanea caracteres.
7. **`id_order` inválido**: ¿`orderNumber` cumple `^[A-Za-z0-9-]+$`?
   (`UPBUY-2026-000011` sí; cualquier variante con `_` no).

> El 500 «`Código 400 - Request failed ... data: null`» apunta a una validación
> interna del proveedor. Para diagnosticarlo necesitas el **cuerpo crudo**
> (`upstreamBody`) y el **status real** (`upstreamStatus`): confirma que
> `mastershop_order_attempts.requestPayload/responseBody` los guarda redactados
> y que `createOrder` los propaga en cada rama.

---

## 4. Regla de aislamiento MasterShop ↔ Venndelo (crítica)

**No puedes acoplar las dos integraciones.** Verifica explícitamente:

- [ ] Cada proveedor tiene su **propio** outbox: `mastershop_order_outbox`
      (tabla `MastershopOrderOutbox`) vs `venndelo_order_outbox`
      (`VenndeloOrderOutbox`). Sin tablas compartidas ni columnas cruzadas.
- [ ] Cada proveedor tiene su **propio** servicio:
      `Services/mastershopOrders.service.js` vs `Services/venndeloOrders.service.js`.
- [ ] Cada uno tiene su **propio** mapeo: `Services/mastershopMapping.service.js`
      vs el de Venndelo. No reutilizar `resolveOrderItem` de MasterShop en
      Venndelo ni al revés.
- [ ] El **enrutamiento** es único y conservador
      (`Services/orders/providerRouting.service.js`): todos los items del pedido
      deben ser del mismo proveedor; mixto o manual ⇒ **no se crea pedido
      parcial**.
- [ ] `Services/wompi.js` encola en el outbox correcto según
      `SUPPLIER_SLUG`; no encola en ambos.
- [ ] `Services/cron.js` procesa ambos outbox de forma independiente
      (`processMastershopOutbox` y `processVenndeloOutbox`).
- [ ] Modelos/estados: `orders.ms*` (MasterShop) no se mezclan con `orders.vd*`
      (Venndelo).
- [ ] Config separada: `MASTERSHOP_API_KEY` vs credenciales OAuth de Venndelo
      (cifradas en `supplier_credentials`). MasterShop **no** debe leer
      credenciales de la base.
- [ ] Ninguna ruta de `Back/Rutas/suppliers/mastershop.routes.js` expone pedidos,
      billetera ni webhooks: MasterShop hoy solo se integra como catálogo en el
      panel.
- [ ] Si detectas acoplamiento, **documéntalo como hallazgo** y propón la
      separación; no lo fusiones.

---

## 5. Tareas concretas (haz esto)

### Fase A — Análisis estático (sin red)

1. Traza el flujo real desde `Services/wompi.js` hasta `createOrder`, citando
   archivo y línea.
2. Compara el payload que produce `buildOrderPayload` con el contrato de §2.1.
   Enumera **cada campo** y si cumple, falta o es inválido.
3. Revisa `mapAddress`, `mapCustomer` y `resolveOrderItems` de
   `mastershopOrders.service.js`: ¿algún campo llega `null`/`""`/`0` cuando el
   contrato lo prohíbe?
4. Comprueba la aritmética del `total`: ¿se calcula en centavos enteros? ¿el
   `order.total` incluye conceptos que no van en `order_items`?
5. Revisa que `createOrder` propague `upstreamStatus` y `upstreamBody` en
   **todas** las ramas de error y que `mastershop_order_attempts` los guarde.
6. Audita el aislamiento de §4 y anota cualquier violación.

### Fase B — Validación con pruebas (sin red)

7. Ejecuta la suite existente y anota el resultado:
   ```bash
   cd Back && npm test
   ```
   Presta atención a `mastershop.orders.test.js` (payload puro),
   `mastershop.createOrder.test.js` (mapeo de errores con `fetch` mockeado),
   `mastershop.reconcile.test.js`.
8. **Añade pruebas unitarias** que cubran los huecos detectados (totales con
   envío, `weight` 0, `id_variant` presente/ausente, nombre con caracteres
   raros, `id_order` con `_`). No toques las pruebas existentes para que pasen.

### Fase C — Validación contra la API real (con red, bajo demanda)

> Solo si tienes `MASTERSHOP_API_KEY` en el entorno. Un pedido de prueba se crea
> en **producción** y hay que cancelarlo.

9. Diagnóstico de desajustes locales:
   ```bash
   cd Back && npm run reconcile:mastershop -- --json
   ```
   (Añade `--remote` para comparar en vivo los últimos 7 días.)
10. Revisa la bitácora de intentos (datos redactados):
    ```sql
    SELECT attempt, action, ok, "httpStatus", retryable, error, "msIdOrder",
           "requestPayload", "responseBody", "durationMs", "createdAt"
    FROM mastershop_order_attempts
    WHERE "orderId" = '<uuid>'
    ORDER BY "attempt";
    ```
11. Si procede, smoke test de §10 de `integracion-mastershop-wompi.md` y
    **cancela** con `PUT /api/orders/{idOrder}` `{"idStatus": 9}`.

### Fase D — Corrección

12. Propón el cambio mínimo que elimine la causa raíz (no un parche).
    Indica archivo, función y diff conceptual.
13. Si el bloqueo es externo (alcance de la llave), deja el hallazgo y el
    ajuste de **observabilidad** (que el error quede accionable en
    `needs_review` con `msSyncError`), sin inventar datos del cliente.
14. Aplica cambios solo si el usuario lo pide; si no, entrégalos como propuesta.

---

## 6. Entregable (formato del informe)

Devuelve un informe Markdown con estas secciones:

1. **Resumen ejecutivo** (3-5 líneas): ¿se crea el pedido? ¿por qué no?
2. **Causa raíz** (o lista de causas candidatas ordenadas por evidencia).
3. **Hallazgos por campo**: tabla `campo | esperado (contrato) | enviado (código) | veredicto`.
4. **Evidencia**: rutas + líneas de código, salida de tests, filas de
   `mastershop_order_attempts`, resultado de `reconcile`.
5. **Aislamiento MasterShop ↔ Venndelo**: checklist de §4 con ✅/❌ y justificación.
6. **Corrección propuesta**: diff conceptual por archivo, con tests.
7. **Plan de verificación**: comandos exactos y resultado esperado.
8. **Riesgos / pendientes** (p. ej. confirmar alcance de la llave con
   `api@mastershop.com`).

---

## 7. Guardrails (no hacer)

- ❌ No mezclar código, tablas ni estados de MasterShop con Venndelo.
- ❌ No cambiar el prefijo `UPBUY-` de `orderNumber` (contrato con el cliente).
- ❌ No hardcodear secretos: van en `.env.local` / variables de Vercel.
- ❌ No usar `console.log` en el backend.
- ❌ No inventar datos del cliente para «hacer pasar» la validación.
- ❌ No crear pedidos parciales ni elegir proveedor «por mayoría».
- ❌ No modificar código sin avisar; primero el informe.
- ❌ No exponer la `ms-api-key` ni llaves de Wompi en logs ni en el informe.
- ✅ Antes de cerrar un cambio en `Back/`: `cd Back && npm test`. Si tocas
  `Front/`: `cd Front && npm run typecheck && npm run build`.
