# SEGURIDAD_ADMIN.md — Auditoría y endurecimiento del acceso administrador

> Documento de la fase **ADM-0** (auditoría) y base de la fase **ADM-S**
> (endurecimiento). No describe un sistema hipotético: describe lo que hay hoy
> en el repo y lo que hay que cambiar antes de abrir `/admin`.

Fecha de auditoría: 2026-11-13
Alcance: emisión y verificación de sesión, rol admin, rutas administrativas,
CSRF, JWT, cookies, login social, auditoría y revocación.

---

## 1. Resumen ejecutivo

Hoy **no** existe una escalada trivial escribiendo `admin = true` en el cuerpo
de una petición: el registro, el perfil y el login social no aceptan ese campo.
`requireAdmin` además **revalida el rol contra la base de datos**, lo cual es
correcto.

Pero la validación **no es robusta** por cinco razones:

1. **Dos rutas del comprador confían en el `admin` del JWT**, no en la base
   (`GET /api/orders/:id` y `POST /api/orders/:id/cancel`). Un admin degradado
   conserva acceso cruzado a pedidos ajenos hasta que expire el token (12 h).
   Es el hallazgo más grave y se corrige sin tocar la UI.
2. **No hay protección CSRF real.** En producción la cookie es
   `sameSite=none`; un `POST` sin cuerpo (por ejemplo `/sync` o `/push`) se
   ejecuta desde otro sitio aunque CORS impida leer la respuesta.
3. **El admin se autentica solo con contraseña.** No hay segundo factor.
4. **No hay revocación de sesión.** Un token robado vive 12 h; cambiar la
   contraseña o degradar al admin no lo invalida.
5. **El rol es un booleano sin permisos, sin auditoría de cambios y sin
   protección del último admin.** No permite separar soporte de administración
   total.

La recomendación es **no abrir `/admin` hasta ejecutar ADM-S** (ver §8), con
estas prioridades:

| Prioridad | Cambio | Riesgo que cierra |
|---|---|---|
| P0 | Rol desde BD en todas las rutas; sacar `admin` del JWT | IDOR y privilegios stale |
| P0 | Verificación de `Origin` + cabecera CSRF en mutaciones | CSRF |
| P0 | JWT con algoritmo fijo, issuer/audience y secreto fuerte obligatorio | Falsificación de tokens |
| P1 | Sesiones admin revocables + `role`/permisos + auditoría | Robo de sesión y exceso de permisos |
| P1 | MFA TOTP obligatorio para admin | Contraseña filtrada |
| P2 | Step-up para acciones destructivas y gestión de admins | Abuso interno / cuenta comprometida |

---

## 2. Cómo se valida hoy (flujo real)

```
POST /api/auth/login
  └─ bcrypt.compare(password)
       └─ issueSession(res, user)
            ├─ jwt.sign({ id, admin }, JWT_SECRET, { expiresIn: "12h" })
            └─ res.cookie("access_token", token, {
                 httpOnly: true,
                 secure: isProduction,
                 sameSite: isProduction ? "none" : "lax",
               })

Cualquier ruta /api/admin/*
  └─ requireAuth
       └─ jwt.verify(token, JWT_SECRET)          // sin algorithms/issuer/audience
            └─ req.user = { id, admin: payload.admin }
  └─ requireAdmin
       └─ Usuarios.findByPk(req.user.id, { attributes: ["admin"] })
            └─ if (!user.admin) 403
            └─ req.user.admin = true
```

Fortalezas actuales:

- Cookie `httpOnly` (el front no puede leer el token).
- `requireAdmin` consulta la base en cada petición administrativa.
- Registro y perfil usan listas blancas de campos: no hay mass assignment de
  `admin`.
- Login social con Google valida firma, audiencia y `email_verified`.
- Rate limit en login y registro.
- `helmet`, CORS con origen explícito y `trust proxy` configurado.
- `JWT_SECRET` es obligatorio en producción.

---

## 3. Hallazgos

### F-01 — Crítico — El `admin` del JWT se usa para autorizar en rutas del comprador

**Dónde:**

- `Back/Controllers/orders.js:52-64`:
  ```js
  // GET /api/orders/:id — solo el dueño (o admin)
  const order = await getOrderForUser({
    orderId: req.params.id,
    userId: req.user.id,
    admin: req.user.admin, // ← del JWT
  });
  ```
