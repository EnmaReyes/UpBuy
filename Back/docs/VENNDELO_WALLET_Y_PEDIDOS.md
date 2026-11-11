# Venndelo — Wallet y pedidos (backend admin)

Integración administrativa con la API de Venndelo Pro. Reutiliza la
autenticación OAuth2 ya existente (`integrations/suppliers/venndelo/`):
`refresh_token` → `access_token`, caché en memoria, single-flight y rotación
del refresh token persistida y cifrada.

> **Importante:** esto es operación del proveedor (financiar la wallet de
> Venndelo y crear/consultar pedidos allí). El pago del **cliente final** sigue
> siendo **Wompi** (`Services/wompi.js`). No mezclar ambos flujos.

## Endpoints

Todas las rutas exigen sesión + rol admin (cookie `access_token`) y están
montadas bajo el panel de proveedores:

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/api/admin/suppliers/venndelo/wallet/topup` | Crea un topup y devuelve `{ payment_url }` |
| GET | `/api/admin/suppliers/venndelo/wallet/balance` | Saldo de la wallet |
| POST | `/api/admin/suppliers/venndelo/orders` | Crea un pedido en Venndelo |
| GET | `/api/admin/suppliers/venndelo/orders` | Lista pedidos (proxy de la paginación de Venndelo) |
| GET | `/api/admin/suppliers/venndelo/orders/:id` | Detalle de un pedido de Venndelo |
| POST | `/api/webhooks/venndelo` | Webhook de eventos de pedidos/envíos (chatbot) |

### Topup

```http
POST /api/admin/suppliers/venndelo/wallet/topup
Content-Type: application/json

{ "amount": 50000, "return_url": "https://tu-front/admin/venndelo/exito", "cancel_url": "https://tu-front/admin/venndelo/cancelado" }
```

Respuesta `201`:

```json
{ "payment_url": "https://..." }
```

`return_url` / `cancel_url` son opcionales; si no se envían se usan
`VENNDELO_RETURN_URL` / `VENNDELO_CANCEL_URL`.

### Saldo

```http
GET /api/admin/suppliers/venndelo/wallet/balance
```

### Pedidos

```http
POST /api/admin/suppliers/venndelo/orders
Content-Type: application/json
Idempotency-Key: mi-clave-unica

{
  "customer": { "name": "...", "phone": "...", "email": "..." },
  "items": [{ "sku": "...", "quantity": 1 }],
  "payment_method_code": "COD_VENDELO",
  "shipping": { "address": "...", "city": "..." }
}
```

El cuerpo se reenvía **tal cual** a `POST /v1/admin/orders` (no se inventan
campos). Se valida lo mínimo: `items` no vacío, `payment_method_code` y
`customer`.

Idempotencia: se manda el header `Idempotency-Key`; si no viene, se usa
`orderId`/`order_id` del cuerpo. `// TODO: validar contra doc Venndelo`.

### Webhook de eventos (chatbot)

`POST /api/webhooks/venndelo` recibe:

`ORDER_CREATED`, `ORDER_CANCELLED`, `ORDER_CONFIRMATION_REQUESTED`,
`ORDER_PREPARED`, `READY_FOR_PICKUP`, `ORDER_SHIPPED`, `ORDER_DELIVERED`,
`SHIPMENT_EXCEPTION_CREATED`, `SHIPMENT_STATUS_UPDATED`.

- Verifica firma HMAC-SHA256 si `VENNDELO_WEBHOOK_SECRET` está configurado
  (header `x-venndelo-signature` o `x-signature`). Sin secreto, acepta y avisa
  en el log.
- Deduplica por `WebhookEvent(provider = "venndelo", eventId)`.
- Responde `200` a eventos auténticos.
- Hoy **solo registra** el evento. `// TODO:` mapear a estados canónicos de
  Upbuy y actualizar `orders` / `OrderStatusHistory`.

## Variables de entorno

```dotenv
VENNDELO_API_URL=https://api.venndelo.com
VENNDELO_ADMIN_PATH=/v1/admin
VENNDELO_OAUTH_URL=https://api.venndelo.com/v1/admin/oauth/token
VENNDELO_CLIENT_ID=
VENNDELO_CLIENT_SECRET=
VENNDELO_REFRESH_TOKEN=
SUPPLIER_CREDENTIALS_ENCRYPTION_KEY=

VENNDELO_RETURN_URL=
VENNDELO_CANCEL_URL=
VENNDELO_WEBHOOK_SECRET=
```

Sin `VENNDELO_CLIENT_ID` / `CLIENT_SECRET` / `REFRESH_TOKEN` las rutas
responden `503` y el resto de la tienda sigue funcionando.

## Pruebas manuales (curl)

Obtener un access token (solo backend / local):

```bash
curl -X POST "$VENNDELO_OAUTH_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=refresh_token" \
  --data-urlencode "refresh_token=$VENNDELO_REFRESH_TOKEN" \
  --data-urlencode "client_id=$VENNDELO_CLIENT_ID" \
  --data-urlencode "client_secret=$VENNDELO_CLIENT_SECRET"
```

Probar la conexión desde el panel (con la cookie de sesión admin):

```bash
curl -X POST http://localhost:3000/api/admin/suppliers/venndelo/test-connection \
  -H "Cookie: access_token=<tu-jwt>"
```

Saldo:

```bash
curl http://localhost:3000/api/admin/suppliers/venndelo/wallet/balance \
  -H "Cookie: access_token=<tu-jwt>"
```

Topup:

```bash
curl -X POST http://localhost:3000/api/admin/suppliers/venndelo/wallet/topup \
  -H "Cookie: access_token=<tu-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"amount": 50000}'
```

Webhook (si hay secreto, firmar el cuerpo en hex):

```bash
BODY='{"event":"ORDER_CREATED","order_id":"123"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$VENNDELO_WEBHOOK_SECRET" -hex | awk '{print $2}')
curl -X POST http://localhost:3000/api/webhooks/venndelo \
  -H "Content-Type: application/json" \
  -H "x-venndelo-signature: $SIG" \
  -d "$BODY"
```

## Pendientes

- Persistir/mapear los eventos del webhook a los estados canónicos de Upbuy.
- Confirmar el header de idempotencia y el esquema exacto de `POST /orders`
  contra la documentación oficial de Venndelo.
- Confirmar el header/algoritmo de firma del webhook.