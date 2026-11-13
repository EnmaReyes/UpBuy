# AGENTS.md — UPBUY

Guía raíz del monorepo **UPBUY**. Todo lo que se haga en este repositorio es
**propio de UPBUY**: ni en el código, ni en los textos, ni en los correos, ni en
los identificadores quedan rastros de marcas o proyectos anteriores.

> Este archivo cubre el monorepo completo. Las reglas específicas del frontend
> (Kokonut UI, design system, reglas de Next.js) viven en
> [`Front/AGENTS.md`](Front/AGENTS.md). Si las dos se contradicen, manda
> `Front/AGENTS.md` para el código de `Front/` y este archivo para el resto.

---

## 1. Identidad de la marca

- La marca es **UPBUY**. Se escribe en mayúsculas en logotipos y textos de
  marketing; `UpBuy` o `Upbuy` solo como nombre propio de la entidad en
  textos técnicos (nombres de modelo, mensajes de log).
- **Numeración de pedidos**: `UPBUY-<año>-<6 dígitos>`, p. ej.
  `UPBUY-2026-000011`. Se genera en `Back/Services/orders.js`
  (`generateOrderNumber`) a partir de la secuencia `order_number_seq`. El
  prefijo es parte del contrato con el cliente: no se cambia sin migración ni
  actualización de los pedidos existentes.
- **Correo del remitente**: `upbuy.official@gmail.com` (ver `GOOGLE_MAIL_FROM`
  en `Back/.env.example` y `Back/config.js`).
- **Base de datos**: nombre por defecto `upbuy`.
- **Tokens de sesión / claves deStorage** del frontend llevan prefijo
  `upbuy_` o `upbuy.` (`upbuy_session`, `upbuy.cart.v1`).
- No introduzcas nombres de terceros, marcas personales ni proyectos previos en
  identificadores, clases CSS, variables, textos o comentarios. Si hay que
  renombrar algo existente, hazlo en el mismo cambio y actualiza los tests.

---

## 2. Estructura del repo

Dos paquetes **independientes** (sin `package.json` raíz, sin workspaces, sin CI):

| Carpeta  | Stack                                              | Entry               |
| -------- | -------------------------------------------------- | ------------------- |
| `Back/`  | Node 22 + Express 4 + Sequelize 6 + PostgreSQL, **CommonJS** | `Back/index.js` |
| `Front/` | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 | `Front/src/app` |

Cada uno se despliega como **su propio proyecto de Vercel**. Corre los comandos
`npm` **desde dentro de la carpeta del paquete**.

```
UpBuy/
  AGENTS.md            # este archivo (guía raíz del monorepo)
  DEPLOY.md            # guía de despliegue en Vercel
  Back/                # API REST + catálogo + dropshipping
  Front/               # e-commerce (Next.js 16)
  design-system/       # referencias de diseño de UpBuy
  .agents/skills/      # skills instaladas (nodejs-backend-patterns)
```

---

## 3. Comandos

```bash
# Back (API, puerto 3000)
cd Back
npm install
npm run dev            # nodemon index.js
npm start              # sin watcher
npm test               # node --test test/*.test.js

# Front (puerto 3001)
cd Front
npm install
npm run dev            # next dev -p 3001
npm run build
npm run typecheck      # tsc --noEmit
```

Scripts de base de datos (desde `Back/`): `db:create`, `db:bootstrap`,
`db:check`, `db:migrate`, `db:verify-migration`, `db:migrate:catalog`,
`db:verify-catalog`, `venndelo:check`.

En `Front/` **no hay lint configurado**: usa `npm run typecheck` y `npm run build`
como verificación.

---

## 4. Entorno y secretos

- `.env.example` se versiona y es **plantilla sin secretos**. Los valores reales
  van en `.env.local` (gitignored) o en las *Environment Variables* de Vercel.
- El backend carga `.env` y luego `.env.local` con `override: true`
  (`Back/config.js`). Los tests que necesitan controlar el entorno usan
  `UPBUY_SKIP_DOTENV=1`.
- `JWT_SECRET` es **obligatorio en producción**: `config.js` falla rápido si
  falta. Nunca lo hardcodees fuera de `config.js`.
- `CRON_SECRET` vacío ⇒ el endpoint de cron responde **401 siempre**. No pongas
  un valor por defecto: sería un fallo de seguridad silencioso.
- `SUPPLIER_CREDENTIALS_ENCRYPTION_KEY` (base64, 32 bytes) cifra las
  credenciales del proveedor en `supplier_credentials`. Sin ella, la rotación
  del refresh token no se persiste.
- El frontend solo lee `NEXT_PUBLIC_API_URL` (se incrusta en build). Varía en
  `Front/src/services/api/client.ts`.
- La cookie de sesión es cross-site: en producción `sameSite=none` + `secure`.
  **Front y Back deben estar ambos en `https`.**

---

## 5. Backend (`Back/`)

