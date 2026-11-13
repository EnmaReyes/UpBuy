# PROMPT MAESTRO — Panel de administración UPBUY (por fases)

> Documento de trabajo para construir el **panel de administración** de UPBUY.
> Se ejecuta **una fase a la vez**, con aprobación explícita antes de pasar a la
> siguiente. No es una sugerencia: es el contrato de alcance.
>
> Ruta propuesta del panel: **`/admin`** dentro del mismo proyecto de `Front/`
> (mismo dominio, misma cookie `access_token`, mismo design system). No se crea
> una tercera app.

---

## 0. Cómo usar este documento

1. Pega el bloque **«Prompt de arranque»** (§11) en el agente.
2. El agente ejecuta **solo la fase indicada** y se detiene.
3. Al final de cada fase entrega: alcance, archivos tocados, endpoints nuevos,
   capturas o descripción de UI, comandos de verificación y riesgos.
4. No se avanza a la fase siguiente sin aprobación.
5. Si una fase requiere un cambio de alcance, se propone y se espera. No se
   «aprovecha» para meter funcionalidades de otras fases.
6. **La fase ADM-S (endurecimiento de autenticación admin) es prerrequisito de
   ADM-1.** Su auditoría y su diseño están en
   [`Back/docs/SEGURIDAD_ADMIN.md`](Back/docs/SEGURIDAD_ADMIN.md). No se abre
   `/admin` sin cerrar al menos los P0 de ese documento.

Idioma: **español** en UI, comentarios y documentación. Sin rastros de marcas
ajenas. La marca es **UPBUY**.

---

## 1. Rol y objetivo

Actúa como ingeniero full-stack senior del monorepo UPBUY. Vas a construir el
panel de administración **encima de lo que ya existe**, sin reescribir el
ecommerce ni duplicar reglas de negocio.

Objetivo funcional del panel:

- Perfil del administrador con los **mismos campos del perfil de usuario**.
- Gestión manual de pedidos y visibilidad del estado sincronizado con
  **Vendelo / Dropi** (pedidos) y **Venndelo Pro** (catálogo).
- Avisos en tiempo casi real cuando un cliente compra.
- Difusión por **email** y **WhatsApp** a usuarios registrados, con consentimiento.
- Gráficos de ventas con filtros **diario / semanal / mensual / anual** usando
  componentes de **Kokonut UI**.
- **Spending Ring** de Kokonut para la distribución de ventas entre proveedores.
- Herramientas de control para proveedores y para **ventas propias sin API**
  (registro manual, importación CSV, contabilidad, exportaciones).

---

## 2. Lecturas obligatorias antes de escribir código

En este orden:

1. `AGENTS.md` (raíz) — marca, capas, estados, contrato, despliegue.
2. `Front/AGENTS.md` — Next.js 16, Kokonut UI, design system.
3. `Back/README.md` — endpoints reales.
4. `Back/docs/ESTADOS.md` y `Back/docs/PROVEEDORES.md`.
5. `Front/docs/BACKEND_INTEGRATION.md`, `Front/docs/DESIGN_SYSTEM.md`,
   `Front/docs/PROJECT_PLAN.md`.
6. `Front/node_modules/next/dist/docs/` — Next.js 16 tiene cambios de API.
   Léelo antes de tocar rutas, layouts o `proxy.ts`.
7. Código real de:
   - `Back/Middleware/auth.js` (`requireAdmin` revalida el rol en base).
   - `Back/Rutas/adminOrders.js`, `Back/Controllers/adminOrders.js`,
     `Back/Services/adminOrders.js`.
   - `Back/Services/accounting.js`, `Back/Services/statusMachine.js`,
     `Back/Services/syncService.js`, `Back/Services/notifications.js`.
   - `Back/Services/gmail.js` (Gmail ya existe; las rutas de campañas no).
   - `Front/src/services/api/client.ts` y `server.ts`.
   - `Front/src/proxy.ts`, `Front/src/lib/safe-url.ts`.
   - `Front/src/app/globals.css`, `Front/src/components/kokonutui/`.

Si algo de este documento contradice el código, **manda el código** y se reporta
la diferencia antes de implementar.

---

## 3. Estado real del sistema (no inventar)

### 3.1 Backend que YA existe

| Área | Endpoints / servicios | Notas |
|---|---|---|
| Sesión admin | `requireAuth`, `requireAdmin` en `Middleware/auth.js` | Revalida `admin` contra la BD en cada petición. |
| Pedidos admin | `GET/POST/PATCH /api/admin/orders/*` | Lista, detalle, estados, guía, sync, push, pagos, venta manual. |
| Resumen | `GET /api/admin/orders/stats` | Totales por estado logístico y por estado de pago. |
| Ventas | `GET /api/admin/orders/ventas?periodo=dia\|semana\|mes\|anio` | Serie con `actual`, `anterior`, `total`, `count`. Solo `paymentState = settled` y no cancelados. |
| Contabilidad | `GET /api/admin/orders/accounting?from=&to=&provider=` | `byProvider`, `byPaymentState`, `byPaymentMethodCode`, COD, margen, payouts. |
| Proveedores de pedidos | `GET /api/admin/orders/providers` | `vendelo` (una N) y `dropi`. |
| Catálogo Venndelo | `/api/admin/suppliers/venndelo/*` | Estado, test, wallet, pedidos, productos, publicar, sync, historial. |
| Productos / categorías | `/api/admin/products`, `/api/admin/categories` | CRUD administrativo. |
| Usuarios | `GET /api/admin/users?limit=&offset=&q=` | **Solo listado**; no hay detalle ni edición. |
| Notificaciones | `GET /api/notifications` + `notifyAdminsOfNewOrder()` | Ya avisa a cada admin al crear una compra web. El enlace `to` es `/admin/pedidos/:id`. |
| Gmail | `Back/Services/gmail.js` | OAuth + envío existen, pero **no hay rutas/controladores de campañas**. El callback apunta a `/api/admin/campaigns/oauth/callback`. |
| WhatsApp | — | **No existe nada**. |

### 3.2 Frontend que YA existe

- Tienda completa en `src/app/(store)`, auth en `(auth)`, cuenta en `/cuenta`.
- Cliente HTTP centralizado (`apiFetch`, `apiSend`, `apiGetOptional`,
  `serverFetch`, `serverSend`).
- Campana de notificaciones del comprador y bandeja `/cuenta/notificaciones`.
- `proxy.ts` solo protege `/cuenta` y `/checkout` comprobando **presencia** de
  cookie. No valida rol.
- **No existe ninguna pantalla `/admin`.** `safeInternalPath` bloquea `/admin/*`.
- Kokonut UI ya está configurado (`components.json`, registro `@kokonutui`).

### 3.3 Brechas que el panel debe cerrar

1. Guard de admin real (servidor) y shell del panel.
2. Detalle/edición de usuarios y perfil del admin.
3. Notificaciones de compra en vivo dentro del panel.
4. Rutas de campañas de email (Gmail ya está listo).
5. WhatsApp (proveedor, consentimiento, plantillas, modo manual).
6. Importación CSV de ventas sin API y `externalRef` idempotente.
7. Estado de proveedor **mapeado** y diagnóstico de desincronización.
8. Gráficos y Spending Ring con datos reales.
9. Exportaciones y auditoría visible.

---

## 4. Reglas no negociables

### 4.1 Seguridad

- El panel **nunca** se protege solo en cliente. `src/app/admin/layout.tsx`
  llama a `GET /api/admin/me` con `serverFetch`, exige un `role` administrativo,
  sesión viva y MFA, y redirige. El backend sigue siendo la única autoridad
  (`requireAdminSession` + `requirePermission`).
- No hay secretos en el navegador. Tokens de Gmail y WhatsApp solo en el back.
- Ninguna acción destructiva sin confirmación explícita (cancelar pedido,
  reembolsar, enviar difusión, despublicar catálogo).
- Las difusiones exigen consentimiento, baja y registro por destinatario.
- `GET /api/admin/*` responde `Cache-Control: no-store`. Nunca se cachean datos
  de clientes.
- Validar el `Origin` en los POST/PATCH administrativos sensibles (campañas,
  importación) contra `FRONTEND_URL`.