- `Back/Services/orders.js:752-768`:
  ```js
  if (!user.admin && order.userId !== user.id) {
    throw new HttpError(403, ...);
  }
  ```
  con `user` = `req.user` proveniente de `requireAuth` (JWT).
- `Back/Services/orders.js:800-805` usa `Boolean(user.admin)` para decidir si
  devuelve el `rawPayload` de los pagos.

**Impacto:**

- Un administrador degradado (`admin = false` en BD) sigue leyendo cualquier
  pedido y puede cancelarlo mientras su JWT diga `admin: true` (hasta 12 h).
- Si `JWT_SECRET` se filtra o se usa el default débil en un entorno mal
  configurado, un atacante firma `{ id, admin: true }` y obtiene lectura y
  cancelación de pedidos ajenos **sin tocar la base**.
- `requireAdmin` no protege estas rutas porque no las cubre.

**Corrección:**

1. `GET /api/orders/:id` y `POST /api/orders/:id/cancel` son **solo del dueño**.
   El admin opera desde `/api/admin/orders/*` (que ya existe y sí revalida).
2. Dejar de incluir `admin` en el JWT. `requireAuth` solo adjunta `{ id }`.
3. `requireAdmin` sigue leyendo la BD y es el único lugar que marca
   `req.user.admin = true` después de verificar.
4. Prueba de regresión: token con `admin: true` de un usuario no admin no debe
   ver ni cancelar un pedido ajeno (404/403).

### F-02 — Alto — CSRF en mutaciones administrativas

**Dónde:** `Back/Controllers/auth.js:23-27` (cookie `sameSite=none` en
producción), `Back/index.js:174-180` (CORS) y ausencia de verificación de
`Origin`/token CSRF.

**Impacto:** CORS impide **leer** la respuesta desde otro origen, pero no
impide **ejecutar** una petición simple. `POST /api/admin/orders/:id/sync`,
`POST /api/admin/orders/:id/push` y `POST /api/admin/suppliers/venndelo/sync`
no necesitan cuerpo: un formulario alojado en un sitio malicioso puede
dispararlos con la cookie del admin. Lo mismo aplica a cualquier `POST` sin
cuerpo que se agregue en el panel (campañas, importación).

**Corrección:**

1. Middleware `requireTrustedOrigin` para `POST/PUT/PATCH/DELETE`:
   - Si viene `Origin`, debe estar en `FRONTEND_URL` (lista separada por comas).
   - Si no viene, aceptar solo peticiones sin cookies o con cabecera
     `X-Upbuy-Client: admin` (clientes no navegador).
2. Cabecera obligatoria `X-Upbuy-CSRF: 1` en todas las mutaciones del panel.
   Al no ser una cabecera "simple", obliga a preflight y el CORS la bloquea
   desde orígenes no permitidos.
3. `Cache-Control: no-store` en todas las respuestas `/api/admin/*`.
4. No relajar CORS: `origin` explícito y `credentials: true`.

### F-03 — Alto — Admin sin segundo factor

**Dónde:** `Back/Controllers/auth.js:77-117` (login solo con contraseña).

**Impacto:** una contraseña filtrada, reutilizada o adivinada da control total
del catálogo, pedidos, pagos, clientes y campañas. El panel multiplica el daño.

**Corrección:** MFA TOTP obligatorio para `role in ('admin','superadmin')`:

- Primer login de un admin sin MFA: no se emite cookie; se emite un ticket de
  enrolamiento de 10 min.
- Enrolamiento: secreto TOTP cifrado + QR + 10 códigos de respaldo (hash
  bcrypt, un solo uso).
- Login: contraseña correcta → `202 { mfaRequired: true, challengeId }` →
  `POST /api/auth/admin/mfa` con TOTP o código de respaldo → cookie.
- Rate limit específico (5 intentos / 15 min por cuenta) y auditoría.
- Sin MFA configurado y `ADMIN_MFA_REQUIRED=true` (default en producción):
  `/api/admin/*` responde 403 `ADMIN_MFA_SETUP_REQUIRED`.

### F-04 — Alto — Sin revocación de sesión ni expiración corta para admin

