# PROMPT — Páginas legales de UPBUY (privacidad, términos y cookies)

> Copia y pega este documento completo como instrucción para el agente que
> implemente el trabajo. Está escrito para ejecutarse dentro del monorepo
> `E:\UpBuy`, sobre el paquete `Front/` (Next.js 16 + React 19 + Tailwind v4).

---

## 0. Rol y objetivo

Actúa como **desarrollador frontend senior + redactor legal de e-commerce** del
proyecto **UPBUY**. Debes crear en `Front/` tres páginas legales públicas,
completas y navegables:

| Ruta | Documento | Propósito |
|---|---|---|
| `/politica-de-privacidad` | Política de Privacidad y Tratamiento de Datos Personales | Cumplimiento Colombia (Ley 1581/2012, Decreto 1377/2013) y Argentina (Ley 25.326) |
| `/terminos-y-condiciones` | Términos y Condiciones de uso y compra | Contrato de compraventa a distancia y uso del sitio |
| `/preferencias-de-cookies` | Política de Cookies + panel de preferencias | Información y consentimiento granular de cookies/almacenamiento |

Además debes **integrar** esas páginas con el resto del sitio (footer, sitemap,
aviso de cookies en la primera visita) sin romper nada existente.

**Criterio de éxito:** el documento se lee como una marca formal y elegante
—no como una plantilla genérica— y cualquier usuario puede entender qué datos
se recogen, para qué, cuáles son sus derechos y cómo ejercerlos, con datos de
contacto reales y verificables.

---

## 1. Reglas del repositorio (obligatorias, no negociables)

1. Lee primero `AGENTS.md` (raíz) y `Front/AGENTS.md`. Aplican completos.
2. **Marca:** UPBUY. Nada de nombres de proyectos o marcas anteriores en
   clases, variables, textos, claves de `localStorage` ni comentarios.
3. **Todo el texto visible en español** (es-CO neutro, sin anglicismos
   comerciales). Nada de copy en inglés.
4. **No inventes endpoints ni rutas de API.** Las páginas legales son
   contenido estático: no deben llamar al backend ni requerir sesión.
5. Usa los tokens de color y tipografía del design system: no introduzcas
   colores nuevos.
6. Accesibilidad prioridad 1: contraste ≥ 4.5:1, jerarquía de encabezados
   correcta (`h1` único), focus visible, targets ≥ 44×44 px,
   `prefers-reduced-motion` respetado.
7. Componentes interactivos: si existe equivalente en Kokonut UI, instálalo con
   `npx shadcn@latest add @kokonutui/<name>`; nunca pegues código a mano.
8. Verificación final obligatoria:
   ```bash
   cd Front && npm run typecheck && npm run build
   ```
9. No dejes textos marcados como `TODO`, `lorem ipsum` ni placeholders del tipo
   `[empresa]`. Este entregable se publica tal cual.

---

## 2. Datos verificados de la empresa (usar exactamente)

- **Marca / nombre comercial:** UPBUY
- **Correo oficial:** `upbuy.official@gmail.com`
- **Teléfono / WhatsApp:** `+57 320 3775834`
- **País de operación:** Colombia (domicilio principal) con envíos y operación
  hacia Argentina.

**Titulares / responsables**

| Titular | Documento | Domicilio |
|---|---|---|
| Enmanuel Alejandro Reyes Coronel | DNI 96418943 | Constitucion 1255, 1152, Buenos Aires, Argentina |
| Jacinto Alfonso Aillon Daza | C.I. 1149460409 | Calle 52 Sur #66-32 apto 1215, Jardines de la Hacienda, Antioquia, Colombia |

> Notas de fidelidad: corrige las erratas obvias (`Alejadro` → `Alejandro`,
> `Atioquia` → `Antioquia`) y **no** añadas ciudad ni datos que no estén aquí.
> Si un dato obligatorio falta (razón social, NIT/CUIT, ciudad exacta), **no lo
> inventes**: agrega una línea en el reporte final bajo "Datos a confirmar por
> el titular" y deja el campo redactado de forma que siga siendo legalmente
> válido sin él (p. ej. "domicilio indicado arriba").

---

## 3. Marco legal que debe reflejarse