### 4.2 Estados

- `fulfillmentStatus` y `paymentState` son los únicos estados canónicos.
- `fulfillmentStatus = paid` significa **cumplimiento liberado**, no dinero
  cobrado. En COD el dinero entra al entregar.
- Las transiciones inválidas se rechazan con **422**; `shipped` sin guía es
  **422**. El front no inventa transiciones: las habilita según
  `FULFILLMENT_TRANSITIONS` y muestra el error real del backend.
- **Los estados crudos del proveedor no se muestran** (regla de `AGENTS.md`).
  Para cumplir el requisito «ver el estado que dicta el proveedor» se expone un
  estado **mapeado** y un diagnóstico:
  - `providerSync.mappedFulfillmentStatus`
  - `providerSync.mappedPaymentState`
  - `providerSync.outOfSync`
  - `providerSync.manualOverride`
  - `providerSync.lastSyncAt` y `lastSyncOk` (desde `SyncLog`)
  - `providerSync.localStatus`
  Se muestra como «Proveedor: en tránsito · UpBuy: enviado», nunca el string
  crudo. Si `mapProviderToCanonical()` devuelve `{}`, se muestra «Sin
  interpretar» y se ofrece sincronizar, sin adivinar.
- `manualOverride` bloquea el auto-sync. La UI debe avisarlo.

### 4.3 Dinero y contabilidad

- «Utilidad ganada» = pedidos **entregados**.
- «Efectivo recibido» = pagos **settled** (y `collected` como en tránsito).
- «Ventas» del endpoint `/ventas` son solo **liquidadas**. Etiquetar el gráfico
  como «Ventas liquidadas» y mostrar aparte el bruto de contabilidad. No cambiar
  la semántica del endpoint sin migración y aprobación.
- Todo monto es COP entero y se muestra con `Intl.NumberFormat("es-CO")` y
  `tabular-nums`.

### 4.4 UI y accesibilidad

- Todos los textos en español.
- Tokens de marca: carbon `#0B0B0B`, cream `#F5E9D7`, terracotta `#D35400`,
  coffee `#8B6F56`; Space Grotesk (títulos), Manrope (cuerpo).
- Sin emojis como icono. Iconos `lucide-react`.
- Contraste ≥ 4.5:1, focus visible, navegación por teclado, `aria-label` en
  botones de solo icono, targets ≥ 44×44 px, respeto a
  `prefers-reduced-motion`.
- Tablas: encabezado sticky, paginación, estado vacío, estado de error, skeleton.
  En móvil se convierten en tarjetas; nunca scroll horizontal infinito.
- Gráficos: siempre con resumen textual o tabla equivalente; no depender del
  color ni del hover.
- Instalar Kokonut **solo** con la CLI:
  `npx shadcn@latest add @kokonutui/<name>` (desde `Front/`). Nunca pegar código.

### 4.5 Backend

- Capas: `Rutas/ -> Controllers/ -> Services/ -> DataBase/models/`.
- Errores con `HttpError` + `sendError` (`Utils/respond.js`).
- `console.log` prohibido: usar `Utils/logger.js`.
- Esquema: en producción no corre `sequelize.sync()`. Todo cambio de columnas o
  tablas debe ir en `ensure*Schema` **idempotente** y, si aplica, script de
  migración en `Back/scripts/`.
- Agregar tests en `Back/test/` para reglas nuevas (importación, mapeo de
  proveedor, segmentación, normalización de teléfono, idempotencia).

### 4.6 No romper el contrato público

- No tocar los endpoints públicos de catálogo, pedidos, pagos ni tracking.
- No exponer datos sensibles del comprador en respuestas públicas.
- Los cambios del panel son aditivos, salvo que se apruebe lo contrario.

---

## 5. Arquitectura propuesta

### 5.1 Rutas del front

```
Front/src/app/admin/
├── layout.tsx                 # guard server-side + shell (sidebar/topbar)
├── page.tsx                   # dashboard: KPIs, ventas, spending ring, últimas compras
├── pedidos/
│   ├── page.tsx               # lista + filtros
│   ├── nuevo/page.tsx         # venta manual
│   ├── importar/page.tsx      # CSV (ventas sin API)
│   └── [id]/page.tsx          # detalle + acciones
├── ventas/page.tsx            # contabilidad y gráficos ampliados
├── proveedores/
│   ├── page.tsx               # salud y configuración
│   ├── venndelo/page.tsx      # catálogo, wallet, pedidos, sync
│   └── pedidos/page.tsx       # vendelo / dropi + desincronizados
├── usuarios/
│   ├── page.tsx
│   └── [id]/page.tsx
├── difusion/
│   ├── page.tsx               # historial de campañas
│   ├── email/page.tsx
│   └── whatsapp/page.tsx
├── notificaciones/page.tsx
└── perfil/
    ├── page.tsx               # mismos campos que /cuenta/perfil
    └── seguridad/page.tsx     # MFA, códigos de respaldo y sesiones activas
```

### 5.2 Capas del front

```
src/types/admin/*.ts                  # contratos del panel
src/services/admin/
├── index.ts                          # cliente (apiSend / apiFetch con sesión)
├── queries.ts                        # lecturas server-side (serverFetch)
├── orders.ts
├── users.ts
├── providers.ts
├── campaigns.ts
└── stats.ts
src/components/admin/
├── shell/                            # AdminSidebar, AdminTopbar, AdminMobileNav
├── dashboard/                        # KpiCard, SalesChart, ProviderSpendingRing
├── orders/                           # OrdersTable, OrderFilters, StatusChanger, OrderTimeline
├── providers/                        # ProviderHealth, SyncBadge, WalletCard
├── campaigns/                        # AudiencePicker, CampaignComposer, SendPreview
├── users/                            # UsersTable, UserDetail
└── shared/                           # DataTable, EmptyState, ConfirmDialog, Money
```

Reglas:

- Server Components por defecto. `"use client"` solo para filtros, formularios,
  gráficos y polling.
- Toda mutación usa `apiSend`/`serverSend`; nunca `fetch` suelto.
- Los tipos reflejan el backend real; no `any`.
- Formularios con estado de envío, error real del backend y bloqueo doble clic.
- No crear un segundo cliente HTTP.

### 5.3 Guard y sesión

1. `Front/src/proxy.ts`: agregar `/admin` a `PROTECTED_PREFIXES` y al `matcher`.
   Solo comprueba presencia de cookie (redirección temprana a
   `/login?next=/admin`).
2. `src/app/admin/layout.tsx`:
   - `serverFetch<AuthUser>("/api/admin/me")` dentro de `try/catch`.
   - Si `401` → `/login?next=/admin`.
   - Si `403`, `role === "customer"` o `mfaEnabled !== true` → `/` (no revelar
     el panel ni el motivo).
   - Si el rol es `support`, `admin` o `superadmin`, renderiza el shell y pasa
     el usuario al contexto **con su rol y permisos**, no con un booleano.
3. Cada llamada a `/api/admin/*` vuelve a validar en backend: sesión viva,
   rol actual, MFA y permiso. El front no es autoridad.
4. Todas las mutaciones del panel envían `X-Upbuy-CSRF: 1` y un `Origin`
   permitido. El cliente HTTP centralizado lo hace, no cada componente.
5. `safeInternalPath` debe permitir `/admin/*` ahora que el panel existe, pero
   solo se usa en la bandeja del admin. La tienda no debe enlazar al panel.
6. Si el backend responde `ADMIN_MFA_SETUP_REQUIRED`, `MFA_REQUIRED` o
   `STEP_UP_REQUIRED`, el front muestra el flujo correspondiente y **no**
   interpreta el 403 como «sin permisos».

---

## 6. Contrato de API

### 6.1 Ya disponible (usar tal cual)