**Dónde:** `Back/Controllers/auth.js:14-30` (JWT stateless de 12 h),
`Back/Middleware/auth.js:31-57` (no hay tabla de sesiones).

**Impacto:** un token robado no se puede invalidar; degradar o desactivar a un
admin no cierra su sesión (solo bloquea `requireAdmin`, pero las rutas F-01
siguen abiertas); no hay "cerrar sesión en todos los dispositivos"; un cambio
de contraseña no invalida tokens.

**Corrección:**

- Tabla `admin_sessions` (id, userId, createdAt, lastSeenAt, expiresAt,
  revokedAt, ip, userAgent, mfaAt).
- JWT de admin incluye `sid`; `requireAdmin` valida sesión viva y rol actual.
- Expiración: 2 h de inactividad y 8 h absolutas.
- Logout revoca la sesión. Degradar, desactivar o cambiar contraseña revoca
  todas las sesiones del usuario.
- Panel `/admin/perfil/seguridad` con sesiones activas y "cerrar todas".

### F-05 — Medio-Alto — Configuración JWT débil por defecto

**Dónde:** `Back/config.js:116-117`:
```js
JWT_SECRET: process.env.JWT_SECRET || "jwtkey",
```
y `Back/Middleware/auth.js:18` / `Back/Controllers/auth.js:127` sin
`algorithms`, `issuer` ni `audience`.

**Impacto:** si un entorno pública corre sin `NODE_ENV=production` (staging,
preview, un `npm start` expuesto), el secreto es `jwtkey` y cualquiera firma
tokens. Además, no se fija el algoritmo y no hay separación de emisor/audiencia.

**Corrección:**

- `JWT_SECRET` obligatorio y con mínimo 32 caracteres en **todos** los entornos
  salvo `test`; en desarrollo generar uno y fallar si es débil.
- Firmar/verificar con `algorithm: "HS256"`, `issuer: "upbuy-api"`,
  `audience: "upbuy-web"`, `subject: user.id`.
- Opcional: `JWT_SECRET_PREVIOUS` para rotación sin cortar sesiones.
- `FRONTEND_URL` obligatoria en producción (hoy puede quedar `undefined` y CORS
  cae a `*`).

### F-06 — Medio — Rol booleano sin permisos ni gobierno

**Dónde:** `Back/DataBase/models/Usuarios.js:41-44` (`admin` boolean),
`Back/Services/notifications.js:106-109` (`where: { admin: true }`).

**Impacto:** no se puede dar acceso de solo lectura a soporte, no hay
separación de funciones, no hay registro de quién cambió un rol, y nada impide
quedarse sin administradores.

**Corrección:**

- `role`: `customer | support | admin | superadmin`.
- Mapa estático de permisos por rol (`orders.read`, `orders.write`,
  `orders.refund`, `catalog.write`, `users.write`, `campaigns.send`,
  `providers.manage`, `admins.manage`).
- `admin` se conserva como columna legacy **derivada** durante la transición;
  la fuente de verdad es `role`.
- Solo `superadmin` gestiona roles. No puede degradar al último `superadmin`.
- Todo cambio de rol queda en `audit_logs`.

### F-07 — Medio — Fuerza bruta y lockout

**Dónde:** `Back/Middlewares/rateLimits.js:57-62` (10 intentos / 15 min por
IP). No hay límite por cuenta, ni bloqueo progresivo, ni auditoría de intentos.

**Impacto:** ataques distribuidos por IP o contra un usuario concreto no se
frenan; no hay alerta temprana.

**Corrección:** límite por `username` + IP, backoff progresivo, registro de
intentos fallidos y aviso a los admins tras N fallos. No revelar si el usuario
existe.

### F-08 — Medio — Sin auditoría de eventos de autenticación

**Dónde:** `audit_logs` existe y se usa para pedidos, pero no para login, MFA,
cambios de rol, exportaciones ni envíos de campañas.

**Corrección:** tabla `auth_events` (o reutilizar `audit_logs` con
`entity = 'auth'`) con: evento, userId, IP, userAgent, resultado, metadata
mínima. Retención y consulta desde el panel (solo superadmin).

### F-09 — Medio — Auto-vinculación de Google por correo

**Dónde:** `Back/Controllers/socialAuth.js:51-59`.

