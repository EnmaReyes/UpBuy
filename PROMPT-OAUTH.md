# PROMPT — Login social (Google + Facebook) y mostrar/ocultar contraseña

> Copia y pega este documento completo como instrucción para el agente que
> implemente el trabajo. Ámbito: `E:\UpBuy\Front` (Next.js 16 + React 19 +
> Tailwind v4). El backend ya tiene los endpoints y las credenciales.

---

## 0. Rol y objetivo

Actúa como **desarrollador frontend senior** del proyecto **UPBUY**. Debes:

1. Implementar **inicio de sesión con Google** y **con inicio de sesión con
   Facebook** en `/login` y `/registro`, usando los endpoints que el backend ya
   expone.
2. Añadir la opción de **mostrar/ocultar la contraseña** en los campos de
   contraseña de inicio de sesión y de registro (incluido "repite la
   contraseña").
3. Integrar todo con el flujo de sesión existente (cookie httpOnly, marcador de
   sesión, redirección por rol, MFA de administradores) sin duplicar lógica ni
   romper el login tradicional.

**Criterio de éxito:** un usuario puede entrar en dos clics desde Google o
Facebook, en español, con estados de carga, error y cancelación claros, y puede
verificar lo que escribió en el campo de contraseña sin perder el valor ni el
foco.

---

## 1. Reglas del repositorio (obligatorias)

1. Lee `AGENTS.md` (raíz), `Front/AGENTS.md` y
   `Front/docs/BACKEND_INTEGRATION.md` antes de escribir código.
2. **Marca UPBUY.** Nada de nombres de proyectos o marcas previas. Textos de UI
   **en español** (`es-CO` neutro). Nada de inglés visible.
3. **No inventes endpoints.** Los de autenticación social son exactamente:
   - `POST /api/auth/google` → body `{ "credential": "<ID token JWT de Google>" }`
   - `POST /api/auth/facebook` → body `{ "accessToken": "<access token de Facebook>" }`
   Ambos responden como `POST /api/auth/login`: usuario + cookie de sesión,
   `202 { mfaRequired: true, challengeId, expiresAt }` si es administrador con
   MFA, o `403 { code: "ADMIN_MFA_SETUP_REQUIRED", enrollmentTicket }` si el
   administrador aún no lo configuró.
4. **Los secretos viven solo en el backend.** `GOOGLE_CLIENT_SECRET` y
   `FACEBOOK_APP_SECRET` **jamás** se referencian, copian ni exponen en `Front/`.
   Al front solo van los identificadores públicos.
5. Usa el cliente HTTP existente (`apiSend` de `@/services/api/client`) y el
   marcador de sesión (`@/lib/session-marker`). No escribas `fetch` sueltos ni
   manejes cookies a mano.
6. Diseño: tokens del design system (carbon `#0B0B0B`, cream `#F5E9D7`,
   terracotta `#D35400`, coffee `#8B6F56`, `terracotta-deep`, `coffee-deep`).
   Sin colores nuevos, sin emojis, iconos `lucide-react`.
7. Accesibilidad prioridad 1: contraste ≥ 4.5:1, focus visible, targets ≥ 44×44
   px, `aria-*` correctos, respeto a `prefers-reduced-motion`.
8. Verificación final obligatoria:
   ```bash
   cd Front && npm run typecheck && npm run build
   ```

---

## 2. Estado actual (verificado en el repo)

- **Backend listo.** `Back/Controllers/socialAuth.js` ya implementa:
  - Google: verifica el ID token con `google-auth-library`
    (`verifyIdToken`, audiencia = `GOOGLE_CLIENT_ID`), exige
    `email_verified === true`, vincula por `googleId` y **auto-vincula por
    correo** si ya existe una cuenta, o crea el usuario.
  - Facebook: valida el token con `graph.facebook.com/debug_token` usando
    `FACEBOOK_APP_ID|FACEBOOK_APP_SECRET`, confirma `app_id`, lee
    `id,first_name,last_name,email,picture` y **no** auto-vincula por correo.
  - Ambos pasan por `beginAdminLogin` (MFA de administradores) y emiten la
    cookie con `issueSession`.
- **Rutas montadas** en `Back/Rutas/auth.js`:
  `POST /api/auth/google` y `POST /api/auth/facebook`, ambos con
  `authLimiter` (comparte cupo con `/api/auth/login` → puede responder
  **429**).
- **Credenciales presentes** en `Back/.env.local`: `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` (todas con
  valor). No se imprimen en ningún log ni se commitean.
- **Ya tipado en el contrato** (`Front/docs/BACKEND_INTEGRATION.md`, líneas
  ~59–61), pero **sin implementar en el front**.
- **Formularios actuales**: `src/components/auth/LoginForm.tsx` y
  `RegisterForm.tsx`, con primitivas compartidas en
  `src/components/auth/fields.tsx` (`Field`, `FormMessage`, `SubmitButton`,
  `inputClass`). El login ya sabe manejar MFA con `AdminMfaForm`.

---

## 3. Variables de entorno del frontend

Añade solo lo público:

```dotenv
# Front/.env.example  (plantilla versionada, sin secretos)
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
NEXT_PUBLIC_FACEBOOK_APP_ID=
```

Y replica los valores reales en `Front/.env.local` (gitignored) tomándolos de
`Back/.env.local`:

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` ← valor de `GOOGLE_CLIENT_ID`
- `NEXT_PUBLIC_FACEBOOK_APP_ID` ← valor de `FACEBOOK_APP_ID`

Reglas:

- **No** copies `GOOGLE_CLIENT_SECRET` ni `FACEBOOK_APP_SECRET` a `Front/`.
- El ID de Google termina en `.apps.googleusercontent.com`; el de Facebook es
  numérico. Verifícalo sin imprimir el valor, por ejemplo:
  ```bash
  node -e "const v=process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID||'';console.log('google ok:',v.endsWith('.apps.googleusercontent.com'))"
  ```
- Si una variable falta, la interfaz **no** debe romperse: el botón
  correspondiente se oculta (Google/Facebook) y el login tradicional sigue
  funcionando. Nunca muestres un error técnico al usuario por esto.
- Documenta en `Front/docs/BACKEND_INTEGRATION.md` (o en el README del front)
  que estas dos variables se incrustan en build y hay que redeployar al
  cambiarlas.

---

## 4. Implementación — Google

Flujo correcto: **Google Identity Services (GIS)**, no OAuth redirect. El
backend espera el `credential` (ID token), no un `code`.

1. Carga el script **bajo demanda**, no en el layout global:
   `https://accounts.google.com/gsi/client` con `next/script`
   (`strategy="afterInteractive"`) montado solo en `/login` y `/registro`.
   Ideal: cargarlo al primer clic en "Continuar con Google" o al montar el
   bloque social (elige una estrategia y documéntala en un comentario).
2. Inicializa una sola vez (guarda el estado en un módulo/`ref` para no
   re-inicializar en re-render):
   ```ts
   google.accounts.id.initialize({
     client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
     callback: handleCredential,
     auto_select: false,
     cancel_on_tap_outside: true,
     ux_mode: "popup",
   });
   ```
3. Renderiza el **botón oficial** con `google.accounts.id.renderButton` en un
   contenedor con altura reservada (evita CLS):
   ```ts
   google.accounts.id.renderButton(el, {
     type: "standard",
     theme: "outline",
     size: "large",
     shape: "pill",
     text: "continue_with",
     logo_alignment: "left",
     locale: "es",
     width: 320,
   });
   ```
   Ajusta `width` al ancho real del contenedor con un `ResizeObserver` o
   re-render controlado; el botón oficial **no** se puede sustituir por uno
   propio con el mismo comportamiento (normativa de marca de Google). Mientras
   carga, muestra un placeholder con la misma altura y un texto
   "Cargando Google…" en `aria-live="polite"` si tarda más de 1 s.
4. `handleCredential(response)` → `response.credential` →
   `loginWithGoogle(credential)` (ver §7). Si `credential` viene vacío, no
   llames al backend: muestra "No se pudo completar el acceso con Google.
   Inténtalo de nuevo."
5. En `logout()` añade `google.accounts.id.disableAutoSelect()` cuando el SDK
   esté disponible, para que el siguiente usuario no entre con la sesión
   anterior (guárdalo en un `try/catch`: el SDK puede no estar cargado).

Tipos: `window.google` no está tipado en el proyecto. Declara una interfaz
mínima en un archivo propio (`src/types/google.d.ts` o similar) con solo lo que
usas (`initialize`, `renderButton`, `disableAutoSelect`, `cancel`). **No**
instales `@types/google.accounts` ni dependencias nuevas si puedes evitarlo.

---

## 5. Implementación — Facebook

Flujo correcto: **SDK de JavaScript de Facebook** en el navegador; el backend
solo recibe el `accessToken`.

1. **No cargues el SDK al abrir la página.** Cárgalo tras el clic en
   "Continuar con Facebook" (mejor privacidad y menos peso). Si prefieres
   cargarlo al montar, dilo en un comentario y mantén el mismo cuidado con CLS.
2. Script: `https://connect.facebook.net/es_LA/sdk.js` (o `es_ES`, elige uno y
   sé consistente), `strategy="lazyOnload"` o inyección manual con `async` y
   `defer`.
3. Inicializa con versión **pineada en una constante** (`GRAPH_VERSION`), usando
   la versión vigente que muestre el panel de Meta para la app. No inventes un
   número: si no puedes verificarlo, deja la constante documentada para que el
   titular la confirme.
   ```ts
   FB.init({
     appId: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID!,
     cookie: false,      // no queremos cookies de Facebook sin consentimiento
     xfbml: false,
     version: GRAPH_VERSION,
   });
   ```
4. `FB.login(callback, { scope: "email,public_profile" })`:
   - `status === "connected"` → `authResponse.accessToken` →
     `loginWithFacebook(accessToken)`.
   - `status === "unknown"` o `authResponse` nulo → **cancelación del usuario**:
     no muestres error rojo; limpia el estado de carga y deja el formulario como
     estaba (mensaje neutro opcional).
   - El login puede quedar bloqueado por el navegador (popup): captura el
     rechazo y muestra "Tu navegador bloqueó la ventana de Facebook. Permite
     ventanas emergentes e inténtalo de nuevo."
5. **`FB.getLoginStatus` no es necesario** para este flujo: el token lo valida
   el backend. No lo uses para decidir nada de sesión: UPBUY es la fuente de
   verdad.
6. `cookie: false` es deliberado: evita que Facebook escriba cookies antes de
   que el usuario acepte en `/preferencias-de-cookies`.
7. Mensajes por código HTTP del backend (texto JSON):
   | Respuesta | Texto a mostrar |
   |---|---|
   | `409` "Este correo ya tiene una cuenta…" | "Ya existe una cuenta con ese correo. Inicia sesión con tu usuario y contraseña." + enlace a `/login` |
   | `422` sin correo | "Facebook no compartió tu correo. Regístrate o inicia sesión de la forma tradicional." |
   | `401` | "No pudimos validar tu cuenta de Facebook. Inténtalo de nuevo." |
   | `429` | "Demasiados intentos. Espera un minuto y vuelve a intentarlo." |
   | `503` | Ocultar/deshabilitar el botón: proveedor no configurado |

---

## 6. UI: bloque social y campo de contraseña

### 6.1 Bloque social (en `/login` y `/registro`)

Orden recomendado: primero el formulario tradicional y, debajo, el separador
"o continúa con" y los botones sociales. Alternativa válida: botones sociales
arriba y formulario debajo. **No** repitas el bloque dos veces en la misma
pantalla.

- Separador: línea fina `border-border` + texto `text-xs tracking-[0.2em]
  uppercase text-coffee-deep` ("O continúa con").
- Google: botón oficial de GIS (ancho completo del formulario, `max-w-md`).
- Facebook: botón propio permitido, con el azul de marca **solo** en el icono o
  en el borde, no como fondo a pantalla completa. Fondo `bg-card`, borde
  `border-border`, texto `text-carbon`, icono de Facebook en SVG inline (no hay
  en `lucide-react`; usa un SVG propio, sin librerías nuevas).
- Estados: `pending` deshabilita **ambos** botones y el `SubmitButton` con
  `aria-busy="true"`; texto "Conectando…" en el botón activo; spinner o
  `Loader2` con `animate-spin` solo si `prefers-reduced-motion` no está activo.
- Errores: reutiliza `FormMessage kind="error"` (`role="alert"`). Un error de
  un proveedor no debe borrar lo escrito en el formulario.
- Los botones llevan `aria-label` explícito ("Continuar con Google",
  "Continuar con Facebook") y `type="button"`.
- Todo el bloque social va dentro del mismo `max-w-md` del layout de auth; en
  móvil, ancho completo.

### 6.2 Mostrar/ocultar contraseña

Crea un componente reutilizable, p. ej.
`Front/src/components/auth/PasswordInput.tsx`:

```tsx
"use client";
// Props: id, name, autoComplete, minLength?, placeholder?, describedBy?
// Estado interno: visible: boolean
```

Requisitos:

- Envuelve el input en `relative`; el input conserva `className={inputClass}`
  más `pr-12` para no quedar debajo del botón.
- Botón tipo `button` (nunca `submit`), `absolute inset-y-0 right-0` con
  `h-11 w-11` (target ≥ 44×44), `aria-label` dinámico ("Mostrar contraseña" /
  "Ocultar contraseña"), `aria-controls={id}`, `aria-pressed={visible}`,
  `title` igual al `aria-label`, `focus-visible` visible en terracotta.
- Iconos `Eye` / `EyeOff` de `lucide-react` a `h-4 w-4`, con
  `aria-hidden="true"`.
- Cambia `type` entre `"password"` y `"text"` **sin** remontar el input (usa
  `type` como prop del mismo nodo) para no perder el valor, el cursor ni el
  autocompletado del navegador.
- No alteres `autoComplete`, `name`, `id`, `minLength` ni `required`.
- Aplica el componente en:
  - `LoginForm` → campo `password` (`autoComplete="current-password"`).
  - `RegisterForm` → `password` y `confirm` (ambos `autoComplete="new-password"`),
    cada uno con su propio toggle independiente.
- Al enviar el formulario con el campo visible, el valor debe llegar igual.
  Verifícalo.
- El botón no debe robar el foco al hacer clic con teclado: tras el toggle
  devuelve el foco al input (`inputRef.current?.focus()` preservando
  `selectionStart`/`selectionEnd`).

No uses un checkbox "Mostrar contraseña" con texto: el patrón de icono con
`aria-pressed` es el esperado y ahorra espacio en móvil.

---

## 7. Servicio y manejo de sesión (una sola fuente de verdad)

En `Front/src/services/auth/index.ts` añade:

```ts
export async function loginWithGoogle(credential: string): Promise<LoginResult>;
export async function loginWithFacebook(accessToken: string): Promise<LoginResult>;
```

Ambas:

1. Llaman a `apiSend<LoginResponse>("/api/auth/google" | "/api/auth/facebook", { body })`.
2. Interpretan la respuesta **igual que `login()`**:
   - `{ mfaRequired: true }` → `{ kind: "mfa", challengeId, expiresAt }`
   - usuario → `setSessionMarker()` y `{ kind: "authenticated", user }`
   - `ApiError` con `code === "ADMIN_MFA_SETUP_REQUIRED"` → `{ kind: "enroll", … }`

Refactoriza sin romper: extrae de `login()` la interpretación de la respuesta a
un helper privado (`interpretLoginResponse`) y úsalo en las tres funciones. No
dupliques el bloque de MFA.

Después de un login social autenticado, en el componente:

```ts
router.replace(requestedPath ?? getDashboardRoute(result.user));
router.refresh();
```

Usa el mismo `?next=` seguro (`safeInternalPath`) que ya usa `LoginForm`. Si el
resultado es `mfa`/`enroll`, reutiliza `AdminMfaForm` exactamente como hoy.

En `RegisterForm`, los botones sociales crean la cuenta si no existe: es válido.
Tras un login social exitoso desde `/registro`, redirige igual que en login (no
vuelvas a llamar a `register`).

---

## 8. Privacidad y coherencia con las páginas legales

- El login social trata datos personales: nombre, correo, foto de perfil. Debe
  quedar reflejado, sin trabajo extra de backend, en:
  - `/politica-de-privacidad` → finalidades y terceros (Google/Facebook como
    proveedores de identidad).
  - `/preferencias-de-cookies` → fila de cookies/almacenamiento de terceros,
    indicando que los SDK se cargan **solo cuando el usuario interactúa**.
- Bajo los botones, añade una línea pequeña:
  "Al continuar aceptas nuestra [política de privacidad] y los [términos y
  condiciones]." con enlaces reales (`/politica-de-privacidad`,
  `/terminos-y-condiciones`).