| Método | Ruta | Uso en el panel |
|---|---|---|
| GET/PUT | `/api/user/edit` | Perfil del admin (mismos campos que el usuario). |
| GET | `/api/admin/orders?status=&paymentStatus=&channel=&provider=&paymentMethodCode=&q=&from=&to=&limit=&offset=` | Lista. |
| GET | `/api/admin/orders/stats` | KPIs del dashboard. |
| GET | `/api/admin/orders/ventas?periodo=dia\|semana\|mes\|anio` | Serie del gráfico. |
| GET | `/api/admin/orders/accounting?from=&to=&provider=` | Contabilidad y Spending Ring. |
| GET | `/api/admin/orders/providers` | Salud de proveedores. |
| GET | `/api/admin/orders/:id` | Detalle con items, pagos, historial y usuario. |
| PATCH | `/api/admin/orders/:id/status` | Cambio de estado (+ `pushToProvider`). |
| PATCH | `/api/admin/orders/:id/tracking` | Guía y transportadora. |
| POST | `/api/admin/orders/:id/sync` | Leer estado del proveedor. |
| POST | `/api/admin/orders/:id/push` | Enviar pedido al proveedor. |
| GET/POST | `/api/admin/orders/:id/payments` | Pagos manuales. |
| PATCH | `/api/admin/orders/:id/payments/:paymentId` | Reembolso / anulación. |
| POST | `/api/admin/orders/manual` | Venta externa. |
| GET/PATCH | `/api/admin/products`, `/api/admin/products/:id` | Catálogo. |
| GET/POST/PUT/DELETE | `/api/admin/categories` | Categorías. |
| GET | `/api/admin/suppliers/venndelo/status` | Conexión Venndelo. |
| POST | `/api/admin/suppliers/venndelo/test-connection` | Probar. |
| GET | `/api/admin/suppliers/venndelo/sync-history` | Historial. |
| GET | `/api/admin/suppliers/venndelo/products` (`/:id`) | Catálogo proveedor. |
| POST | `/api/admin/suppliers/venndelo/products/:id/publish\|unpublish` | Publicar. |
| POST | `/api/admin/suppliers/venndelo/sync` | Importar catálogo. |
| GET | `/api/admin/suppliers/venndelo/wallet/balance` | Wallet. |
| POST | `/api/admin/suppliers/venndelo/wallet/topup` | Recarga. |
| GET/POST | `/api/admin/suppliers/venndelo/orders` | Pedidos Venndelo. |
| GET | `/api/admin/suppliers/venndelo/orders/:id` | Detalle. |
| POST | `/api/admin/suppliers/venndelo/orders/:id/cancel` | Cancelar. |
| POST | `/api/admin/suppliers/venndelo/orders/quotation` | Cotizar. |
| GET | `/api/admin/users` | Clientes. |
| GET | `/api/notifications` | Bandeja del admin. |

### 6.2 Adiciones propuestas (crear en la fase indicada)

| Fase | Método | Ruta | Propósito |
|---|---|---|---|
| ADM-1 | GET | `/api/admin/me` | `{ id, email, username, name, lastName, phone, image, role, permissions, mfaEnabled, session }` sin campos sensibles. |
| ADM-1 | GET | `/api/admin/dashboard/summary` | Stats + ventas + contabilidad + últimas compras en una sola llamada (evita 4 waterfalls). |
| ADM-3 | GET | `/api/admin/orders/recent?since=<ISO>` | Compras nuevas para el aviso en vivo (`serverTime`, `orders`, `count`). |
| ADM-3 | GET | `/api/admin/orders/:id/sync-history` | Últimos `SyncLog` del pedido. |
| ADM-3 | POST | `/api/admin/orders/import?dryRun=1` | Importación CSV (`text/csv`, máx. 2 MB / 2.000 filas). |
| ADM-9 | GET | `/api/admin/users/:id` | Perfil + direcciones + resumen de compras. |
| ADM-9 | PATCH | `/api/admin/users/:id` | Editar nombre, apellido, teléfono, dirección, `marketingOptIn`, `whatsappOptIn`. **No** cambiar `admin` en v1. |
| ADM-9 | GET | `/api/admin/users/:id/orders` | Pedidos del cliente. |
| ADM-7 | GET | `/api/admin/campaigns/status` | Gmail conectado, cuota, remitente. |
| ADM-7 | GET | `/api/admin/campaigns/oauth/start` | URL de Google con `state` firmado. |
| ADM-7 | GET | `/api/admin/campaigns/oauth/callback` | Callback público con `state`; guarda token cifrado. |
| ADM-7 | POST | `/api/admin/campaigns/audience` | Conteo y muestra de destinatarios por segmento. |
| ADM-7 | POST | `/api/admin/campaigns` | Crea campaña en borrador y calcula destinatarios. |
| ADM-7 | POST | `/api/admin/campaigns/:id/send` | Envía un lote (máx. 25) y devuelve progreso. |
| ADM-7 | GET | `/api/admin/campaigns`, `/:id` | Historial y detalle. |
| ADM-7 | GET | `/api/public/campaigns/unsubscribe?token=` | Baja de marketing. |
| ADM-8 | GET | `/api/admin/whatsapp/status` | Configuración y plantillas. |
| ADM-8 | POST | `/api/admin/whatsapp/test` | Enviar plantilla de prueba al admin. |
| ADM-8 | POST | `/api/admin/campaigns/:id/send-whatsapp` | Lote de plantilla (máx. 20). |

Convenciones de respuesta: JSON plano o `{ message, code }` como ya hace el
backend. Paginación `{ items, total, limit, offset }` o la forma existente. No
inventar envoltorios distintos por endpoint.

### 6.3 Diferencias verificadas en ADM-0 (contra el código)

Comprobado el 2026-11-13 leyendo `Back/Rutas/`, `Back/index.js` y los
controladores. §6.1 ya está corregida con estas diferencias:

| Punto | Estado real | Acción |
|---|---|---|
| `GET /api/admin/me` | **No existe**. Solo existe `GET /api/auth/me` (devuelve el usuario con `admin` booleano). | Se crea en ADM-1 con `role`, `permissions`, `mfaEnabled` y `session` (§6.2). |
| `GET /api/admin/dashboard/summary` | No existe. | ADM-1. Mientras tanto, el panel compone `stats` + `ventas` + `accounting` + `orders?limit=5`. |
| `GET /api/admin/orders/:id/sync-history` | No existe para pedidos. Sí existe `GET /api/admin/suppliers/venndelo/sync-history` (global del proveedor). | ADM-3. |
| `GET /api/admin/suppliers` | Existe (lista de proveedores) y no estaba listada. | Usarla en ADM-4. |
| `POST /api/admin/suppliers/venndelo/orders/:id/confirmation` | Existe (modificar confirmación) y no estaba listada. | Usarla en ADM-4. |
| `GET/POST/PUT/DELETE /api/admin/categories` | Existe tal cual. | Sin cambios. |
| `GET /api/admin/users` | Solo lista; no hay detalle ni edición. | ADM-9 agrega `/:id`, `/:id/orders` y `PATCH`. |
| `GET /api/admin/orders/ventas` | Existe, pero solo agrega pedidos con `paymentState = 'settled'`. | Etiquetar «ventas liquidadas»; no cambiar la semántica sin aprobación. |
| Gmail (`Services/gmail.js`) | Existe el servicio y el callback espera `/api/admin/campaigns/oauth/callback`, pero **no hay rutas de campaña**. | ADM-7. |
| WhatsApp | **No existe** ninguna integración. | ADM-8. Modo manual `wa.me` primero. |
| `GET /api/notifications` | Existe y es del usuario autenticado (sirve al admin). | Reutilizar en la bandeja; no duplicar. |
| `POST /api/admin/orders/:id/sync` y `/push` | Existen y **no requieren cuerpo**. | Son los casos CSRF de F-02: ADM-S0 los cubre. |
| Roles | No hay `role`; solo `admin` booleano. | ADM-S1 introduce `role` y permisos. |

---

## 7. Fases

> Cada fase es independiente y verificable. Estimar en días de trabajo reales,
> no en «tokens». Si algo no se puede cumplir, se reporta antes.

### FASE ADM-0 — Auditoría y plan detallado (sin código de producto)

**Objetivo:** confirmar el terreno y convertir este documento en un plan de
archivos concreto.

**Hacer:**

1. Verificar los endpoints de §6.1 contra el código y anotar diferencias.
2. Listar los componentes Kokonut disponibles y cuáles se instalarán en cada
   fase (ver §8).