**Impacto:** si la cuenta de Google de un admin se compromete, el atacante entra
como admin sin contraseña local. No es explotable sin controlar el correo, pero
elimina la barrera de la contraseña.

**Corrección:** MFA de aplicación obligatorio para admins, incluso si entran por
Google; exigir `email_verified` (ya se hace) y auditar la vinculación.

### F-10 — Medio — Sin step-up para acciones destructivas

**Dónde:** reembolsos, cancelaciones, envío masivo, cambios de rol,
despublicar catálogo.

**Corrección:** exigir MFA reciente (`mfaAt` < 10 min) para:
`orders.refund`, `orders.cancel`, `campaigns.send`, `admins.manage`,
`catalog.unpublish`. Si no, `403 STEP_UP_REQUIRED` y el front pide el código.

### F-11 — Bajo — Endurecimiento de cookie

**Dónde:** `Back/Controllers/auth.js:22-28`.

**Corrección opcional:** nombre `__Host-upbuy_session` en producción
(`Secure`, `Path=/`, sin `Domain`), rotación de sesión al login y al elevar
privilegios. Requiere coordinar `Front/src/proxy.ts`, que hoy busca
`access_token`.

### F-12 — Bajo — CORS con URL única y sin validación

**Dónde:** `Back/index.js:174-180` usa `origin: FRONTEND_URL`.
Si `FRONTEND_URL` falta o tiene barra final, el comportamiento no es el
esperado.

**Corrección:** parsear una lista (`FRONTEND_URLS` separadas por coma),
validar URLs con `new URL()` y fallar en producción si no hay ninguna.

---

## 4. Modelo objetivo

### 4.1 Datos

```sql
-- usuarios (columnas nuevas; el resto no se toca)
role                 VARCHAR(20) NOT NULL DEFAULT 'customer'
  CHECK (role IN ('customer','support','admin','superadmin'))
disabled             BOOLEAN NOT NULL DEFAULT false
tokenVersion         INTEGER NOT NULL DEFAULT 0
mfaEnabled           BOOLEAN NOT NULL DEFAULT false
mfaSecretEncrypted   TEXT
mfaEnrolledAt        TIMESTAMPTZ
lastLoginAt          TIMESTAMPTZ
lastLoginIp          VARCHAR(64)

-- admin_sessions
id          UUID PRIMARY KEY
userId      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE
createdAt   TIMESTAMPTZ NOT NULL DEFAULT now()
lastSeenAt  TIMESTAMPTZ NOT NULL DEFAULT now()
expiresAt   TIMESTAMPTZ NOT NULL
mfaAt       TIMESTAMPTZ
revokedAt   TIMESTAMPTZ
ip          VARCHAR(64)
userAgent   TEXT
-- índices: (userId, revokedAt), (expiresAt)

-- admin_mfa_challenges
id          UUID PRIMARY KEY
userId      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE
purpose     VARCHAR(20) NOT NULL  -- login | enroll | step_up
codeHash    TEXT                  -- solo si se guarda el reto
expiresAt   TIMESTAMPTZ NOT NULL
usedAt      TIMESTAMPTZ
attempts    INTEGER NOT NULL DEFAULT 0

-- auth_events
id          UUID PRIMARY KEY
userId      UUID REFERENCES usuarios(id) ON DELETE SET NULL
event       VARCHAR(40) NOT NULL
result      VARCHAR(20) NOT NULL
ip          VARCHAR(64)
userAgent   TEXT
metadata    JSONB NOT NULL DEFAULT '{}'
createdAt   TIMESTAMPTZ NOT NULL DEFAULT now()
```

`admin` (boolean) se mantiene **temporalmente** y se sincroniza desde `role`
para no romper `notifyAdmins` ni consultas existentes. La fuente de verdad es
`role`. En una segunda limpieza se elimina.

### 4.2 Permisos por rol (mapa estático)

| Permiso | support | admin | superadmin |
|---|---|---|---|
| `orders.read` | ✅ | ✅ | ✅ |
| `orders.write` | — | ✅ | ✅ |
| `orders.refund` | — | ✅ | ✅ |
| `catalog.write` | — | ✅ | ✅ |
| `users.read` | ✅ | ✅ | ✅ |
| `users.write` | — | ✅ | ✅ |
| `campaigns.read` | — | ✅ | ✅ |
| `campaigns.send` | — | ✅ | ✅ |
| `providers.manage` | — | ✅ | ✅ |
| `admins.manage` | — | — | ✅ |
| `audit.read` | — | — | ✅ |