- **No** añadas píxeles, analítica ni scripts de Meta/Google más allá del SDK
  estrictamente necesario para el login.

---

## 9. Archivos esperados

```
Modificados
  Front/.env.example
  Front/src/services/auth/index.ts        (loginWithGoogle, loginWithFacebook, helper)
  Front/src/components/auth/LoginForm.tsx
  Front/src/components/auth/RegisterForm.tsx
  Front/src/app/(auth)/login/page.tsx      (solo si hace falta para el bloque social)
  Front/docs/BACKEND_INTEGRATION.md        (payloads y tabla de errores)

Nuevos
  Front/src/components/auth/PasswordInput.tsx
  Front/src/components/auth/SocialLogin.tsx      (bloque "o continúa con")
  Front/src/components/auth/GoogleButton.tsx     (GIS: script, init, renderButton)
  Front/src/components/auth/FacebookButton.tsx   (SDK bajo demanda, FB.login)
  Front/src/types/google.d.ts                    (tipado mínimo de GIS)
  Front/src/lib/facebook-sdk.ts                  (carga e init del SDK, singleton)
```

Puedes fusionar componentes si el resultado es más simple, pero **no** metas el
SDK, el servicio y la UI en un único archivo de 400 líneas. Componentes cliente
con `"use client"` solo donde haya estado o APIs del navegador; el resto,
servidor.

