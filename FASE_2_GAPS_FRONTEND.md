# Fase 2 — Validación de gaps entre backend y frontend

**Fecha:** 2026-11-25
**Alcance:** contrato público de producto (Fase 1) vs. tipos, detalle, panel de compra, carrito, checkout y resumen de pedido.
**Estado:** completada.

---

## 1. Resumen ejecutivo

El front **solo transporta la talla**. El color nunca aparece en el tipo público, ni en el detalle, ni en el panel de compra, ni en el carrito, ni en el checkout. Aunque el backend ya guarda `{ size, color }` por variación en `supplier_product_variations.attributes`, ese dato **no llega al usuario** y, cuando llega al backend en un pedido, **se ignora** (`shirtColor` se fija en `null`).

Consecuencia directa: dos colores del mismo producto y talla **se fusionan en una sola línea del carrito** y el pedido no puede resolver la variante exacta en MasterShop (devuelve `ambiguo`).

---

## 2. Archivos inspeccionados y hallazgos

### 2.1 Tipos del catálogo — `Front/src/types/catalog.ts`

- `PublicProduct` (líneas 20-47): tiene `sizes: string[]` (línea 38). **No** tiene `colors`, `variants`, `variants[]` ni `options`.
- Coincide exactamente con `publicShape()` del backend (Fase 1).
- `ProductCardData` (líneas 105-121): también `sizes`, sin color.

### 2.2 Tipos de pedido — `Front/src/types/order.ts`

- `OrderItem` (líneas 6-17): campos `size`, `quantity`, `unitPrice`, `lineTotal`, `nameSnapshot`… **no tiene `color` ni `shirtColor`**.
- `CreateOrderItem` (líneas 98-102): `productId`, `quantity`, `size?`. **No tiene `color`**.
- `CreateOrderInput` (líneas 109-126): ítems sin color.

### 2.3 Página de detalle — `Front/src/app/(store)/producto/[slug]/page.tsx`

- Renderiza: categoría, combo/agotado, `name`, `price`, `compareAtPrice`, `discountPercent`, `description`, `ProductGallery`, `ProductPurchasePanel`, `sku` (ficha "Referencia"), `sizes` (ficha "Tallas"), `stock` (ficha "Disponibilidad"), `promotionVideos`, relacionados.
- **No renderiza color en ningún sitio.**
- El `jsonLd` (líneas 101-117) declara `sku`, categoría e imagen, pero **no declara variantes** (`hasVariant`/`color`) en schema.org.

### 2.4 Panel de compra — `Front/src/components/products/ProductPurchasePanel.tsx`

- `PurchaseProduct` (líneas 14-24): `productId`, `slug`, `name`, `price`, `image`, `sizes`, `available`, `stock`, `combo`. **Sin color.**
- Solo renderiza selector de **talla** (líneas 82-115).
- Identidad de línea: `cartKey({ productId, size })` (línea 49) → **producto + talla**, sin color.
- Al añadir al carrito (líneas 65-75) envía `{ productId, slug, name, price, image, size, requiresSize, stock, quantity }`. **Sin color.**
- Botón deshabilitado dice `"Selecciona tu talla"` (línea 139).

### 2.5 Carrito — `Front/src/context/cart-context.tsx`

- `CartItem` (líneas 22-32): `productId`, `slug`, `name`, `price`, `image`, `size`, `quantity`, `requiresSize`, `stock`. **Sin color.**
- `cartKey` (líneas 59-61): `` `${item.productId}::${item.size ?? ""}` `` → **el color no forma parte de la clave**.
- `sanitize` (líneas 70-95): reconstruye el objeto campo a campo y **descarta cualquier campo desconocido**. Si en el futuro se agrega `color` a `CartItem`, hay que actualizar `sanitize` o el color se perderá al recargar.
- `StorageKey`: `upbuy.cart.v1` (línea 50). Persistir un campo nuevo en la misma clave exige que `sanitize` lo acepte (o subir versión).

### 2.6 Vista del carrito — `Front/src/components/cart/CartView.tsx`

- Muestra `item.size` como `"Talla {size}"` (líneas 86-90). **No muestra color.**
- La clave de render es `cartKey(item)` (línea 51), por lo que dos colores se pintarían como una sola línea.