3. Revisar `ensureBaseSchema` / `ensureDropshippingSchema` para saber dónde
   entrarían las columnas nuevas.
4. Entregar un plan de archivos por fase y una lista de riesgos.
5. Auditar la autenticación admin y documentar hallazgos, modelo objetivo y
   plan de endurecimiento en
   [`Back/docs/SEGURIDAD_ADMIN.md`](Back/docs/SEGURIDAD_ADMIN.md).
6. **No** crear pantallas todavía.

**Entregable de seguridad (ya completado):**
[`Back/docs/SEGURIDAD_ADMIN.md`](Back/docs/SEGURIDAD_ADMIN.md) con hallazgos
F-01 a F-12, modelo objetivo (`role`, permisos, sesiones revocables, MFA,
auditoría) y subfases ADM-S0 a ADM-S4.

**Aceptación:** documento de plan aprobado, sin cambios de código, y auditoría
de seguridad entregada. Hallazgos P0 (F-01, F-02, F-05) identificados y
priorizados; ninguno se corrige en esta fase.

---

### FASE ADM-S — Endurecimiento de autenticación admin (PRERREQUISITO)

**Objetivo:** que una sesión admin comprometida no sea suficiente para leer o
cancelar pedidos ajenos, ni para ejecutar acciones desde otro sitio web.

**Dictamen y diseño completo:** [`Back/docs/SEGURIDAD_ADMIN.md`](Back/docs/SEGURIDAD_ADMIN.md).
No repetir aquí las decisiones: seguirlas.

**Hallazgos que se cierran:**

- **F-01 (crítico):** `GET /api/orders/:id` y `POST /api/orders/:id/cancel`
  confían en `req.user.admin` del JWT. Deben ser **solo del dueño**; el admin
  opera por `/api/admin/orders/*`.
- **F-02 (alto):** no hay CSRF. Cookie `sameSite=none` + `POST` sin cuerpo =
  acción ejecutable desde otro origen. Agregar `requireTrustedOrigin` y
  `X-Upbuy-CSRF`.
- **F-05 (medio-alto):** `JWT_SECRET` con default `jwtkey` fuera de producción
  y sin `algorithms`/`issuer`/`audience`.
- **F-03/F-04 (alto):** admin sin MFA y sin revocación de sesión.
- **F-06 (medio):** rol booleano sin permisos ni auditoría.

**Subfases (en orden, cada una verificable):**

| Subfase | Contenido | Riesgo que cierra |
|---|---|---|
| ADM-S0 | Dueño en rutas del comprador; sacar `admin` del JWT; Origin + CSRF; JWT HS256 con `iss/aud/sub`; secreto fuerte | F-01, F-02, F-05 — **implementado 2026-11-13** |
| ADM-S1 | `role` + permisos + `admin_sessions` + `auth_events`; revocación; `grantAdmin.js` | F-04, F-06, F-08 — **implementado 2026-11-13** |
| ADM-S2 | MFA TOTP obligatorio, códigos de respaldo, login en dos pasos | F-03, F-09 — **implementado 2026-11-13** |
| ADM-S3 | Step-up para acciones destructivas; `/api/admin/admins` solo superadmin; último superadmin protegido | F-10 — **implementado 2026-11-13** |
| ADM-S4 | Opcional: `__Host-` cookie, rotación, IP allowlist, alertas | F-07, F-11, F-12 — **implementado 2026-11-13** |

**Backend mínimo de ADM-S0 (no negociable):**

- `Middleware/auth.js`: `jwt.verify(..., { algorithms: ["HS256"], issuer, audience })`;
  `req.user = { id }` sin `admin`. `requireAdmin` sigue revalidando la BD y es
  el único que marca `req.user.admin`.
- `Controllers/orders.js`: quitar `admin: req.user.admin` del detalle.
- `Services/orders.js`: quitar el bypass `!user.admin` de `cancelOrder`; un
  admin cancela desde el panel.
- `Middlewares/requireTrustedOrigin.js`: `POST/PUT/PATCH/DELETE` con `Origin`
  permitido y cabecera `X-Upbuy-CSRF: 1`.
- `config.js`: `JWT_SECRET` mínimo 32 caracteres en todo entorno salvo test;
  `FRONTEND_URLS` como lista; fail-fast en producción.
- Tests: token con `admin: true` de un usuario normal no ve ni cancela pedidos
  ajenos; mutación sin Origin/CSRF → 403; token con otro secreto/`alg:none` →
  403.

**Frontend de ADM-S2/S3:** pantalla `/admin/perfil/seguridad` (MFA, códigos de
respaldo y sesiones activas), formulario de código en el login y diálogo de
step-up. Se integra en ADM-1, no se adelanta aquí.

**Aceptación:**

- `cd Back && npm test` verde con los casos de §9 de `SEGURIDAD_ADMIN.md`.
- Ningún endpoint administrativo autoriza por el claim `admin` del token.
- Un token viejo con `admin: true` deja de servir para pedidos ajenos **antes**
  de que expire.
- `cd Front && npm run typecheck` si se tocó el cliente HTTP.

**Fuera de alcance:** UI del panel, campañas, WhatsApp, gráficos.

---

### FASE ADM-1 — Acceso, backend mínimo y shell (implementado 2026-11-13)

**Objetivo:** un admin real entra a `/admin`, ve su perfil y un dashboard
básico; un usuario normal no puede.

**Backend:**

- Requisito: ADM-S0 y ADM-S1 ya ejecutadas.
- `GET /api/admin/me` con `{ id, email, username, name, lastName, phone, image,
  role, permissions, mfaEnabled, session: { expiresAt, mfaAt } }`. Sin campos
  sensibles.
- `GET /api/admin/dashboard/summary` que agregue:
  `stats`, `sales` del periodo por defecto (`mes`), `accounting` del mes y
  `recentOrders` (últimas 5 compras web).
- Tests de `requireAdminSession` (401 sin sesión, 403 para `customer`, 403 con
  sesión revocada, 403 sin MFA).

**Frontend:**

- `proxy.ts`: proteger `/admin`.
- `src/app/admin/layout.tsx`: guard server-side + shell.
- Shell: sidebar con secciones (Dashboard, Pedidos, Ventas, Proveedores,
  Usuarios, Difusión, Notificaciones, Perfil, Seguridad), topbar con nombre y
  rol del admin, campana y menú de cuenta. Cada sección se muestra según
  `permissions`; el backend vuelve a negar. Móvil: drawer accesible.
- `/admin` con:
  - 4 KPI: ventas liquidadas, pedidos, ticket promedio, utilidad ganada.
  - «Últimas compras» (tabla simple).
  - Aviso de estado de proveedores (`configured` sí/no).
  - Estado de carga, vacío y error.
- `/admin/perfil` con los mismos campos de `/cuenta/perfil` (nombre, apellido,
  teléfono, dirección, imagen). Email y usuario solo lectura. Sin rol editable.

**Aceptación:**

- Sin cookie → `/login?next=/admin`.
- Usuario con sesión pero `role=customer` → `/` (no 403 visible).
- Admin sin MFA → no entra; ve el flujo de enrolamiento.
- Admin con MFA y sesión viva → panel completo.
- `curl` a `/api/admin/dashboard/summary` sin sesión admin → 401/403.
- Una sesión revocada deja de servir de inmediato.
- `npm run typecheck` y `npm run build` en `Front/`; `npm test` en `Back/`.

**Fuera de alcance:** pedidos, campañas, WhatsApp, gráficos avanzados.

---

### FASE ADM-2 — Pedidos: lista, filtros y detalle (implementado 2026-11-13)

**Objetivo:** operar pedidos de punta a punta sin salir del panel.

**Frontend:**

- `/admin/pedidos`:
  - Filtros: búsqueda (`q`), estado logístico, estado de pago, canal,
    proveedor, método de pago, rango de fechas.
  - Tabla: número, fecha, cliente, total, pago, cumplimiento, proveedor,
    sincronización, acciones.
  - Paginación server-side (`limit=20`, `offset`).
  - Filtros en la URL (`searchParams`) para que sean compartibles y
    recargables.
  - En móvil: tarjetas.