---

## 10. Casos límite que debes manejar

1. **Variables públicas ausentes** → se oculta el botón correspondiente; sin
   errores en consola, sin romper el layout.
2. **Script bloqueado** (adblock, CSP, red) → mensaje claro, botón deshabilitado
   tras N segundos, formulario tradicional intacto.
3. **Popup cerrado por el usuario** (Google o Facebook) → sin error rojo,
   `pending` vuelve a `false`.
4. **429 del rate limit** → mensaje específico, no "error desconocido".
5. **Administrador con MFA** que entra por Google → debe caer en
   `AdminMfaForm`, nunca en `/cuenta/perfil`.
6. **Usuario ya logueado** que abre `/login` → comportamiento actual intacto
   (no agregues redirecciones nuevas que puedan crear bucles).
7. **Doble clic** en el botón social → una sola petición (guardia con `pending`
   y `ref`).
8. **Cambio de ruta durante la carga** → no actualices estado en un componente
   desmontado (`AbortController` o comprobación de montaje).
9. **Token de Facebook sin correo** (`422`) → explicación y enlace a registro
   tradicional.
10. **Hidratación**: cualquier lectura de `window`/`FB`/`google` va en
    `useEffect` o en un handler de clic, nunca en el render inicial.

---

## 11. Verificación antes de entregar

