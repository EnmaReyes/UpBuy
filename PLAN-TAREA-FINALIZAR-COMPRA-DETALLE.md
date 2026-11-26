# Plan de tarea: Botón "Finalizar compra" en detalle de producto + corrección de redirección login/dashboard

**Fecha:** 26 de noviembre de 2026  
**Repo:** UpBuy (monorepo) — paquete `Front/`  
**Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4  
**Autor:** agente de planificación (para revisión del equipo)

---

## 1. Contexto y problema

### 1.1 Estado actual del detalle de producto
- Página: `Front/src/app/(store)/producto/[slug]/page.tsx` (Server Component)
- El panel de compra está en `Front/src/components/products/ProductPurchasePanel.tsx` (Client Component)
- Actualmente solo existe la acción **"Agregar al carrito"** a través de `useCart().add()` → `localStorage` bajo `upbuy.cart.v1`
- No hay ruta directa a checkout para comprar una sola unidad sin pasar por la página del carrito (`/carrito`)

### 1.2 Flujo de checkout actual
- Página: `Front/src/app/(store)/checkout/page.tsx` (Server Component)
- `getSession()` → si no hay sesión: `redirect("/login?next=/checkout")` (línea ~20)
- `getProfile()` → si 401: login; si falta perfil: `CompleteProfileNotice` con enlace a `/cuenta/perfil`
- `CheckoutClient` (`Front/src/components/checkout/CheckoutClient.tsx`) maneja `confirmOrder()` → `POST /api/orders` → redirección a `/pedido/${order.id}`

### 1.3 Problema reportado
> "Si el usuario está registrado pero no tiene los datos necesarios (la dirección específicamente) registrados al darle finalizar comprar los redirige al login en vez de al dashboard para completar los formularios de datos. Solo debe redirigir al login si no está logueado. Pero si está logueado no debe redirigir al login ya que arrojará error al intentar iniciar sesión de vuelta."

**Diagnóstico:** Cuando el usuario está autenticado (tiene sesión/cookie) pero su perfil está incompleto (falta dirección), el flujo de checkout no debe enviarlo a `/login`. Debe enviarlo a `/cuenta/perfil` (dashboard del comprador) para completar los formularios. El redireccionamiento a login solo aplica cuando no hay sesión en absoluto.

---

## 2. Objetivos / Criterios de aceptación

| ID | Criterio | Prioridad |
|----|----------|-----------|
| CA-1 | Agregar botón **"Finalizar compra"** en la sección de detalle de producto (compra directa de 1 unidad, sin pasar obligatoriamente por el carrito) | Alta |
| CA-2 | El botón debe llevar al checkout con el producto ya seleccionado (1 unidad, variante elegida si aplica) | Alta |
| CA-3 | Si el usuario **NO está autenticado** → redirigir a `/login?next=/checkout` (o equivalente con `callbackUrl`) | Alta |
| CA-4 | Si el usuario **YA está autenticado** pero le falta la dirección/datos → redirigir a `/cuenta/perfil` para completar formularios (**NO** al login) | Alta |
| CA-5 | Si el usuario está autenticado y tiene datos completos → continuar al checkout normalmente | Alta |
| CA-6 | Todos los textos de UI en español; sin emojis como icono; iconos de `lucide-react` | Media |
| CA-7 | Accesibilidad: `aria-label` en botones de solo icono, focus visible, touch targets ≥ 44×44px, contraste ≥ 4.5:1 | Media |
| CA-8 | `npm run typecheck` y `npm run build` pasan en `Front/` | Alta |

---

## 3. Archivos implicados (rutas exactas)

| # | Archivo | Rol |
|---|---------|-----|
| 1 | `Front/src/app/(store)/producto/[slug]/page.tsx` | Página de detalle de producto (Server Component). Integra `ProductPurchasePanel`. |
| 2 | `Front/src/components/products/ProductPurchasePanel.tsx` | Panel de compra del detalle. Aquí se añade el botón "Finalizar compra". Usa `useCart()`. |
| 3 | `Front/src/context/cart-context.tsx` | Contexto del carrito (`add`, `items`, `clear`, `STORAGE_KEY = "upbuy.cart.v1"`). |
| 4 | `Front/src/components/kokonutui/cart-button.tsx` | Botón `AddToCartButton` (Kokonut UI). Referencia de estilo para el nuevo botón. |
| 5 | `Front/src/app/(store)/checkout/page.tsx` | Página de checkout (Server Component). Aquí se corrige la redirección login vs dashboard. |
| 6 | `Front/src/components/checkout/CheckoutClient.tsx` | Lógica de compra del cliente (`confirmOrder`, `createOrder`). |
| 7 | `Front/src/services/orders/index.ts` | `createOrder(payload)` → `POST /api/orders`. |
| 8 | `Front/src/lib/dashboard-route.ts` | `getDashboardRoute(user)` → admin: `/admin`, comprador: `/cuenta/perfil`, sin sesión: `/login`. |
| 9 | `Front/src/hooks/use-session-probe.ts` | Sonda de sesión compartida (`GET /api/auth/me`). |
| 10 | `Front/src/hooks/use-dashboard-route.ts` | Hook que combina sesión + ruta de dashboard. |
| 11 | `Front/src/types/auth.ts` | `MissingProfileField`, `MISSING_FIELD_LABELS`, `Profile`, `Address`. |
| 12 | `Front/src/types/order.ts` | `CreateOrderInput`, `CreateOrderItem`, `PaymentMethodCode`. |
| 13 | `Front/src/app/(store)/cuenta/perfil/page.tsx` | Página de perfil donde se completan los datos faltantes. |
| 14 | `Front/src/components/account/ProfileForm.tsx` | Formulario de perfil (`updateProfile` → `PUT /api/users/me`). |
| 15 | `Front/src/app/(store)/layout.tsx` | Monta `CartProvider`. |
| 16 | `Front/next.config.ts` | Proxy `/api/*` → `NEXT_PUBLIC_API_URL/api/*`. |