- `/admin/pedidos/[id]`:
  - Cabecera: `orderNumber`, fecha, canal, total, estado de pago.
  - Datos del comprador y dirección snapshot.
  - Ítems, subtotal, envío, descuento, costo proveedor, fees, utilidad.
  - Línea de tiempo desde `history` (quién y cuándo).
  - Pagos (`payments`) con estado y acción de confirmar/reembolsar.
  - Bloque «Proveedor»: nombre, `providerOrderId`, estado mapeado, `outOfSync`,
    `manualOverride`, último sync; botones **Sincronizar** y **Enviar**.
  - Acciones de estado solo con transiciones válidas. `shipped` exige guía.
    Cancelar con confirmación tipo **Hold Button**.
  - Mostrar el error real del backend (422/409) sin traducir a genérico.

**Backend:**

- `GET /api/admin/orders/:id/sync-history`.
- Extender el detalle con `providerSync` calculado (mapeado, no crudo) y
  `lastSyncAt/lastSyncOk` desde `SyncLog`.
- Opcional: `GET /api/admin/orders/recent?since=` (se usa en ADM-5).

**Aceptación:**

- Cambiar `pending_payment → paid` funciona; `delivered → packing` devuelve 422
  y la UI lo muestra.
- Marcar `shipped` sin guía no se permite.
- Un pedido con `providerOutOfSync` se ve claramente y se puede reintentar.
- No se muestra ningún string crudo de proveedor.

---

### FASE ADM-3 — Ventas manuales e importación CSV (sin API)

**Objetivo:** registrar ventas presenciales/WhatsApp y pedidos de proveedores
sin API sin depender de la web.

**Backend:**

- Añadir `externalRef` (string, nullable, indexado) a `orders` mediante
  `ensureBaseSchema` idempotente + script de migración. Idempotencia por
  `(channel, externalRef)`.
- `POST /api/admin/orders/import`:
  - `Content-Type: text/csv`, máx. 2 MB / 2.000 filas.
  - `?dryRun=1` devuelve `{ valid, invalid, errors: [{ row, field, message }] }`
    sin escribir.
  - Confirmación: crea pedidos en transacción, salta duplicados por
    `externalRef`, devuelve resumen.
  - Columnas aceptadas: fecha, nombre, teléfono, email, dirección, ciudad,
    departamento, sku/producto, talla, cantidad, total, costo proveedor,
    método de pago, estado, guía, transportadora, notas, ref_externa.
  - Nunca usa el total del CSV como verdad contable si hay ítems; recalcula y
    reporta diferencias.
  - No importa sobre pedidos web existentes.
- Reutilizar `createManualOrder` para filas válidas cuando sea posible.

**Frontend:**

- `/admin/pedidos/nuevo`: formulario de venta manual con buscador de catálogo,
  ítems, cantidades, talla, envío, descuento, canal, método/estado de pago,
  notas. Muestra el total calculado por el backend.
- `/admin/pedidos/importar`: subida CSV con `@kokonutui/file-upload`, vista
  previa (dry-run), tabla de errores por fila y confirmación con conteo.
- Plantilla CSV descargable.

**Aceptación:**

- Importar dos veces el mismo archivo no duplica pedidos.
- Una fila inválida no bloquea las válidas en modo confirmación; se reporta.
- La venta manual aparece en la lista y en contabilidad.

---

### FASE ADM-4 — Proveedores y control operativo

**Objetivo:** una sola pantalla para saber qué proveedor está conectado, qué
pedidos están desincronizados y qué acciones tomar.

**Frontend:**

- `/admin/proveedores`:
  - Tarjetas: **Venndelo Pro** (catálogo), **Vendelo** (pedidos), **Dropi**
    (pedidos). Mostrar `configured`, modo (`api`/`manual`) y última actividad.
  - Contador de pedidos `providerOutOfSync` con enlace filtrado.
  - Botón «Probar conexión» (Venndelo) y «Sincronizar catálogo».
  - Aviso explícito de la diferencia **VENNDELO** (doble N, catálogo) vs
    **VENDELO** (una N, pedidos). No mezclar.
- `/admin/proveedores/venndelo`: pestañas Catálogo, Pedidos, Wallet, Historial.
  - Catálogo: listar, buscar, publicar/despublicar, ver stock y precio.
  - Pedidos: listar, detalle, cotizar, crear, cancelar, confirmación.
  - Wallet: saldo y recarga con confirmación.
  - Historial de sincronización con estado y errores.
- `/admin/proveedores/pedidos`: pedidos filtrados por `provider`, con acciones
  de sync/push y exportación CSV para operar en el panel del proveedor cuando
  no haya API.

**Backend:** solo lo faltante para el detalle y los contadores. Reutilizar
`suppliers/venndelo.*`, `providers/index.js`, `syncService.js`.

**Aceptación:**

- Despublicar un producto lo saca del catálogo público (verificar después).
- Un fallo de conexión se muestra como error accionable, no como pantalla rota.
- No se expone el estado crudo del proveedor.

---

### FASE ADM-5 — Avisos de compra en vivo

**Objetivo:** que el admin se entere de una compra sin refrescar.

**Backend:**

- `GET /api/admin/orders/recent?since=<ISO>`:
  - Solo `channel = web`, `createdAt > since`, máx. 20, orden ascendente.
  - Devuelve `{ orders, count, serverTime }`.
  - `Cache-Control: no-store`.
- Reutilizar `notifyAdminsOfNewOrder` (ya existe) y la deduplicación por clave.

**Frontend:**

- Campana en el topbar con contador de no leídas (`/api/notifications`).
- Panel de notificaciones con enlaces a `/admin/pedidos/:id`.
- Polling cada 30 s **solo** con pestaña visible; se detiene al ocultar y se
  refresca al volver. Sin `setInterval` infinito en el servidor.
- Al detectar compras nuevas: toast/banner con número, total y cliente; botón
  «Ver pedido». Sin sonido automático.
- Notificación del navegador opcional, apagada por defecto, pedida con gesto.
- `safeInternalPath` debe permitir `/admin/*` para la bandeja del admin.
- Marcar como leída al abrir; acción «marcar todas».

**Aceptación:**

- Crear un pedido de prueba desde la tienda genera un aviso en ≤ 30 s.
- No se duplican avisos al recargar.
- Con `prefers-reduced-motion`, el toast no anima.

---

### FASE ADM-6 — Ventas, gráficos y Spending Ring

**Objetivo:** leer el negocio de un vistazo y filtrar por periodo.

**Frontend:**

- `/admin/ventas`:
  - Selector segmentado **Diario / Semanal / Mensual / Anual** que llama a
    `/api/admin/orders/ventas?periodo=...`.
  - Tarjeta principal con **`@kokonutui/metric-card`** (KPI de ingresos con
    scrub/rango). Adaptar su prop de datos a la `serie` real; si su API no
    admite series arbitrarias, extenderla **en su sitio** manteniendo su
    lenguaje visual. No agregar otra librería de charts sin justificarlo.
  - Comparación `actual` vs `anterior` (variación % y absoluta).
  - **`@kokonutui/spending-ring`** para «Ventas por proveedor»:
    - Segmentos desde `accounting.byProvider`: Vendelo, Dropi, Sin proveedor.
    - Valor principal: **cantidad de pedidos** (requisito); alternar a monto
      bruto con un control accesible.
    - Leyenda con pedidos, monto y utilidad; el color no es la única señal.
  - Contabilidad del periodo: bruto, costo proveedor, fees, margen, utilidad
    ganada, efectivo pendiente, COD por estado.
  - Tabla «Detalle por proveedor» y «Por método de pago».
  - Filtros de fecha (`from`, `to`) y proveedor.
- Dashboard `/admin`: versión resumida de lo anterior + últimas compras.

**Datos y etiquetas:**

- Gráfico de `/ventas`: «Ventas liquidadas» (solo `settled`).
- Contabilidad: bruto y utilidad con su propia etiqueta; no mezclar.
- Vacío: «Aún no hay ventas en este periodo».
- Error: mensaje real + reintentar.

**Aceptación:**

- Cambiar de periodo actualiza la serie sin recargar la página completa.
- El Spending Ring suma 100% y sus totales coinciden con `byProvider`.
- Tabla equivalente accesible para lectores de pantalla.
- Funciona a 360 px y con teclado.