### Capas

```
Rutas/ -> Controllers/ -> Services/ -> DataBase/models/
```

- Las **rutas** solo validan y delegan; los **controllers** son HTTP delgado
  (`req`/`res`); la lógica de negocio vive en `Services/`; el acceso a datos
  en `DataBase/models/`. No metas reglas de negocio en un controller.
- `Services/statusMachine.js` es **lógica pura** (sin DB) y decide si una
  transición de estado es válida. Las transiciones reales + auditoría viven en
  `Services/orderService.js`.
- `Back/Utils/HttpError.js` + `Middlewares/errors.js` son la forma oficial de
  responder errores. `Middlewares/respond.js` tiene los helpers de respuesta.

### Dos ciclos de estado independientes

| Campo                    | Responde                             |
| ------------------------ | ------------------------------------ |
| `Order.fulfillmentStatus` | ¿Dónde va el pedido físicamente?    |
| `Order.paymentState`      | ¿Dónde va el dinero?                 |

```
pending_payment → paid → packing → shipped → delivered
unpaid → pending_collection → collected → settled
```

- `fulfillmentStatus = "paid"` significa **cumplimiento liberado**, NO
  "dinero cobrado". En COD el dinero entra al entregar.
- Transición inválida → **422**. `shipped` sin guía → **422**.
- El auto-sync **nunca pisa** un cambio manual (`manualOverride`).
- Todo cambio queda en `audit_logs` y `order_status_history`.
- Detalle completo en [`Back/docs/ESTADOS.md`](Back/docs/ESTADOS.md).

### UpBuy es la fuente de verdad

Los estados crudos de los proveedores (Vendelo / Dropi / Venndelo) **nunca** se
exponen al usuario ni al admin: se mapean a los estados canónicos
(`mapProviderToCanonical` en `statusMachine.js`). Si el proveedor falla, el
pedido sigue su curso y queda marcado `providerOutOfSync` para reintentar.

### Esquema

- `sequelize.sync()` **solo corre fuera de producción**. En producción el
  esquema lo aplican `ensureBaseSchema`, `ensureCatalogSchema` y
  `ensureDropshippingSchema`: son **idempotentes** y no hacen nada cuando ya
  está todo al día.
- No hay runner de migraciones en producción: los scripts de `Back/scripts/`
  se corren a mano (o `npm run db:bootstrap` contra una base Neon nueva).
- El número de pedido usa la secuencia de Postgres `order_number_seq`.

### Proveedores

- **Venndelo Pro** (catálogo): OAuth 2.0 con refresh + rotación + single-flight;
  credenciales cifradas con AES-256-GCM; paginación por cursor; el **stock**
  sigue las unidades reales; el **precio de venta nunca se pisa**; un producto
  sin stock se **desactiva**, no se borra; un producto con pedidos jamás se
  elimina. Detalle en [`Back/docs/PROVEEDORES.md`](Back/docs/PROVEEDORES.md).
- **Vendelo / Dropi** (pedidos): `VENDELO_*` (una N) es el adaptador de pedidos
  heredado; `VENNDELO_*` (doble N) es la API administrativa real. No los
  confundas. Sin credenciales el adaptador queda en modo manual (CSV/panel).
- Agregar un proveedor nuevo: `integrations/suppliers/<slug>/` con `auth`,
  `client` y `catalog`; se registra en `integrations/suppliers/index.js`. Los
  servicios de `Services/catalog/` no cambian.

### Pagos (Wompi)

- El **monto nunca** se toma del webhook ni del front: se relee de `Order`.
- La firma del webhook se calcula sobre el **cuerpo crudo** (`req.rawBody`),
  no sobre un `JSON.parse` re-serializado.
- Webhooks idempotentes por `(provider, eventId)`.
- Sin credenciales de Wompi los endpoints de pago responden 503 y el checkout
  sigue funcionando con el flujo manual (transferencia/Nequi por WhatsApp).

### Seguridad

- Tokens y contraseñas solo en `.env.local` / variables del proveedor.
- `trust proxy` se configura con `TRUST_PROXY` (en producción = 1) para que el
  rate limit no vea una sola IP detrás del proxy de Vercel.
- El tracking público exige teléfono o correo del pedido.

---

## 6. Frontend (`Front/`)

- **Next.js 16** renombró `middleware.ts` → `proxy.ts` (y `middleware` →
  `proxy`). El front **no valida el JWT**: solo comprueba que exista la cookie
  `access_token` para redirigir temprano; la validación real la hace el backend
  en cada petición.
- Rutas en `Front/src/app` con grupos: `(auth)` (login, registro) y `(store)`
  (home, productos, carrito, checkout, cuenta, mis-pedidos, seguimiento).