`customer` no tiene permisos administrativos.

### 4.3 Cadena de middlewares para `/api/admin`

```
requireTrustedOrigin      // Origin + X-Upbuy-CSRF
requireAuth               // JWT HS256, iss/aud, sub
requireAdminSession       // sesión viva + rol actual + disabled
requireMfa                // mfaEnabled y mfaAt reciente para permisos críticos
requirePermission(...)    // mapa de permisos
requireStepUp(...)        // solo acciones destructivas
```

Regla: **ninguna** ruta administrativa usa el claim `admin` del token.

---

## 5. Flujos

### 5.1 Login de un admin con MFA

```
POST /api/auth/login { username, password }
  → 200 si es cliente normal (cookie, como hoy)
  → 202 { mfaRequired: true, challengeId } si es admin
       (no se emite cookie todavía)

POST /api/auth/admin/mfa { challengeId, code }
  → verifica TOTP o código de respaldo
  → crea admin_sessions (2 h idle / 8 h absolutas)
  → cookie con JWT { sub, sid, ver }
  → 200 { user }
```

- Código incorrecto: 401 genérico, incrementa `attempts`, bloquea el reto a los
  5 intentos.
- Código de respaldo: se marca usado (hash bcrypt, un solo uso).
- Si `mfaEnabled = false`:
  - `403 { code: "ADMIN_MFA_SETUP_REQUIRED" }`
  - `POST /api/auth/admin/mfa/setup` con ticket de enrolamiento devuelve
    `otpauth://` + QR y códigos de respaldo **una sola vez**.

### 5.2 Logout y revocación

- `POST /api/auth/logout` revoca `sid` y limpia la cookie.
- `PATCH /api/admin/users/:id` (rol/estado) revoca todas las sesiones del
  usuario afectado.
- Cambio de contraseña incrementa `tokenVersion` y revoca sesiones admin.
- `POST /api/admin/me/sessions/revoke-all`.

### 5.3 Step-up

- `POST /api/auth/admin/step-up { code }` actualiza `admin_sessions.mfaAt`.
- Las acciones críticas exigen `mfaAt` dentro de 10 minutos.
- El front muestra un diálogo de código y reintenta la acción.

---

## 6. Cambios por archivo

### Backend

| Archivo | Cambio |
|---|---|
| `Middleware/auth.js` | JWT con `algorithms/issuer/audience/sub`; `requireAuth` solo `{ id }`; `requireAdminSession`; `requirePermission`; `requireMfa`; `requireStepUp`. |
| `Controllers/auth.js` | `issueSession` sin `admin`; login admin con MFA; endpoints de enrolamiento, verificación, step-up; logout con revocación; eventos de auth. |
| `Controllers/socialAuth.js` | Sin cambios de flujo; MFA se exige después. |
| `Controllers/orders.js` | `GET /:id` y `cancel` solo dueño; sin `req.user.admin`. |
| `Services/orders.js` | Eliminar el bypass por `user.admin` en cancelación; el admin usa el servicio administrativo. |
| `Services/notifications.js` | `notifyAdmins` por `role IN ('admin','superadmin')`. |
| `Rutas/adminOrders.js` y demás | Agregar `requirePermission`/`requireStepUp` a las rutas que correspondan. |
| `Rutas/adminAdmins.js` (nuevo) | CRUD de roles solo `superadmin`; nunca autodegradarse; nunca dejar 0 superadmins. |
| `Rutas/auth.js` | Rutas nuevas de MFA, step-up y sesiones. |
| `Middlewares/requireTrustedOrigin.js` (nuevo) | Origin + cabecera CSRF. |
| `Middlewares/rateLimits.js` | Límite por cuenta en login/MFA. |
| `config.js` | `JWT_SECRET` fuerte obligatorio; `FRONTEND_URLS`; `ADMIN_MFA_REQUIRED`; `ADMIN_SESSION_IDLE_MINUTES`; `ADMIN_SESSION_MAX_HOURS`; `ADMIN_MFA_ENCRYPTION_KEY`. |
| `DataBase/ensureAdminSecuritySchema.js` (nuevo) | Columnas y tablas idempotentes. |
| `scripts/grantAdmin.js` (nuevo) | Bootstrap del primer superadmin desde CLI, con confirmación y auditoría. |
| `scripts/migrateAdminSecurity.js` (nuevo) | Backfill de `role` desde `admin` y verificación. |
| `Utils/logger.js` | Nunca registrar tokens, códigos TOTP ni secretos. |
| `test/auth.admin.test.js` (nuevo) | F-01, F-02, JWT, MFA, permisos, revocación, último superadmin. |