**Componentes Kokonut a instalar (solo si se usan):**

```bash
cd Front
npx shadcn@latest add @kokonutui/metric-card
npx shadcn@latest add @kokonutui/spending-ring
npx shadcn@latest add @kokonutui/apple-activity-card   # opcional: anillos COD
npx shadcn@latest add @kokonutui/loader                # estados de carga
```

---

### FASE ADM-7 — Difusión por email (Gmail)

**Objetivo:** enviar correos a usuarios registrados con consentimiento,
trazabilidad y baja.

**Backend:**

- Rutas de campañas (el servicio `gmail.js` ya existe; su callback espera
  exactamente `/api/admin/campaigns/oauth/callback`):
  - `GET /api/admin/campaigns/oauth/start`: `state` = JWT firmado
    (`purpose: gmail_oauth`, `adminId`, `exp: 10m`), redirect a Google.
  - `GET /api/admin/campaigns/oauth/callback`: valida `state`, exige sesión
    admin, intercambia el code y guarda el refresh token **cifrado**.
  - `GET /api/admin/campaigns/status`: conectado sí/no, remitente, cuota.
  - `POST /api/admin/campaigns/audience`: segmento → conteo + muestra de 10.
  - `POST /api/admin/campaigns`: crea borrador con asunto, cuerpo, segmento y
    canal `email`; calcula destinatarios.
  - `POST /api/admin/campaigns/:id/send`: envía lote de 25, devuelve
    `{ sent, failed, remaining, errors }`. Reintentable sin duplicar.
  - `GET /api/admin/campaigns` y `/:id`: historial y detalle por destinatario.
  - `GET /api/public/campaigns/unsubscribe?token=`: baja sin sesión, token
    firmado por usuario; responde una página simple de confirmación.
- Modelos: `Campaign` y `CampaignRecipient` (idempotencia única por
  `campaignId + userId`). Columnas en `usuarios`: `marketingOptIn`,
  `marketingOptInAt`, `unsubscribedAt`, `emailBouncedAt`.
- Consentimiento:
  - Promocional: solo `marketingOptIn = true` y `unsubscribedAt = null`.
  - Operacional (estado de pedido): compradores, sin fines promocionales.
  - Excluir admins, correos rebotados y dados de baja.
- Cifrado del refresh token: AES-256-GCM con
  `GMAIL_TOKEN_ENCRYPTION_KEY` (32 bytes base64). Si falta, el panel muestra
  «Gmail no configurado» y **no** guarda en claro. No registrar tokens.
- Límite diario configurable (`CAMPAIGN_DAILY_LIMIT`, por defecto 400) y
  control de cuota de Gmail. Un envío masivo nunca corre entero en una sola
  petición: lotes + cron `/api/cron/campaigns` con `CRON_SECRET`.
- Variables simples en el cuerpo, renderizadas en servidor y escapadas:
  `{{nombre}}`, `{{ultimoPedido}}`, `{{ciudad}}`.
- HTML: multipart/alternative con HTML saneado y fallback `text/plain`.
- Auditoría: quién envió, cuándo, segmento, total, errores.

**Frontend:**

- `/admin/difusion/email`:
  - Estado de conexión Gmail + botón «Conectar Gmail».
  - Selector de audiencia con conteo previo y muestra.
  - Asunto, cuerpo, vista previa, variables disponibles.
  - «Enviar prueba a mi correo» obligatorio antes de habilitar el envío.
  - Confirmación con número exacto de destinatarios y **Hold Button**.
  - Progreso por lotes, errores por destinatario y opción de reintentar.
  - Aviso claro de consentimiento y baja.
- `/admin/difusion`: historial con estado, enviados, fallidos y fecha.

**Aceptación:**

- Sin `GMAIL_*` o sin token, la UI lo dice y no finge enviar.
- Un usuario dado de baja nunca recibe promociones.
- Reintentar un lote no duplica correos.
- El token nunca aparece en respuestas, logs ni cliente.

---

### FASE ADM-8 — Difusión por WhatsApp

**Objetivo:** difusión real por WhatsApp Cloud API, con modo manual cuando no
haya configuración.

**Backend:**

- `Services/whatsapp/` con interfaz:
  - `isConfigured()`
  - `normalizePhone(raw)` → E.164 Colombia (`+57...`) o `null`
  - `sendTemplate({ to, template, language, variables })`
  - `sendText(...)` solo dentro de la ventana de 24 h (no usar para difusión)
- Variables de entorno: `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`,
  `WHATSAPP_API_VERSION`, `WHATSAPP_TEMPLATE_MARKETING`,
  `WHATSAPP_TEMPLATE_ORDER`, `WHATSAPP_TEMPLATE_LANG`.
- Columnas: `whatsappOptIn`, `whatsappOptInAt`, `whatsappUnsubscribedAt`;
  consentimiento explícito, igual que email.
- `GET /api/admin/whatsapp/status`, `POST /api/admin/whatsapp/test`,
  `POST /api/admin/campaigns/:id/send-whatsapp` (lote de 20).
- Difusión **solo con plantillas aprobadas** por Meta. No intentar texto libre
  fuera de la ventana. Errores de Meta se guardan por destinatario.
- **Prohibido** usar librerías no oficiales (`whatsapp-web.js`, Baileys,
  automatización de WhatsApp Web): riesgo de bloqueo y de cumplimiento.

**Frontend:**

- `/admin/difusion/whatsapp`:
  - Estado de configuración y plantillas disponibles.
  - Audiencia con conteo, teléfonos normalizados y excluidos por inválidos.
  - Editor de variables de plantilla + vista previa tipo burbuja.
  - Envío por lotes con progreso y errores.
  - **Modo manual** sin configuración: por cada usuario, botón «Abrir
    WhatsApp» (`https://wa.me/57...?text=...`), copiar mensaje y exportar CSV.
    Deja claro que es envío uno a uno, no automatizado.
- Consentimiento visible y baja.

**Aceptación:**

- Sin configuración, la UI ofrece modo manual y no simula envíos.
- Teléfonos inválidos se excluyen y se reportan.
- La plantilla de prueba llega solo al admin.
- Reintentos sin duplicados.

---

### FASE ADM-9 — Usuarios, clientes y perfil

**Objetivo:** conocer al cliente y operar su cuenta sin tocar la base.

**Backend:**

- `GET /api/admin/users/:id`: perfil, direcciones, resumen
  (`ordersCount`, `totalSpent`, `lastOrderAt`), consentimientos, estado.
- `GET /api/admin/users/:id/orders`.
- `PATCH /api/admin/users/:id`: nombre, apellido, teléfono, dirección,
  `marketingOptIn`, `whatsappOptIn`. No `admin` ni password en v1.
- Opcional aprobado: `disabled` + rechazo en `requireAuth` (desactivar cuenta).
- Exportación CSV de clientes (sin password ni tokens).
- Tests de permisos y de campos editables.

**Frontend:**

- `/admin/usuarios`: búsqueda, tabla, filtros (con/sin compras, consentimiento,
  fecha de registro), paginación.
- `/admin/usuarios/[id]`: datos, direcciones, pedidos, consentimientos,
  acciones (editar, exportar, desactivar si se aprobó).
- `/admin/perfil`: mismos campos que `/cuenta/perfil`; email/usuario solo
  lectura; cambio de contraseña solo si se implementa el endpoint.

**Aceptación:**

- No se puede escalar a admin desde el panel.
- Editar un usuario no rompe su sesión ni su `profileComplete`.
- Los datos sensibles no salen en listados innecesarios.

---

### FASE ADM-10 — Cierre: calidad, rendimiento y documentación

**Objetivo:** dejar el panel listo para operación real.

- Revisión de accesibilidad (teclado, foco, contraste, lector de pantalla).
- Revisión de estados de carga/error/vacío en todas las pantallas.
- Revisión de consultas N+1 y de índices (`orders.createdAt`,
  `orders.provider`, `users.email`, campañas).