El texto no debe citar leyes como adorno: debe **cumplir** sus obligaciones
concretas (información previa, finalidad, derechos, canales, plazos).
Incluye una sección final de "Marco normativo aplicable" con las normas
listadas, sin transcribir artículos completos.

### Colombia
- **Ley 1581 de 2012** y **Decreto 1377 de 2013** (compilado en el Decreto
  1074 de 2015): tratamiento de datos personales, autorización previa,
  expresa e informada, finalidades, derechos del titular (conocer, actualizar,
  rectificar, suprimir, revocar la autorización, presentar quejas), deberes del
  responsable, atención de consultas (10 días hábiles) y reclamos (15 días
  hábiles, prorrogables 8 más).
- **Ley 1266 de 2008**: hábeas data financiero, cuando aplique a reportes de
  pago.
- **Ley 1480 de 2011** (Estatuto del Consumidor): información veraz y
  suficiente, precio total, derecho de retracto (5 días hábiles en ventas a
  distancia), reversión del pago, garantía legal, atención de PQR.
- **Ley 527 de 1999** y **Decreto 1074 de 2015**: comercio electrónico,
  mensajes de datos y firma electrónica.
- **Autoridad:** **Superintendencia de Industria y Comercio (SIC)** —
  Protección de Datos y Protección al Consumidor. Registro Nacional de Bases
  de Datos (RNBD) cuando la ley lo exija.

### Argentina
- **Ley 25.326** de Protección de Datos Personales y sus normas
  reglamentarias: consentimiento libre, expreso e informado; información en
  bases de datos; derechos de acceso, rectificación, supresión y actualización
  (art. 14 y ss.); plazos y procedimiento; transferencia internacional de
  datos (art. 16); deber de confidencialidad.
- **Ley 24.240** de Defensa del Consumidor (con las modificaciones de la Ley
  26.361): información clara, veraz y detallada; derecho de revocación de
  **10 días corridos** en compras a distancia; trato digno; garantía legal.
- **Código Civil y Comercial de la Nación**, arts. 1092 a 1122: contratos de
  consumo, deber de información, publicidad, cláusulas abusivas.
- **Ley 25.506** de Firma Digital, cuando aplique a la aceptación electrónica.
- Autoridad de aplicación: **Agencia de Acceso a la Información Pública
  (AAIP)**. Menciona los lineamientos de la AAIP sobre cookies y rastreo en
  línea como referencia de buenas prácticas, sin afirmar que existe una ley
  argentina específica de cookies.

### Transversal
- **RGPD/UE**: aplica solo si se ofrecen bienes o servicios a personas en la
  UE; redáctalo como "si en el futuro se dirigen servicios a la Unión Europea"
  y no como si UPBUY ya estuviera sujeto a él.
- En ambos países rige el principio de **finalidad determinada, minimización y
  seguridad**. El documento debe declararlo expresamente.
- Cierra la política con: "Este documento es informativo y no constituye
  asesoría legal. UPBUY recomienda revisión profesional antes de cambios
  normativos." No pongas esta frase como excusa de calidad: el texto debe ser
  correcto por sí mismo.

---

## 4. Contenido exigido por documento

### 4.1 `/politica-de-privacidad`

Debe incluir, numerado y con anclas internas:

1. **Identificación del responsable** (titulares de la tabla anterior,
   correo, teléfono, domicilios).
2. **Alcance**: sitios, checkout, WhatsApp, correo, redes y presencial cuando
   se recolecten datos para UPBUY.
3. **Datos que se recolectan**: identificación y contacto; dirección de
   entrega y facturación; datos de la compra (productos, importes, número
   `UPBUY-AAAA-NNNNNN`); datos de pago (aclarando que UPBUY **no almacena**
   números de tarjeta: los procesa la pasarela); datos de navegación y
   dispositivo; comunicaciones; datos de terceros que el usuario autorice.
4. **Finalidades** separadas por base legal: ejecución del contrato,
   obligación legal (contabilidad, tributaria), interés legítimo (prevención de
   fraude, seguridad) y consentimiento (marketing, analítica no esencial,
   cookies no necesarias).
5. **Autorización**: cómo se otorga (checkbox no premarcado en registro,
   checkout y newsletter), cómo se prueba y cómo se revoca.