### Frontend

| Archivo | Cambio |
|---|---|
| `services/api/client.ts` | Enviar `X-Upbuy-CSRF` en mutaciones; manejar `401/403` con códigos `ADMIN_MFA_SETUP_REQUIRED`, `MFA_REQUIRED`, `STEP_UP_REQUIRED`. |
| `app/admin/layout.tsx` | Guard server-side por `/api/admin/me` (rol, no booleano). |
| `app/admin/perfil/seguridad/page.tsx` | MFA, códigos de respaldo, sesiones activas. |
| `components/auth/AdminMfaForm.tsx` | Código TOTP / respaldo, reenvío de reto, mensajes claros. |
| `app/(auth)/login/page.tsx` | Soportar el paso MFA del admin sin romper el login normal. |

---

## 7. Migración y compatibilidad

1. Crear `ensureAdminSecuritySchema` idempotente:
   - `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ...`
   - `CREATE TABLE IF NOT EXISTS admin_sessions ...`
   - `CREATE TABLE IF NOT EXISTS admin_mfa_challenges ...`
   - `CREATE TABLE IF NOT EXISTS auth_events ...`
2. Backfill:
   ```sql
   UPDATE usuarios
      SET role = CASE WHEN admin THEN 'admin' ELSE 'customer' END
    WHERE role = 'customer' AND admin = true;
   ```
3. Mantener `admin` sincronizado desde `role` en la capa de servicio durante
   una versión. No permitir escrituras directas a `admin` desde la API.
4. `issueSession` deja de firmar `admin`. Los tokens viejos siguen siendo
   aceptados por firma, pero `requireAuth` ignora el claim; así se cierra F-01
   incluso antes de que expiren.
5. Bootstrap: `node scripts/grantAdmin.js --email=... --role=superadmin`
   exige `--confirm` y escribe en `audit_logs`.
6. Despliegue:
   - Agregar `ADMIN_MFA_ENCRYPTION_KEY` (32 bytes base64) y `FRONTEND_URLS`.
   - `JWT_SECRET` de al menos 32 caracteres.
   - Desplegar backend primero; el front del panel aún no existe.
   - Verificar `/health` y un login de cliente normal.
   - Recién después habilitar `/admin`.

---

## 8. Plan de implementación (fase ADM-S)

### ADM-S0 — Correcciones P0 sin UI (½–1 día)

**Estado: implementado el 2026-11-13.**

- F-01: `GET /api/orders/:id` y `POST /api/orders/:id/cancel` son solo del
  dueño (404 en vez de 403 para no revelar pedidos ajenos). `requireAuth` ya no
  adjunta `admin`; el JWT se firma con `{ id }` y `sub`. El admin opera por
  `/api/admin/orders/*`, que revalida la base.
- F-02: `Middlewares/requireTrustedOrigin.js` exige `Origin` permitido y
  `X-Upbuy-CSRF: 1` en `POST/PUT/PATCH/DELETE` **cuando hay cookie de sesión**
  (webhooks y login quedan fuera). CORS acepta una lista de orígenes. Las
  respuestas `/api/admin/*` llevan `Cache-Control: no-store`.
- F-05: JWT firmado y verificado con `HS256`, `iss=upbuy-api`,
  `aud=upbuy-web`, `sub=<id>`. `JWT_SECRET` exige >= 32 caracteres en
  producción y, si falta fuera de producción, se genera uno efímero (nunca
  `"jwtkey"`). `FRONTEND_URLS` admite lista separada por comas y es
  obligatoria en producción.
- Front: `apiSend` y `serverSend` envían `X-Upbuy-CSRF: 1`.
- Tests: `Back/test/auth.admin.test.js` (claim `admin` ignorado, token con otro
  secreto, `alg:none`, CSRF y dueño estricto con base real).