- Paginación y límites en todos los listados.
- Tests finales y comandos verdes.
- Actualizar:
  - `Back/README.md` (endpoints nuevos).
  - `Front/docs/BACKEND_INTEGRATION.md` (contrato del panel).
  - `Front/docs/PROJECT_PLAN.md` (fase del panel).
  - `AGENTS.md` si cambia una regla (p. ej. `safeInternalPath`).
- Documentar variables de entorno nuevas en `Back/.env.example` **sin
  secretos**.
- Checklist de despliegue: `FRONTEND_URL`, `BACKEND_URL`, Gmail OAuth,
  `GMAIL_TOKEN_ENCRYPTION_KEY`, WhatsApp, cron de campañas.

**Aceptación:** `cd Back && npm test`, `cd Front && npm run typecheck`,
`cd Front && npm run build`; y un recorrido manual completo con un admin real.

---

## 8. Componentes Kokonut UI por fase

| Fase | Componente | Instalación | Uso |
|---|---|---|---|
| ADM-1 | Split Nav (ya instalado) | — | Navegación del shell. |
| ADM-1 | Account Menu | `@kokonutui/profile-dropdown` | Menú del admin. |
| ADM-1 | Loader | `@kokonutui/loader` | Carga de secciones. |
| ADM-2 | Hold Button | `@kokonutui/hold-button` | Cancelar pedido / acciones irreversibles. |
| ADM-2 | Smooth Drawer | `@kokonutui/smooth-drawer` | Acciones en móvil. |
| ADM-3 | File Upload | `@kokonutui/file-upload` | Importación CSV. |
| ADM-4 | Uptime Card | `@kokonutui/uptime-card` | Salud de proveedores. |
| ADM-5 | Notification Stack | `@kokonutui/notification-stack` | Avisos de compra. |
| ADM-5 | Promise Toast | `@kokonutui/promise-toast` | Resultado de acciones. |
| ADM-6 | **Metric Card** | `@kokonutui/metric-card` | KPI/gráfico de ventas con filtros. |
| ADM-6 | **Spending Ring** | `@kokonutui/spending-ring` | Ventas por proveedor. |
| ADM-6 | Apple Activity Card | `@kokonutui/apple-activity-card` | Anillos COD (opcional). |
| ADM-7/8 | Inline Alert | `@kokonutui/inline-alert` | Configuración faltante. |
| ADM-7/8 | Empty State | `@kokonutui/empty-state` | Sin campañas / sin audiencia. |
| ADM-9 | Widget Grid | `@kokonutui/bento-grid` | Resumen del cliente (opcional). |

Regla: instalar solo al usarlo, editar en su sitio, no envolver con copias.

### 8.1 Plan de archivos por fase (entregable ADM-0)

Rutas relativas a la raíz del repo. `[N]` = archivo nuevo. No se crea nada en
ADM-0; esto es el mapa que cada fase ejecutará.

| Fase | Backend | Frontend |
|---|---|---|
| ADM-S0 | `Middleware/auth.js`, `Middlewares/requireTrustedOrigin.js` `[N]`, `Controllers/orders.js`, `Services/orders.js`, `Controllers/auth.js`, `config.js`, `index.js`, `.env.example`, `test/auth.admin.test.js` `[N]` | `src/services/api/client.ts` (cabecera CSRF en mutaciones) |
| ADM-S1 | `DataBase/ensureAdminSecuritySchema.js` `[N]`, `DataBase/models/AdminSession.js` `[N]`, `DataBase/models/AuthEvent.js` `[N]`, `Services/permissions.js` `[N]`, `Services/adminSessions.js` `[N]`, `Middleware/auth.js`, `Services/notifications.js`, `scripts/grantAdmin.js` `[N]`, `scripts/migrateAdminSecurity.js` `[N]`, `Rutas/adminAdmins.js` `[N]`, `index.js`, `test/auth.admin.test.js` | — |
| ADM-S2 | `Services/mfa.js` `[N]`, `Controllers/auth.js`, `Rutas/auth.js`, `Middlewares/rateLimits.js`, `config.js`, `.env.example`, `test/auth.admin.test.js` | `src/app/(auth)/login/page.tsx`, `src/app/admin/perfil/seguridad/page.tsx` `[N]`, `src/components/auth/AdminMfaForm.tsx` `[N]` |
| ADM-S3 | `Middlewares/requireStepUp.js` `[N]`, `Services/permissions.js`, `Rutas/adminAdmins.js`, `test/auth.admin.test.js` | `src/components/admin/StepUpDialog.tsx` `[N]` | **implementado 2026-11-13** |
| ADM-S4 | `Services/sessionCookie.js` `[N]`, `Services/securityAlerts.js` `[N]`, `Services/securityLogs.js` `[N]`, `Middlewares/requireAdminIp.js` `[N]`, `Controllers/adminAudit.js` `[N]`, `Rutas/adminAudit.js` `[N]`, `scripts/pruneSecurityLogs.js` `[N]`, `Controllers/auth.js`, `Services/adminSessions.js`, `config.js`, `.env.example`, `test/auth.admin.test.js` | `src/proxy.ts` | **implementado 2026-11-13** |
| ADM-1 | `Controllers/adminMe.js` `[N]`, `Services/adminDashboard.js` `[N]`, `Rutas/adminMe.js` `[N]`, `index.js`, `test/admin.me.test.js` `[N]` | `src/app/admin/layout.tsx` `[N]`, `src/app/admin/page.tsx` `[N]`, `src/app/admin/perfil/page.tsx` `[N]`, `src/components/admin/{AdminShell,AdminSidebar,AdminTopbar}.tsx` `[N]`, `src/components/auth/AdminMfaForm.tsx` `[N]`, `src/services/admin/{me,dashboard}.ts` `[N]`, `src/types/admin.ts` `[N]`, `src/proxy.ts`, `src/lib/safe-url.ts` | **implementado 2026-11-13** |
| ADM-2 | `Services/adminOrders.js`, `Controllers/adminOrders.js`, `Rutas/adminOrders.js`, `test/admin.orders.test.js` `[N]` | `src/app/admin/pedidos/page.tsx` `[N]`, `src/app/admin/pedidos/[id]/page.tsx` `[N]`, `src/components/admin/orders/*` `[N]`, `src/services/admin/orders.ts` `[N]`, `src/services/admin/orders.actions.ts` `[N]`, `src/types/admin.ts`, `src/components/admin/AdminSidebar.tsx` | **implementado 2026-11-13** |
| ADM-3 | `Rutas/adminOrders.js`, `Services/orderImport.js` `[N]`, `test/admin.orders.import.test.js` `[N]` | `src/app/admin/pedidos/nuevo/page.tsx` `[N]`, `src/components/admin/orders/ImportCsv.tsx` `[N]` |
| ADM-4 | `Rutas/suppliers/*`, `Controllers/adminSuppliers.js` `[N]`, `test/admin.suppliers.test.js` `[N]` | `src/app/admin/proveedores/page.tsx` `[N]`, `src/components/admin/providers/*` `[N]`, `src/services/admin/providers.ts` `[N]` |
| ADM-5 | `Services/notifications.js`, `Rutas/adminOrders.js` (recientes) | `src/components/admin/orders/PurchaseAlerts.tsx` `[N]`, `src/hooks/useAdminOrderStream.ts` `[N]` |
| ADM-6 | Sin cambios de esquema; reutiliza `ventas`, `accounting`, `stats` | `src/app/admin/ventas/page.tsx` `[N]`, `src/components/admin/sales/{SalesChart,SpendingRingCard,Filters}.tsx` `[N]`, `src/services/admin/sales.ts` `[N]` |
| ADM-7 | `DataBase/ensureCampaignSchema.js` `[N]`, `DataBase/models/Campaign.js` `[N]`, `Services/campaigns/*` `[N]`, `Services/consent.js` `[N]`, `Rutas/adminCampaigns.js` `[N]`, `scripts/sendCampaignBatch.js` `[N]`, `vercel.json` | `src/app/admin/difusion/email/page.tsx` `[N]`, `src/components/admin/campaigns/*` `[N]`, `src/app/(store)/baja/page.tsx` `[N]` |
| ADM-8 | `Services/whatsapp/*` `[N]`, `Rutas/adminCampaigns.js`, `.env.example` | `src/app/admin/difusion/whatsapp/page.tsx` `[N]`, `src/components/admin/campaigns/WhatsAppPanel.tsx` `[N]` |
| ADM-9 | `Rutas/adminUsers.js`, `Controllers/adminUsers.js`, `Services/adminUsers.js` `[N]`, `test/admin.users.test.js` `[N]` | `src/app/admin/usuarios/page.tsx` `[N]`, `src/app/admin/usuarios/[id]/page.tsx` `[N]`, `src/services/admin/users.ts` `[N]` |
| ADM-10 | `Back/README.md`, `Back/docs/*`, `.env.example` | `Front/docs/BACKEND_INTEGRATION.md`, `Front/docs/DESIGN_SYSTEM.md` si aplica |

