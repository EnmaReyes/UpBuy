# Prompt: Avatar de usuario con iniciales, imagen social y Avatar Picker animado (Kokonut UI)

> Contexto: monorepo **UPBUY**, paquete `Front/` (Next.js 16 + React 19 + TypeScript + Tailwind v4).
> Este prompt está diseñado para ejecutarse **por fases** en otro contexto/conversación.
> No modificar `Back/` salvo que sea estrictamente necesario.

---

## 0. Objetivo

Implementar la visualización del avatar del usuario registrado:

- En un **círculo**: si tiene imagen → mostrar la imagen; si no → mostrar las **iniciales del nombre** (comportamiento actual).
- Lo mismo en la **barra de navegación / header**.
- Opción de cambiar el avatar con el **Avatar Picker de Kokonut UI** (avatares animados), tanto para **usuarios comunes como administradores**, desde su dashboard de perfil.
- Por defecto, sin imagen: iniciales del nombre.
- Si el usuario inició sesión con **Google (Gmail) o Facebook**: usar por defecto la imagen de perfil del proveedor.
- Verificar si Kokonut UI tiene **más opciones de avatar** de las que se ven en su página de demostración.

---

## 1. Contexto del proyecto (no cambiar)

- `Front/` es un proyecto independiente de Vercel. Comandos desde `cd Front`: `npm run dev`, `npm run build`, `npm run typecheck`.
- No hay lint configurado: verificar con `typecheck` y `build`.
- Todos los textos de UI en **español**. Sin copy en inglés.
- Accesibilidad prioridad 1: contraste ≥ 4.5:1, `alt` en imágenes, navegación por teclado con focus visible, `aria-label` en botones de solo icono, touch targets ≥ 44×44 px, respeto a `prefers-reduced-motion`.
- Imágenes con `next/image` siempre (salvo dominios externos no fijos, donde usar `SafeImage`), WebP/AVIF, lazy por defecto.
- Iconografía: `lucide-react`. **Nunca emoji como icono.**
- Componentes base: shadcn/ui + Kokonut UI. Instalar con CLI: `npx shadcn@latest add @kokonutui/<name>` (nunca pegar código a mano de Kokonut).
- Los componentes Kokonut ya instalados viven en `src/components/kokonutui/`.
- El front **no valida el JWT**: solo comprueba existencia de cookie `access_token`.
- Sesión: cookie `access_token`. Datos de sesión vía `useSessionProbe` (`src/hooks/use-session-probe.ts`).
- Tipos de dominio en `src/types/auth.ts`.

---

## 2. Archivos y rutas exactas (verificados)

| Archivo | Rol |
|---------|-----|
| `src/components/layout/Navbar.tsx` | Barra de navegación compartida (header). Usa `AccountButton`. |
| `src/components/layout/AccountButton.tsx` | Botón "Mi cuenta" / "Ingresar" en el navbar. Hoy muestra solo icono `User` de lucide y texto. **Aquí va el avatar.** |
| `src/components/kokonutui/morphic-navbar.tsx` | Nav split de Kokonut (no tocar para esta tarea). |
| `src/app/(store)/cuenta/perfil/page.tsx` | Página de perfil de usuario. Carga `profile` vía `getProfile()` y renderiza `ProfileForm`. |
| `src/app/admin/perfil/page.tsx` | Página de perfil de administrador. Carga `admin` + `profile` y renderiza `ProfileForm`. |
| `src/components/account/ProfileForm.tsx` | Formulario de datos personales. Ya tiene campo `image` (URL de foto) y `updateProfile`. **Aquí se integra el Avatar Picker y la vista previa del avatar.** |
| `src/types/auth.ts` | Tipos: `AuthUser` tiene `image: string \| null`, `name`, `lastName`. `ProfileInput` tiene `image?: string`. |
| `src/services/account/index.ts` | Exporta `updateProfile` (usado por `ProfileForm`). |
| `src/services/api/client.ts` | `apiSend` para mutaciones con sesión (cookie `access_token` + CSRF header `X-Upbuy-CSRF: 1`). |
| `src/components/shared/SafeImage.tsx` | Componente de imagen con fallback para dominios externos no fijos. |
| `src/components/auth/SocialLogin.tsx`, `GoogleButton.tsx`, `FacebookButton.tsx` | Login social con Google y Facebook. |
| `src/lib/google-gis.ts`, `src/lib/facebook-sdk.ts` | SDKs de Google y Facebook. |