6. **Datos sensibles y de menores**: no se solicitan datos sensibles; compras
   de menores de edad requieren autorización de su representante legal.
7. **Encargados y terceros**: hosting, paquetería, pasarela de pagos,
   analítica, mensajería. Sin nombrar proveedores concretos si no están
   confirmados; describe categorías y el deber de confidencialidad.
8. **Transferencias nacionales e internacionales** (Colombia ↔ Argentina y
   proveedores en la nube), con la base legal de cada caso.
9. **Conservación**: plazos por tipo de dato, atados a obligaciones
   contables y a la atención de reclamaciones.
10. **Seguridad**: medidas técnicas y organizativas, control de acceso,
    cifrado en tránsito, registro de incidentes, notificación de brechas a
    titulares y autoridades cuando corresponda.
11. **Derechos del titular**: tabla comparada Colombia / Argentina con el
    derecho, cómo se ejerce y el plazo de respuesta. Incluye el canal único
    `upbuy.official@gmail.com` con asunto "Protección de datos" y el teléfono.
12. **Cookies**: resumen breve y enlace a `/preferencias-de-cookies`.
13. **Cambios a la política** y fecha de última actualización.
14. **Autoridades y reclamos**: SIC (Colombia) y AAIP / Defensa del Consumidor
    (Argentina).

### 4.2 `/terminos-y-condiciones`

1. **Aceptación** y capacidad legal para contratar.
2. **Identificación del vendedor** (mismos datos de la tabla).
3. **Objeto**: venta de indumentaria y accesorios a través del sitio.
4. **Registro y cuenta**: veracidad de los datos, custodia de credenciales,
   suspensión por uso indebido.
5. **Productos, imágenes y disponibilidad**: variaciones de color por
   pantalla, stock sujeto a confirmación, derecho a cancelar y reembolsar si
   no hay disponibilidad.
6. **Precios y moneda**: COP para Colombia y ARS para Argentina, impuestos
   incluidos o indicados, costo de envío mostrado antes de pagar, actualización
   de precios sin efecto retroactivo.
7. **Proceso de compra y pago**: confirmación, número `UPBUY-AAAA-NNNNNN`,
   medios de pago, rechazo por parte de la pasarela, comprobantes.
8. **Envíos y entregas**: cobertura, plazos estimados (no garantizados),
   intentos de entrega, dirección errónea, pérdida o daño en tránsito.
9. **Retracto / revocación** con tabla de plazos: **Colombia 5 días hábiles**
   (Ley 1480/2011) y **Argentina 10 días corridos** (Ley 24.240 art. 34),
   condiciones del producto, quién paga el retorno y plazo de reembolso.
10. **Cambios y devoluciones por talla o defecto**: distinción clara entre
    cambio voluntario y garantía legal; producto sin uso, etiquetas y empaque.
11. **Garantía legal** y procedimiento de reclamo.
12. **Promociones, cupones y sorteos**: vigencia, condiciones, no acumulables
    salvo indicación.
13. **Propiedad intelectual**: marca, fotografías, textos y diseño; prohibición
    de reproducción.
14. **Conducta del usuario**: no usar el sitio para fraude, scraping abusivo,
    suplantación o contenido ilícito.
15. **Limitación de responsabilidad** redactada de forma válida en ambos
    países (sin excluir derechos irrenunciables del consumidor).
16. **Suspensión del servicio** y fuerza mayor.
17. **Ley aplicable y resolución de conflictos**: para consumidores, la ley y
    los tribunales del domicilio del consumidor; intento de solución directa
    previo a la vía administrativa o judicial.
18. **Atención al cliente y PQR**: correo, teléfono, horario y plazos de
    respuesta.
19. **Modificaciones de los términos** y fecha de vigencia.

### 4.3 `/preferencias-de-cookies`

1. **Qué son cookies y tecnologías similares** (localStorage, píxeles,
   identificadores).
2. **Clasificación por finalidad**:
   - **Estrictamente necesarias** (sesión `access_token`, carrito
     `upbuy.cart.v1`, seguridad): siempre activas, no requieren consentimiento.
   - **Preferencias**: idioma, país/moneda, última categoría vista.
   - **Analítica**: medición agregada de uso.
   - **Marketing**: remarketing y medición de campañas.