- Toda llamada HTTP pasa por `Front/src/services/api/client.ts`:
  - `apiFetch` → lecturas públicas (catálogo), sin cookies, con `revalidate`.
  - `apiSend` → peticiones con sesión (`credentials: "include"`).
  - `apiGetOptional` / `apiSessionProbe` → widgets optimistas que no deben
    romper la página si no hay sesión.
  - Los errores del backend llegan como **texto JSON** o `{ message, code }`;
    el cliente los normaliza a `ApiError`.
- Datos del dominio en `Front/src/services/{catalog,orders,payments,account,auth}`.
  Los tipos viven en `Front/src/types/`.
- El carrito vive en `Front/src/context/cart-context.tsx` y persiste en
  `localStorage` bajo `upbuy.cart.v1`.
- **Todos los textos de UI en español.** Sin copy comercial en inglés.
- Accesibilidad es prioridad 1: contraste ≥ 4.5:1, alt en imágenes, navegación
  por teclado con focus visible, `aria-label` en botones de solo icono, touch
  targets ≥ 44×44px, y respeto a `prefers-reduced-motion`.

### Design system

Detalle completo en [`Front/docs/DESIGN_SYSTEM.md`](Front/docs/DESIGN_SYSTEM.md)
y en `Front/AGENTS.md`.

- Paleta (tokens en `src/app/globals.css`): carbon `#0B0B0B`, cream `#F5E9D7`,
  terracotta `#D35400`, coffee `#8B6F56` (+ derivados `-deep` para texto
  pequeño sobre fondo claro).
- Tipografía: **Space Grotesk** (headings), **Manrope** (body); precios con
  `tabular-nums`.
- Grid de productos: 2 columnas en móvil, 3 en tablet, 4 en desktop.
- Iconografía: `lucide-react`. **Nada de emoji como icono.**
- Imágenes: `next/image` siempre, WebP/AVIF, lazy por defecto, `priority` en el
  hero, y espacio reservado para no romper el layout (CLS < 0.1).
- Componentes base: shadcn/ui + Kokonut UI. **Instala con la CLI de shadcn**
  (`npx shadcn@latest add @kokonutui/<name>`), nunca pegando código a mano; los
  componentes instalados son código del proyecto: edítalos en su sitio.
- El hero usa `<GlitchText />` de `src/components/GlitchText.tsx` (React Bits),
  no CSS genérico.

---

## 7. Contrato entre front y back

- El front **solo conoce** los endpoints públicos de la API. No inventes rutas:
  revisa `Back/Rutas/` y `Back/README.md` antes de llamar a una nueva.
- El tracking público y la consulta de pedido usan el **UUID** del pedido, no
  `orderNumber`, y exigen teléfono o correo coincidente.
- `POST /api/orders` exige perfil completo; si falta algo responde
  `{ "code": "PROFILE_INCOMPLETE", "missing": [...] }`.
- El campo `orderNumber` es la referencia visible para el cliente; `id` (UUID) es
  la clave interna.

---

## 8. Despliegue

Ver [`DEPLOY.md`](DEPLOY.md) para el paso a paso completo.

- Dos proyectos de Vercel, cada uno con su **Root Directory** (`Back` / `Front`).
  Importar el repo completo sin cambiarlo detecta ninguna de las dos apps.
- Orden: desplegar `Back` → copiar su URL → `NEXT_PUBLIC_API_URL` en `Front` →
  `FRONTEND_URL` en `Back` → redeploy del `Back`.
- `GET /health` debe responder `{ "ok": true, "db": "up" }`. Un `200` en `/` con
  `503` en `/api/*` significa "la función arrancó, la base es el problema".
- Crons (Vercel Hobby = 1×/día, `0 12 * * *`):
  `/api/cron/sync-providers` y `/api/cron/sync-catalog`. El schedule real vive
  en `Back/vercel.json`; **Vercel no lee variables de entorno para el cron**.

---

## 9. Tests

`cd Back && npm test` (`node --test`). Cubren lo crítico: transiciones de estado,
efectos COD, gating de perfil, cálculo de `netProfit`, idempotencia de
webhooks, normalización de catálogo y autenticación de Venndelo.

Antes de dar por terminado un cambio en `Back/`:

```bash
cd Back && npm test
cd Front && npm run typecheck && npm run build
```

Si un test necesita base de datos real, **se salta solo** cuando no la hay:
no lo deshabilites para que pase.

---

## 10. Reglas de estilo

- Comentarios y documentación en **español**, sin tildes en el código cuando el
  archivo ya las evita (el backend escribe el ASCII plano por consistencia).
- Los archivos y carpetas del backend usan `PascalCase`/`camelCase` según el
  módulo existente; **no anglicices** ni renombres rutas sin motivo.
- No uses `console.log` en el backend: usa `Utils/logger.js`
  (`LOG_LEVEL`: `debug|info|warn|error`).
- Nada de secretos en el repo, ni en `.env.example`.
- Si agregas un endpoint, actualiza `Back/README.md` y el contrato del front
  (`Front/docs/BACKEND_INTEGRATION.md`).