### 2.7 Checkout — `Front/src/components/checkout/CheckoutClient.tsx`

- `confirmOrder` envía a `POST /api/orders` (líneas 69-89):
  ```ts
  items: items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    size: item.size,
  })),
  ```
  **No envía color.**
- El resumen (líneas 326-344) muestra `Talla {size}` y cantidad × precio. **No muestra color.**
- La clave del listado es `` `${item.productId}-${item.size ?? ""}` `` (línea 328): mismo problema de colisión entre colores.

### 2.8 Resumen del pedido — `Front/src/app/(store)/pedido/[id]/page.tsx`

- Muestra `item.title` e, si existe, `item.size` como `"Talla {size}"` (línea 108). **No muestra color.**
- Depende de `OrderItem` (que tampoco tiene color).

### 2.9 Servicios de API

- `Front/src/services/catalog/index.ts`: `getProductBySlug` devuelve `PublicProduct` tal cual. No filtra ni transforma.
- `Front/src/services/orders/index.ts`: `createOrder(payload: CreateOrderInput)` → `POST /api/orders`. El payload se envía completo, así que un `color` en `CreateOrderItem` viajaría, pero no existe en el tipo.

### 2.10 Backend de creación de pedido (verificación de cierre)

- `Back/Controllers/orders.js:15-31`: extrae `{ items, shipping, notes, paymentMethodCode }` y pasa `items` **sin validación de esquema**. Un campo `color` extra **no se rechaza**, pero tampoco se usa.
- `Back/Services/pricing.js:52-133` (`resolveProduct`):
  - Solo lee `item.size` (líneas 74-89).
  - `shirtColor` se fija **hardcoded en `null`** (línea 119).
  - `variantId` también en `null` (línea 115).
- Conclusión: enviar `color` desde el front hoy no cambia nada; el backend lo ignora silenciosamente.

---

## 3. Matriz de gaps

| Campo | ¿Existe en backend JSON (`publicShape`)? | ¿Existe en front tipo (`PublicProduct`/`CreateOrderItem`)? | ¿Se muestra en detalle? | ¿Se guarda en carrito (`CartItem`)? | ¿Se envía al checkout / `POST /api/orders`? | ¿Se persiste en `OrderItem`? |
|-------|------------------------------------------|------------------------------------------------------------|-------------------------|-------------------------------------|---------------------------------------------|------------------------------|
| **Color** | ❌ No (sí en `supplier_product_variations.attributes`, pero no se expone) | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No (`shirtColor = null` hardcoded) |
| **Talla (`size`)** | ✅ Sí (`sizes: string[]`) | ✅ Sí | ✅ Sí (selector) | ✅ Sí (`CartItem.size`) | ✅ Sí (`CreateOrderItem.size`) | ✅ Sí (`OrderItem.size`) |
| **SKU de variante** | ❌ No (solo `sku` del producto) | ❌ No | ❌ No (la ficha muestra el SKU del producto) | ❌ No | ❌ No | ❌ No (`providerSku` es del producto, no de la variante) |
| **Stock por variante** | ❌ No (solo `stock` total del producto) | ❌ No | ❌ No (solo stock total) | ❌ No (solo stock total) | ❌ No | ❌ No |
| **Imagen por variante** | ❌ No (solo imágenes del producto) | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| **Precio por variante** | ❌ No (solo precio comercial del producto) | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| **`variantId` / `externalId`** | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ⚠️ La columna existe (`variantId`) pero siempre queda `null` |

---

## 4. Hallazgos críticos (más allá de la matriz)

### 4.1 El carrito fusiona colores distintos
`cartKey` solo usa `productId` + `size`. Si un producto tiene "Negro / M" y "Azul / M", ambas líneas colapsan en la misma clave:
- `add()` suma cantidades en vez de crear dos líneas (líneas 120-138 de `cart-context.tsx`).
- `CartView` y `CheckoutClient` usan claves equivalentes (`productId::size` / `productId-size`), así que el resumen también las confunde.

**Impacto:** el usuario compra "una M" cuando creía comprar dos colores, o ve una sola línea con cantidad 2.