**Efecto de despliegue:** los tokens emitidos antes de ADM-S0 no llevan
`iss`/`aud` y dejan de ser válidos. Todos los usuarios deben iniciar sesión una
vez. Es intencional: cierra F-01 de inmediato.

### ADM-S1 — Rol, permisos y sesiones (2–3 días)

- `role` + permisos + `admin_sessions` + `auth_events`.
- `requireAdminSession` y `requirePermission`.
- Revocación en logout, cambio de contraseña y cambio de rol.
- `grantAdmin.js` y migración.
- Endpoints de sesiones activas.

### ADM-S2 — MFA TOTP (2–3 días)

- Enrolamiento, verificación, códigos de respaldo, rate limit, auditoría.
- Login admin en dos pasos.
- `ADMIN_MFA_REQUIRED=true` en producción.
- Tests de TOTP (con reloj fijo) y recuperación.

### ADM-S3 — Step-up y gobierno de admins (1–2 días)

- Step-up para reembolsos, cancelaciones, campañas, roles y despublicar.
- `/api/admin/admins` solo `superadmin`.
- Protección del último superadmin.
- UI de seguridad en `/admin/perfil/seguridad`.

### ADM-S4 — Endurecimiento opcional (1 día)

- `__Host-` cookie, rotación de sesión, lista de IPs permitidas
  (`ADMIN_IP_ALLOWLIST`), alertas por intentos fallidos.
- Revisión de logs y retención.

Cada subfase termina con `cd Back && npm test` verde y un resumen. No se avanza
sin aprobación.

---

## 9. Pruebas mínimas

| Caso | Resultado esperado |
|---|---|
| JWT con `admin: true` de un usuario no admin en `GET /api/orders/:id` ajeno | 404 |
| JWT con `admin: true` de un usuario no admin en `POST /api/orders/:id/cancel` ajeno | 404/403 |
| Admin real en `/api/admin/orders` | 200 |
| Admin degradado con token previo en `/api/admin/orders` | 403 |
| Mutación admin sin `Origin` permitido | 403 |
| Mutación admin sin `X-Upbuy-CSRF` | 403 |
| Login admin sin MFA configurado | 403 `ADMIN_MFA_SETUP_REQUIRED` |
| Login admin con TOTP correcto | 200 + cookie + sesión |
| Login admin con TOTP incorrecto 5 veces | reto bloqueado |
| Reutilizar un código de respaldo | 401 |
| Logout | sesión revocada; el token ya no sirve |
| Degradar un admin | sesiones revocadas |
| Degradar al último superadmin | 409 |
| `support` intentando `orders.refund` | 403 |
| Reembolso sin step-up reciente | 403 `STEP_UP_REQUIRED` |
| Token firmado con otro secreto | 403 |
| Token con `alg: none` | 403 |

---

## 10. Decisiones pendientes

1. **¿MFA obligatorio desde el día 1 del panel?**
   Recomendación: sí. Es la barrera que convierte una contraseña filtrada en un
   incidente contenido.
2. **¿Se migran los admins actuales a `role` o se crea un superadmin nuevo?**
   Recomendación: backfill automático y luego rotar contraseñas.
3. **¿Se permite `support` desde el inicio?**
   Recomendación: definir el rol en el modelo, pero asignarlo cuando exista la
   UI de gestión. No bloquea.
4. **¿Se renombra la cookie a `__Host-upbuy_session`?**
   Recomendación: hacerlo en ADM-S4, coordinado con `Front/src/proxy.ts`.
5. **¿IP allowlist?**
   Recomendación: opcional y apagada por defecto; útil si los admins operan
   desde una red fija.

---

## 11. Conclusión

El booleano `admin` **no es hoy el agujero principal**: no se puede escribir
desde la API y `requireAdmin` lo revalida. El agujero real es que **dos rutas
del comprador sí confían en el JWT**, y que el panel va a multiplicar el valor
de una sesión admin comprometida.

Antes de construir `/admin` hay que cerrar P0 (F-01, F-02, F-05). Después,
ADM-S1 y ADM-S2 convierten el acceso admin en algo defendible: rol desde la
base, permisos, sesiones revocables, MFA y auditoría.