3. **Tabla de cookies**: nombre, proveedor, finalidad, duración, tipo y base
   legal. Si aún no hay analítica/marketing instaladas, la tabla debe decirlo
   con honestidad ("no se utilizan actualmente") en lugar de inventar cookies.
4. **Panel de preferencias funcional**: toggles por categoría, "Aceptar
   todas", "Rechazar no necesarias", "Guardar preferencias" y enlace para
   reabrir el panel desde el footer. Persistencia en `localStorage` bajo la
   clave **`upbuy.consent.v1`** con versión y fecha ISO del consentimiento.
5. **Aviso en primera visita**: banner/hoja inferior elegante, no bloqueante
   del contenido, con enlace a la política y a los términos. No premarcar
   categorías no necesarias. Debe poder rechazarse con un clic.
6. **Cómo retirar o cambiar el consentimiento** y cómo borrar cookies en el
   navegador (Chrome, Safari, Firefox, Edge: mención breve, sin capturas).
7. **Base legal y derechos** (remisión a la política de privacidad).
8. **Fecha de última actualización**.

---

## 5. Dirección de arte: "formal elegante"

Aplica `Front/docs/DESIGN_SYSTEM.md` al pie de la letra. Resumen operativo:

- **Paleta:** carbon `#0B0B0B`, cream `#F5E9D7`, terracotta `#D35400`,
  coffee `#8B6F56`, más los derivados accesibles `terracotta-deep #A94200` y
  `coffee-deep #6B5343` para texto pequeño sobre fondo claro. **Cero colores
  nuevos**, cero morados/azules de plantilla.
- **Tipografía:** Space Grotesk en títulos, Manrope en cuerpo. Cuerpo legal a
  16–17 px con `line-height` 1.7 y ancho de lectura de 65–72 caracteres.
- **Composición editorial:** cabecera oscura (carbon) con etiqueta pequeña en
  terracotta (`POLÍTICAS`, `LEGAL`, `COOKIES`), `h1` grande en mayúsculas,
  línea de "Última actualización" y un resumen de 2–3 líneas en `cream/70`.
  El cuerpo va sobre `cream`/`background` con reglas finas (`border-cream/15`,
  `border-border`) en lugar de tarjetas redondeadas.
- **Estructura de lectura:** layout de dos columnas en desktop (índice
  "En esta página" sticky a la izquierda con anclas activas, contenido a la
  derecha) y una sola columna en móvil con un `<details>` de índice.
- **Numeración:** secciones `01`, `02`, `03`… con `tabular-nums`, como en
  `/nosotros`.
- **Detalles de elegancia:** sin sombras exageradas, sin gradientes de relleno,
  sin emojis. Iconografía `lucide-react` a 16/20 px. Animaciones sutiles con
  `<Reveal />` (`@/components/shared/Reveal`) y respeto a
  `prefers-reduced-motion`.
- **Estados de foco:** `focus-visible:outline-2 focus-visible:outline-offset-2`
  en terracotta.
- **Print:** añade estilos de impresión legibles (fondo blanco, texto negro,
  ocultar navbar/footer/índice) porque estos documentos se imprimen y se
  adjuntan a reclamaciones.
- Reutiliza lo existente: `container-page`, `section-y`, `Reveal`,
  `DotFieldBackground`. No dupliques utilidades ni crees un segundo sistema de
  espaciado.

---

## 6. Implementación técnica esperada

1. **Estructura de archivos**
   ```
   Front/src/app/(store)/politica-de-privacidad/page.tsx
   Front/src/app/(store)/terminos-y-condiciones/page.tsx
   Front/src/app/(store)/preferencias-de-cookies/page.tsx
   Front/src/components/legal/LegalPageShell.tsx      (cabecera + índice + tipografía legal)
   Front/src/components/legal/LegalSection.tsx        (sección numerada con ancla)
   Front/src/components/legal/CookiePreferences.tsx   (panel cliente con toggles)
   Front/src/components/legal/CookieConsentBanner.tsx (aviso primera visita)
   Front/src/lib/consent.ts                           (lectura/escritura de upbuy.consent.v1)
   Front/src/data/legal/*.ts                          (contenido en constantes tipadas)
   ```
   Mantén el contenido en datos tipados (no HTML suelto) para que sea
   mantenible y testeable. Nada de `dangerouslySetInnerHTML`.