Reglas del mapa:

- Un archivo nuevo se justifica por fase; no se crean carpetas vacías.
- Los modelos nuevos se agregan a `DataBase/models/index.js` y su tabla a un
  `ensure*Schema.js` idempotente. **No** se usa `sequelize.sync()` en producción.
- Los endpoints nuevos se documentan en `Back/README.md` y
  `Front/docs/BACKEND_INTEGRATION.md` en la misma fase.
- `src/proxy.ts` solo comprueba presencia de cookie; el guard real es
  `src/app/admin/layout.tsx` + `/api/admin/me`.

---

## 9. Criterios de aceptación globales

Un fase se considera terminada solo si:

1. Cumple su alcance y **nada** del alcance de otras fases.
2. No rompe la tienda ni el contrato público.
3. No autoriza por el claim `admin` del JWT en ninguna ruta. El rol sale de la
   base y la sesión admin es revocable.
4. Las mutaciones del panel exigen `Origin` permitido y `X-Upbuy-CSRF`.
5. Backend: `npm test` verde; tests nuevos para reglas nuevas.
6. Frontend: `npm run typecheck` y `npm run build` verdes.
7. Sin `console.log` en Back; sin `any` nuevos; sin secretos.
8. Accesibilidad mínima verificada con teclado.
9. Documentación y `.env.example` actualizados si aplica.
10. Resumen entregado con archivos, endpoints, decisiones, riesgos y pendientes.

---

## 10. Riesgos y decisiones abiertas

| Riesgo / decisión | Impacto | Propuesta |
|---|---|---|
| Gmail sin cifrado en reposo (`gmailRefreshToken` hoy es texto) | Alto | Cifrar con AES-256-GCM y clave dedicada; migrar tokens existentes o pedir reconexión. |
| Gmail tiene cuota diaria | Medio | Lotes + `CAMPAIGN_DAILY_LIMIT` + cron; mostrar progreso. |
| WhatsApp Cloud API exige plantillas aprobadas | Alto | Plantillas + modo manual `wa.me`; nunca automatización no oficial. |
| Consentimiento de marketing en usuarios existentes | Alto | No asumir opt-in; separar operacional de promocional; baja visible. |
| `/ventas` solo cuenta `settled` | Medio | Etiquetar «liquidadas»; mostrar bruto de contabilidad aparte. Sin cambiar la semántica sin aprobación. |
| Estados crudos de proveedor | Alto (regla de marca) | Exponer solo mapeado + diagnóstico; nunca el string crudo. |
| Importación CSV sin `externalRef` | Alto | Añadir columna idempotente antes de importar. |
| Vercel timeout en envíos masivos | Alto | Lotes pequeños + cron; nunca un bucle completo en una petición. |
| Varios admins y un solo Gmail | Medio | Cada admin conecta el suyo; la campaña usa el del creador. |
| `sequelize.sync()` no corre en producción | Alto | Cambios vía `ensure*Schema` idempotente + script de migración. |
| `admin` del JWT usado en rutas del comprador (F-01) | Crítico | ADM-S0: dueño estricto + `requireAuth` sin `admin`. Ver `SEGURIDAD_ADMIN.md`. |
| CSRF con cookie `sameSite=none` (F-02) | Alto | ADM-S0: `Origin` + `X-Upbuy-CSRF` en toda mutación. |
| Admin sin MFA (F-03) | Alto | ADM-S2: TOTP obligatorio + códigos de respaldo. |
| Sin revocación de sesión (F-04) | Alto | ADM-S1: `admin_sessions` + revocación por logout/rol/contraseña. |
| Rol booleano sin permisos (F-06) | Medio | ADM-S1: `role` + permisos; `admin` legacy sincronizado. |
| Datos personales en exportaciones | Alto | Exportar solo lo necesario, con registro de quién exportó. |

Decisiones que requieren aprobación antes de implementar:

1. ¿El panel vive en `upbuy.com/admin` (mismo front) o en un subdominio?
   **Propuesta: mismo front, ruta `/admin`.**
2. ¿MFA obligatorio para admin desde el primer día? **Propuesta: sí; es la
   barrera que contiene una contraseña filtrada.**
3. ¿Se permite desactivar cuentas de usuario? **Propuesta: sí, en ADM-9.**
4. ¿La difusión de WhatsApp arranca con Cloud API o solo modo manual?
   **Propuesta: interfaz + modo manual primero; Cloud API cuando existan
   plantillas aprobadas.**
5. ¿Se migran los tokens Gmail existentes o se pide reconectar?
   **Propuesta: pedir reconexión (más simple y seguro).**
6. ¿Se migran los admins actuales a `role` o se crea uno nuevo?
   **Propuesta: backfill `admin=true → role='admin'` y rotar contraseñas.**

---

## 11. Prompt de arranque (pegar en el agente)

```text
Trabajas en el monorepo UPBUY (E:\UpBuy). Lee AGENTS.md, Front/AGENTS.md,
Back/README.md y ADMIN_DASHBOARD_PROMPT.md antes de tocar nada.

Vamos a construir el panel de administración por fases. NO adelantes fases.
En esta sesión ejecuta únicamente la fase: <FASE ADM-N>.

Reglas:
- No reescribas la tienda ni el contrato público.
- ADM-S es prerrequisito de ADM-1. No autorices por el claim `admin` del JWT:
  el rol sale de la base (`role`), la sesión admin es revocable y las
  mutaciones exigen Origin + `X-Upbuy-CSRF`.
- El panel se protege en servidor (layout + /api/admin/me) y en backend
  (sesión admin + permisos). Nunca solo en cliente.
- No muestres estados crudos de proveedores: solo el estado mapeado y el
  diagnóstico de sincronización.
- Textos en español, tokens de marca, accesibilidad y reduced motion.
- Instala Kokonut con la CLI, nunca pegando código.
- Backend: capas Rutas/Controllers/Services; HttpError + sendError; logger;
  cambios de esquema idempotentes (no sequelize.sync en producción).
- Si falta un dato o una decisión, pregunta antes de inventar.

Entrega al terminar:
1. Alcance ejecutado y lo que quedó fuera.
2. Archivos creados/modificados.
3. Endpoints nuevos con request/response.
4. Cómo verificarlo (comandos y pasos manuales).
5. Riesgos, deuda y siguiente fase propuesta.

Verificación obligatoria antes de responder:
cd Back && npm test
cd Front && npm run typecheck && npm run build
```

---

## 12. Orden recomendado y dependencias

```
ADM-0  Auditoría
  └─ ADM-S  Endurecimiento de autenticación (S0 → S1 → S2 → S3)
       └─ ADM-1  Acceso + shell + perfil + resumen
            ├─ ADM-2  Pedidos (lista/detalle/estados)
            │    ├─ ADM-3  Venta manual + CSV
            │    └─ ADM-5  Avisos de compra
            ├─ ADM-4  Proveedores
            ├─ ADM-6  Ventas + gráficos + Spending Ring
            ├─ ADM-7  Email
            ├─ ADM-8  WhatsApp
            └─ ADM-9  Usuarios/clientes
                 └─ ADM-10 Cierre
```

ADM-S0 se puede ejecutar de inmediato y no depende de nada.
ADM-1 no arranca sin ADM-S0 y, si se exige MFA desde el día 1, sin ADM-S2.
ADM-5 depende de ADM-2 (detalle de pedido para el enlace).
ADM-6 depende de ADM-1 y de los datos de ADM-2.
ADM-7 y ADM-8 comparten el módulo de audiencias y consentimiento.