- [ ] `cd Front && npm run typecheck` sin errores.
- [ ] `cd Front && npm run build` sin errores ni warnings nuevos.
- [ ] Login con Google desde `/login` entra y redirige a `/cuenta/perfil` (o al
      `?next=` solicitado).
- [ ] Login con Facebook desde `/login` entra correctamente.
- [ ] Registro con Google/Facebook desde `/registro` crea la cuenta y entra.
- [ ] Cancelar el popup no muestra error y permite reintentar.
- [ ] Con un correo ya registrado, Facebook muestra el mensaje de `409` con
      enlace a `/login`.
- [ ] El toggle de contraseña funciona en login, registro y confirmación:
      conserva el valor, el foco y el `autocomplete`.
- [ ] Navegación solo con teclado por todo el bloque social: orden lógico,
      focus visible, `Enter`/`Space` activan los botones.
- [ ] Sin salto de layout al cargar los SDK (CLS estable en móvil 320 px).
- [ ] `grep -ri "client_secret\|app_secret" Front/src` no devuelve nada.
- [ ] No hay secretos en `Front/.env.local` versionado ni en el diff.
- [ ] Textos 100 % en español, sin emojis.
- [ ] `Front/docs/BACKEND_INTEGRATION.md` actualizado con los dos endpoints y
      sus errores.

---

## 12. Entregable del agente

Responde con:

1. Archivos creados y modificados.
2. Cómo se carga cada SDK (momento, estrategia, versión pineada de Graph API).
3. Qué pasa si faltan `NEXT_PUBLIC_GOOGLE_CLIENT_ID` /
   `NEXT_PUBLIC_FACEBOOK_APP_ID`.
4. Resultado de `typecheck` y `build`.
5. **Pendientes del titular:** registrar los orígenes autorizados
   (`http://localhost:3001` en desarrollo y el dominio de producción) en Google
   Cloud Console y en Meta for Developers (App Domains + OAuth redirect URIs,
   app en modo Live, permiso `email` revisado), y confirmar la versión de Graph
   API usada.