---

## 4. Diseño de solución

### 4.1 Botón "Finalizar compra" en detalle de producto
- Ubicación: dentro de `ProductPurchasePanel.tsx`, junto al botón "Agregar al carrito" (misma fila o bloque separado, según diseño).
- Comportamiento:
  1. Tomar la variante seleccionada (color/talla) y cantidad = 1.
  2. Agregar el ítem al carrito local (`useCart().add()`) si aún no está, o asegurar que esté con cantidad 1.
  3. Redirigir a `/checkout`.
- Si el usuario no tiene sesión: el checkout/server ya maneja el redirect a login con `next=/checkout`.
- Estilo: token de color terracotta (`#D35400`) o carbon (`#0B0B0B`) según design system; icono de `lucide-react` (por ejemplo `ShoppingCart` o `ArrowRight`); `aria-label="Finalizar compra"`.

### 4.2 Corrección de redirección en checkout (`checkout/page.tsx`)
Flujo deseado:

```
Usuario accede a /checkout
├─ getSession() → ¿hay sesión?
│  ├─ NO → redirect("/login?next=/checkout")        ← SOLO este caso va a login
│  └─ SÍ → getProfile()
│     ├─ 401 / sesión inválida → redirect("/login?next=/checkout")
│     ├─ profile incompleto (falta dirección, nombre, teléfono, etc.)
│     │   → redirect("/cuenta/perfil?next=/checkout&missing=address")   ← dashboard, NO login
│     └─ profile completo → render CheckoutClient
```

**Nota importante:** El reporte indica que `checkout/page.tsx` ya muestra `CompleteProfileNotice` cuando el perfil está incompleto, pero el usuario experimenta que lo redirige al login. Hay que revisar si en algún punto del flujo (quizás al hacer click en "Finalizar compra" desde el detalle, o en algún middleware/guard) se fuerza el login antes de llegar al `CompleteProfileNotice`. La corrección debe garantizar que **ningún usuario autenticado sea enviado a `/login` por falta de dirección**.

### 4.3 Parámetro `next` / `callbackUrl`
- Al redirigir al login: incluir `?next=/checkout` para que, tras autenticar, vuelva al checkout.
- Al redirigir al perfil: incluir `?next=/checkout` para que, tras completar el perfil, vuelva al checkout.
- Usar `safeInternalPath` para validar que `next` sea una ruta interna (evitar open redirect).

---

## 5. Pasos de implementación

### Paso 1 — Exploración y verificación (revisión de código)
- Leer `ProductPurchasePanel.tsx` completo para ver dónde insertar el botón y cómo se manejan variantes/stock.
- Leer `checkout/page.tsx` completo para confirmar la lógica actual de `getSession()` y `getProfile()`.
- Leer `CheckoutClient.tsx` para confirmar cómo maneja `PROFILE_INCOMPLETE`.
- Verificar que `getDashboardRoute` devuelve `/cuenta/perfil` para compradores no admin.
- **Entregable:** confirmación de los puntos de inserción y modificación exactos.

### Paso 2 — Agregar botón "Finalizar compra" en detalle de producto
- En `ProductPurchasePanel.tsx`:
  - Importar `useRouter` de `next/navigation`.
  - Añadir un botón "Finalizar compra" (diseño Kokonut UI, texto en español, icono lucide-react).
  - Al hacer click: asegurar 1 unidad del producto con variante seleccionada en el carrito (`useCart().add()`), luego `router.push("/checkout")`.
  - Si el carrito ya tiene otros ítems, mantenerlos (el botón no debe vaciar el carrito; solo asegurar que este producto esté con qty ≥ 1).
- **Entregable:** botón visible y funcional en el detalle de producto.