---

## 3. Requisitos funcionales

| # | Requisito |
|---|-----------|
| R1 | Crear un componente reutilizable de avatar (círculo) que reciba el usuario y muestre: **imagen del usuario** → si no, **imagen del proveedor social (Google/Facebook)** → si no, **iniciales del nombre** (como hoy). |
| R2 | Integrar ese componente en `AccountButton` (navbar/header) para que se vea el avatar junto al nombre o en lugar del icono `User`. |
| R3 | Integrar el componente de avatar en `ProfileForm` (vista previa del avatar actual) tanto en perfil de usuario como de admin. |
| R4 | En `ProfileForm`, reemplazar/agregar el input de URL de imagen por el **Avatar Picker de Kokonut UI** con avatares animados, para que el usuario pueda elegir un avatar sin pegar URL. |
| R5 | Al iniciar sesión con Google/Facebook, si el usuario no tiene imagen propia, usar la foto del proveedor (`AuthUser.image` ya viene del backend). |
| R6 | El avatar elegido/imagen se persiste vía `updateProfile` (campo `image`) y se refleja en perfil y navbar. |
| R7 | Por defecto, sin imagen ni proveedor: iniciales del nombre (no romper comportamiento actual). |
| R8 | Investigar y reportar si Kokonut UI tiene **más opciones de avatar animado** de las mostradas en su página demo (https://kokonutui.com/llms.txt lista todos los componentes). |

---

## 4. Requisitos no funcionales / restricciones

- Idioma: español en todo el copy de UI.
- Accesibilidad: aria-labels, contraste, focus-visible, touch targets, reduced motion.
- No usar `console.log`.
- No hardcodear secretos.
- No modificar `Back/` salvo que sea estrictamente necesario (verificar si el backend ya expone `image` en `AuthUser` — sí lo expone).
- Si se agrega o modifica un endpoint, actualizar `Back/README.md` y `Front/docs/BACKEND_INTEGRATION.md`.
- Instalar componentes de Kokonut con `npx shadcn@latest add @kokonutui/<name>`, no pegando código.

---

## 5. Fase 0: Investigación (entregar antes de implementar)

1. Ejecutar `npx shadcn@latest add @kokonutui/avatar-picker` (o el nombre exacto que liste el registry). Si el componente no existe en el registry, reportarlo y buscar la alternativa más cercana.
2. Revisar https://kokonutui.com/llms.txt y reportar todos los componentes relacionados con avatar.
3. Confirmar que `AuthUser.image` llega del backend con la foto de Google/Facebook cuando aplica.
4. Verificar que `updateProfile` acepta y guarda el campo `image`.
5. Reportar rutas exactas de los archivos listados en la sección 2 (confirmar que existen y coinciden).

**Entregable Fase 0:** informe breve con: ¿existe Avatar Picker en Kokonut?, nombre exacto del paquete, componentes avatar listados en llms.txt, confirmación de rutas y campos del tipo `AuthUser`.

---

## 6. Fase 1: Componente de avatar reutilizable

Crear un componente `UserAvatar` (o similar) que:

- Reciba props: `user` (tipo `AuthUser`), `size`, `className`, `ariaLabel`.
- Muestre en un círculo accesible:
  1. Si `user.image` existe → imagen del usuario (`next/image` o `SafeImage` si es dominio externo).
  2. Si no, pero viene de proveedor social (Google/Facebook) y hay imagen → imagen del proveedor.
  3. Si no hay imagen → iniciales del nombre (`name` + `lastName`, o `username` como fallback).
- Iniciales: primera letra del nombre y primera letra del apellido (o dos letras del username si no hay nombre/apellido).
- Accesible: `role="img"`, `aria-label`, contraste adecuado, touch target ≥ 44×44 px.
- Textos en español.

**Entregable Fase 1:** archivo del componente `UserAvatar` creado y exportado, listo para importar.

---

## 7. Fase 2: Integración en la barra de navegación

En `src/components/layout/AccountButton.tsx`:

- Reemplazar el icono `User` de lucide por el componente `UserAvatar` cuando hay sesión.
- Mantener el texto del nombre junto al avatar cuando haya espacio.
- Mantener el comportamiento "Ingresar" cuando no hay sesión.
- No romper el layout del navbar (Split Nav de Kokonut, drawer móvil, etc.).

**Entregable Fase 2:** `AccountButton` muestra el avatar del usuario en el navbar.

---

## 8. Fase 3: Integración en el formulario de perfil (usuario y admin)

En `src/components/account/ProfileForm.tsx`:

- Agregar una vista previa del avatar actual del perfil (usar `UserAvatar`).
- Reemplazar o complementar el input de URL de imagen (`profile-image`) con el **Avatar Picker de Kokonut UI**.
- El Avatar Picker debe permitir elegir avatares animados.
- Al seleccionar un avatar del picker, actualizar el campo `image` y persistir mediante `updateProfile`.
- Mostrar mensaje de éxito/ error en español ("Perfil guardado.", "No se pudo guardar el perfil.", etc.).
- Funcionar tanto en `src/app/(store)/cuenta/perfil/page.tsx` como en `src/app/admin/perfil/page.tsx` (ambas renderizan `ProfileForm`).

**Entregable Fase 3:** `ProfileForm` tiene vista previa de avatar y Avatar Picker de Kokonut con avatares animados.

---

## 9. Fase 4: Prioridad de imagen y persistencia

Implementar la lógica de resolución de avatar:

1. Imagen propia del usuario (`user.image` si fue subida/elegida por el usuario).
2. Imagen del proveedor social (Google/Facebook) si el usuario no tiene imagen propia.
3. Iniciales del nombre como fallback definitivo.

Persistencia:

- El avatar elegido se guarda en `user.image` vía `updateProfile`.
- Al recargar la página, el navbar y el perfil reflejan el avatar guardado.

**Entregable Fase 4:** lógica de prioridad implementada y persistencia funcionando.

---

## 10. Fase 5: Verificación y documentación

- Ejecutar `cd Front && npm run typecheck` (debe pasar sin errores).
- Ejecutar `cd Front && npm run build` (debe pasar sin errores).
- Pruebas manuales:
  - Avatar por defecto (iniciales) cuando no hay imagen.
  - Avatar de Google/Facebook al iniciar sesión social.
  - Cambio de avatar con Avatar Picker en perfil de usuario.
  - Cambio de avatar con Avatar Picker en perfil de administrador.
  - El avatar se refleja en el navbar.
  - Accesibilidad: aria-label, focus visible, contraste.
- Reportar opciones de avatar de Kokonut encontradas (¿hay más que en la demo?).

**Entregable Fase 5:** typecheck y build pasan, pruebas manuales verificadas, breve documento de cambios y hallazgos de Kokonut.

---

## 11. Criterios de aceptación (checklist final)

- [ ] El círculo del avatar muestra imagen si existe; si no, iniciales del nombre.
- [ ] Lo mismo se ve en la barra de navegación (`AccountButton`).
- [ ] Usuario con login de Google/Facebook ve por defecto la foto del proveedor (a menos que haya elegido otra).
- [ ] Desde perfil de usuario y de admin se puede abrir el Avatar Picker de Kokonut y elegir un avatar animado.
- [ ] El avatar elegido se guarda y se refleja en perfil y navbar.
- [ ] Textos en español.
- [ ] Accesibilidad: aria-label, contraste, focus visible, touch targets ≥ 44×44 px.
- [ ] Imágenes con `next/image` o `SafeImage`, WebP/AVIF, lazy.
- [ ] `npm run typecheck` pasa sin errores.
- [ ] `npm run build` pasa sin errores.
- [ ] Reporte de opciones de avatar de Kokonut (¿hay más que en la demo?).

---

> Nota: las rutas están verificadas contra el código actual del repositorio. Si al instalar el componente de Kokonut el nombre del paquete difiere, ajustar según el registry y continuar con las fases.