2. **Server/Client:** las tres páginas son Server Components. Solo el panel de
   cookies y el banner son `"use client"`, y deben ser *hydration-safe* (leer
   `localStorage` después del montaje, sin mismatch de hidratación).

3. **Metadata** en cada página: `title`, `description`, `openGraph`
   (`locale: "es_CO"`), `alternates.canonical`, `robots: index, follow`.
   Añade `lastModified` coherente con la fecha real de publicación.

4. **Integración obligatoria**
   - `Front/src/components/layout/Footer.tsx`: corrige el bloque "Políticas"
     para apuntar a las rutas reales y añade "Preferencias de cookies" (que
     además reabre el panel). Nada de `href="/nosotros"`.
   - `Front/src/app/sitemap.ts`: agrega las tres rutas con
     `changeFrequency: "yearly"` y `priority: 0.3`.
   - `Front/src/app/(store)/layout.tsx`: monta el banner de consentimiento si
     aún no existe uno, o reutiliza el existente; **no** dupliques avisos.
   - Enlaza desde el checkout (`/checkout`) la aceptación de términos y la
     política de privacidad en el punto donde el usuario confirma la compra.

5. **Contenido accesible**
   - Un solo `h1` por página; secciones con `h2` y subsecciones `h3`.
   - Índice con `aria-label="Contenido de la página"` y anclas con
     `scroll-mt-28` para que el navbar fijo no tape el título.
   - Los toggles de cookies: `role="switch"`, `aria-checked`, etiqueta
     asociada y estado deshabilitado real (no solo visual) para las
     necesarias.
   - Fechas en formato legible: "17 de noviembre de 2026".
   - Sin texto justificado forzado; sin `text-[10px]` en el cuerpo legal.

6. **Rendimiento:** páginas estáticas (sin `fetch`), cero JS innecesario,
   cero dependencias nuevas salvo lo estrictamente requerido.

---

## 7. Tono y redacción

- Español claro, sobrio, en segunda persona formal ("usted" o "tú" de forma
  consistente: elige **"tú"** y no mezcles).
- Frases cortas. Nada de jerga jurídica sin explicación: si usas "encargado
  del tratamiento", define el término entre paréntesis la primera vez.
- Sin promesas absolutas ("nunca fallamos", "100 % seguro"). Usa "medidas
  razonables y proporcionales".
- Sin duplicar párrafos entre documentos: la política remite a los términos y
  viceversa con enlaces internos.
- Nada de texto en inglés, ni siquiera en los títulos de sección.

---

## 8. Verificación antes de entregar

- [ ] `cd Front && npm run typecheck` sin errores.
- [ ] `cd Front && npm run build` sin errores ni warnings nuevos.
- [ ] Las tres rutas renderizan en dev (`npm run dev`, puerto 3001) y son
      navegables desde el footer.
- [ ] Navegación por teclado completa; el índice lleva a cada sección y el foco
      es visible.
- [ ] Los toggles de cookies guardan, releen y respetan `upbuy.consent.v1`
      tras recargar; "Rechazar no necesarias" deja solo las necesarias.
- [ ] Contraste comprobado en los pares usados (crema sobre carbon, coffee-deep
      sobre crema, terracotta-deep sobre crema).
- [ ] Responsive 320 / 768 / 1024 / 1440 sin scroll horizontal.
- [ ] Sin emojis, sin `TODO`, sin datos de ejemplo, sin marcas de terceros.
- [ ] Datos de contacto y titulares idénticos a la tabla de la sección 2.
- [ ] Imprimir la página (Ctrl+P) produce un documento limpio.

---

## 9. Entregable del agente

Al terminar, responde con:

1. Lista de archivos creados y modificados.
2. Rutas nuevas y cómo se llega a ellas.
3. Un párrafo por documento explicando qué obligación legal cubre.
4. Verificación ejecutada (comandos y resultado).
5. **Datos a confirmar por el titular** (si falta razón social, NIT/CUIT,
   ciudad exacta o correo de privacidad dedicado) y **puntos donde conviene
   revisión legal profesional** (retracto, transferencias internacionales,
   RNBD, tratamiento de datos de pago).