### Paso 3 — Corregir redirección en checkout (login vs dashboard)
- En `checkout/page.tsx`:
  - Asegurar que `getSession()` sin sesión → solo `/login?next=/checkout`.
  - Si hay sesión pero `getProfile()` devuelve perfil incompleto (falta `address` u otro campo de `MissingProfileField`) → redirect a `/cuenta/perfil?next=/checkout&missing=address` (o los campos faltantes).
  - Nunca redirigir a `/login` cuando ya hay sesión válida.
- **Entregable:** usuario autenticado sin dirección va al perfil, no al login.

### Paso 4 — Verificar flujo post-completar-perfil
- En `cuenta/perfil/page.tsx` y `ProfileForm.tsx`: asegurar que al guardar el perfil completo, si hay `?next=/checkout` en la URL, redirija al checkout al finalizar.
- **Entregable:** flujo cerrado: detalle → checkout → perfil (si falta dirección) → checkout → pedido.

### Paso 5 — Pruebas de tipo y build
- Ejecutar en `Front/`:
  ```bash
  npm run typecheck   # tsc --noEmit
  npm run build       # next build
  ```
- Corregir errores de TypeScript si los hay.
- **Entregable:** typecheck y build verdes.

### Paso 6 — Pruebas funcionales manuales
1. Usuario anónimo en detalle de producto → click "Finalizar compra" → redirige a login con `next=/checkout`.
2. Usuario logueado con dirección completa → click "Finalizar compra" → va directamente al checkout.
3. Usuario logueado SIN dirección → click "Finalizar compra" → va a `/cuenta/perfil` (NO al login), completa datos, vuelve al checkout.
4. Verificar que no hay error al intentar iniciar sesión de vuelta (no hay doble login).
- **Entregable:** los 4 escenarios funcionan según CA-3, CA-4, CA-5.

---

## 6. Definición de hecho (DoD)

- [ ] Botón "Finalizar compra" visible en la sección de detalle de producto.
- [ ] Compra directa de 1 unidad funciona sin pasar por `/carrito`.
- [ ] Usuario no autenticado → login con `next=/checkout`.
- [ ] Usuario autenticado sin dirección → `/cuenta/perfil` (nunca `/login`).
- [ ] Usuario autenticado con datos completos → checkout directo.
- [ ] Textos en español, iconos `lucide-react`, sin emojis.
- [ ] Accesibilidad: aria-label, focus visible, touch target ≥ 44×44px.
- [ ] `npm run typecheck` y `npm run build` pasan en `Front/`.

---

## 7. Notas de estilo y convenciones (AGENTS.md)

- Todos los textos de UI en **español**. Nada de copy en inglés.
- Iconografía: `lucide-react`. **Nada de emoji como icono.**
- Comentarios en español; backend escribe ASCII plano, pero el front puede usar tildes normalmente en textos de UI.
- No usar `console.log` en backend (no aplica al front, pero evitar `console.log` innecesario).
- Si se agrega un endpoint o se modifica contrato front-back, actualizar `Back/README.md` y `Front/docs/BACKEND_INTEGRATION.md` (no aplica si solo cambia el front).
- Comandos desde dentro de `Front/`: `npm run typecheck`, `npm run build`, `npm run dev -p 3001`.

---

## 8. Riesgos y consideraciones

| Riesgo | Mitigación |
|--------|------------|
| El carrito local ya tiene ítems; agregar el producto nuevamente podría duplicar o sumar cantidad | Usar `cartKey` para detectar si ya existe la línea; si existe, asegurar qty ≥ 1 sin duplicar. |
| Redirección infinita entre checkout y perfil si el perfil nunca se marca completo | Asegurar que `ProfileForm` guarde correctamente y marque `profileComplete = true` cuando todos los campos requeridos estén presentes. |
| El parámetro `next` malicioso (open redirect) | Validar con `safeInternalPath` antes de usar en `router.push` o `redirect`. |
| Sesión expirada entre el detalle y el checkout | El checkout ya maneja 401 con redirect a login; es comportamiento esperado. |

---

## 9. Estimación (indicativa)

| Paso | Esfuerzo |
|------|----------|
| Paso 1 (exploración) | 0.5 h |
| Paso 2 (botón detalle) | 1.5 h |
| Paso 3 (corrección checkout) | 1.5 h |
| Paso 4 (flujo perfil→checkout) | 0.5 h |
| Paso 5 (typecheck + build) | 0.5 h |
| Paso 6 (pruebas manuales) | 1.0 h |
| **Total aproximado** | **~5.5 h** |

---

## 10. Aprobaciones

| Rol | Nombre | Fecha | Estado |
|-----|--------|-------|--------|
| Solicitante | — | — | Pendiente |
| Tech lead / Front | — | — | Pendiente |
| QA | — | — | Pendiente |

---

*Este plan es un documento de trabajo interno de UpBuy. No contiene secretos, credenciales ni nombres de terceros.*