### 4.2 `sanitize` descarta campos nuevos
`cart-context.tsx:70-95` reconstruye cada item campo a campo. Agregar `color` a `CartItem` sin tocar `sanitize` hará que el color se pierda al recargar la página (localStorage `upbuy.cart.v1`).

### 4.3 El backend ignora el color aunque llegue
`pricing.js:119` fija `shirtColor: null` sin leer `item.color`. Para que el color se persista y llegue a MasterShop/Venndelo hay que modificar el backend, no solo el front.

### 4.4 No hay validación que rechace el campo extra
`Controllers/orders.js` pasa `items` directo. Enviar `color` no rompe, pero es un no-op. Esto es bueno para la migración (se puede desplegar el front antes que el back sin errores), pero exige completar el backend en la misma iniciativa.

### 4.5 Detalle sin selector de color y sin stock por combinación
`ProductPurchasePanel` deshabilita todo el panel si `product.available` es false, pero **no puede deshabilitar una combinación color×talla agotada** porque no recibe ese dato.

---

## 5. Criterios de aceptación — verificación

| Criterio | Resultado | Evidencia |
|----------|-----------|-----------|
| Matriz de gaps completa para color, talla, SKU de variante, stock por variante e imagen por variante | ✅ Cumplido | Sección 3 |
| Se identifica que el carrito no diferencia líneas por color | ✅ Cumplido | `cartKey` en `cart-context.tsx:59-61`; `CheckoutClient.tsx:328` |
| Se identifica que el checkout no envía color al backend | ✅ Cumplido | `CheckoutClient.tsx:69-74`; `CreateOrderItem` en `types/order.ts:98-102` |

---

## 6. Cambios mínimos requeridos (insumo para Fases 3-5)

| Capa | Archivo | Cambio |
|------|---------|--------|
| Backend JSON | `Back/Services/catalog/catalogQuery.service.js` | `publicShape()` debe exponer `colors: string[]` y/o `variants: [{ id, size, color, stock, price, sku, available }]` |
| Backend pedido | `Back/Services/pricing.js` | Leer `item.color`, validarlo por variante y asignar `shirtColor` (y `variantId` si aplica) |
| Front tipos | `Front/src/types/catalog.ts` | `PublicProduct`: añadir `colors` / `variants` |
| Front tipos | `Front/src/types/order.ts` | `OrderItem`: añadir `color`/`shirtColor`; `CreateOrderItem`: añadir `color?` |
| Front detalle | `Front/src/app/(store)/producto/[slug]/page.tsx` | Pasar `colors`/`variants` a `ProductPurchasePanel`; mostrar color en ficha |
| Front panel | `Front/src/components/products/ProductPurchasePanel.tsx` | Selector de color; filtrar tallas por color; `cartKey` con color |
| Front carrito | `Front/src/context/cart-context.tsx` | `CartItem.color`; `cartKey` incluir color; `sanitize` aceptar color |
| Front carrito | `Front/src/components/cart/CartView.tsx` | Mostrar color junto a talla |
| Front checkout | `Front/src/components/checkout/CheckoutClient.tsx` | Enviar `color` en cada ítem; mostrar color en resumen; corregir clave de render |
| Front pedido | `Front/src/app/(store)/pedido/[id]/page.tsx` | Mostrar color en el resumen del pedido |

---

## 7. Conclusión de la Fase 2

1. El front es coherente con el backend **en lo que ambos exponen** (solo talla), pero ese contrato es insuficiente para productos con color.
2. El gap es **vertical**: falta el color en el JSON público → en los tipos → en el detalle → en el carrito → en el checkout → en `OrderItem` → en el pedido al proveedor.
3. El problema más grave y silencioso es la **colisión de líneas** del carrito por `cartKey` sin color: puede producir pedidos con la variante equivocada o cantidades mezcladas.
4. `sanitize` y `shirtColor = null` son dos trampas que obligan a tocar backend y front en el mismo cambio.

### Insumo para la Fase 3

La Fase 3 debe profundizar en **por qué** el color es invisible (modelo de variaciones, `resolveOrderItem`, `ambiguo` en MasterShop) y **qué se rompe** al comprar hoy, incluyendo el flujo hacia Venndelo (que no tiene adaptador de pedidos).
