# Fase 4 — Valores que faltan mostrar en el detalle del producto

**Fecha:** 2026-11-25
**Alcance:** definir el contrato de variantes expuesto por el backend y los valores que debe mostrar el detalle, el carrito y el resumen de compra para elegir color + talla y comprar con precisión.
**Estado:** completada (diseño, sin implementación).

---

## 1. Decisión de contrato: `colors` + `variants`

Se añaden **dos** campos complementarios al producto público:

| Campo | Forma | Dónde se expone | Para qué |
|-------|-------|-----------------|----------|
| `colors` | `string[]` | Listado **y** detalle | Mostrar swatches rápido (tarjetas, filtros, ficha) |
| `variants` | `VariantPublic[]` | **Solo detalle** | Resolver combinación color×talla, stock, SKU y disponibilidad |

**Por qué ambos y no solo `variants`:**
- `colors` es barato de leer y evita cargar todas las variantes en el listado (24–100 productos por página). Se denormaliza en `Product.colors` igual que hoy se hace con `sizes`.
- `variants` es necesario en el detalle para saber qué combinaciones existen y con qué stock; cargarlo en el listado sería un N+1 evitable.

### 1.1 Forma de `VariantPublic`

```ts
type VariantPublic = {
  id: string;                 // UUID de supplier_product_variations (estable en UpBuy)
  size: string | null;        // attributes.size (null si el producto es solo-color)
  color: string | null;       // attributes.color (null si el producto es solo-talla)
  stock: number;              // quantity real de la variación
  available: boolean;         // available de la variación
  sku: string | null;         // sku de la variación (puede faltar)
};
```

**Fuera de `VariantPublic` a propósito (ver sección 3):**
- `price`: el precio de venta es a nivel producto (UpBuy lo controla).
- `image`: los proveedores actuales no dan imagen por variación.
- `supplierExternalId`: dato interno; el backend resuelve el `id_variant` del proveedor.

### 1.2 Cambios de esquema backend necesarios (prerrequisito)

1. **`Product.colors` (JSONB)** — nuevo campo denormalizado, espejo de `Product.sizes`.
   - Se llena en `catalogSync.service.js` con `productColors(variations)`:
     ```js
     const productColors = (variations) => {
       const colors = new Set();
       for (const v of variations || []) {
         const color = v?.attributes?.color;
         if (color) colors.add(String(color));
       }
       return [...colors];
     };
     ```
2. **Canonicalizar Venndelo** — hoy `venndelo.normalize.js` guarda `attributes` con el `code` crudo (`TALLA`, `COLOR`). Para resolver variantes de forma uniforme hay que mapear a claves canónicas `size`/`color` (reutilizar la lógica de `mastershop.attributes.js`).
3. **`publicShape`** — añadir `colors: toArray(json.colors)`.
4. **`getBySlugOrSku`** — si `product.supplierProductId` existe, consultar `SupplierProductVariation` y añadir `variants` al resultado. El listado (`listPublished`) **no** incluye `variants`.

---

## 2. Mock del JSON esperado (`GET /api/products/:slug`)

### 2.1 Producto con color + talla

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "sku": "MS-12345",
  "slug": "camiseta-negra-12345",
  "name": "Camiseta UPBUY",
  "description": "Camiseta 100% algodón.",
  "images": [
    "https://cdn.proveedor.com/img/camiseta-1.jpg",
    "https://cdn.proveedor.com/img/camiseta-2.jpg"
  ],
  "promotionVideos": [],
  "price": 45000,
  "priceBase": 45000,
  "compareAtPrice": null,
  "discountPercent": 0,
  "currency": "COP",
  "stock": 12,
  "available": true,
  "sizes": ["S", "M", "L"],
  "colors": ["NEGRO", "AZUL"],
  "variants": [
    { "id": "a1...", "size": "S", "color": "NEGRO", "stock": 2, "available": true,  "sku": "MS-12345-NEG-S" },
    { "id": "a2...", "size": "M", "color": "NEGRO", "stock": 4, "available": true,  "sku": "MS-12345-NEG-M" },
    { "id": "a3...", "size": "L", "color": "NEGRO", "stock": 0, "available": false, "sku": "MS-12345-NEG-L" },
    { "id": "a4...", "size": "M", "color": "AZUL",  "stock": 3, "available": true,  "sku": "MS-12345-AZU-M" },
    { "id": "a5...", "size": "L", "color": "AZUL",  "stock": 3, "available": true,  "sku": "MS-12345-AZU-L" }
  ],
  "combo": false,
  "featured": false,
  "categories": [{ "id": "c1...", "name": "Camisetas", "slug": "camisetas" }],
  "createdAt": "2026-11-01T10:00:00.000Z"
}
```

> Nótese que **no existe `S/AZUL`**: la UI debe deshabilitar esa combinación.

### 2.2 Producto solo-color (sin tallas)

```json
{
  "sizes": [],
  "colors": ["ROJO", "VERDE"],
  "variants": [
    { "id": "b1...", "size": null, "color": "ROJO",  "stock": 5, "available": true, "sku": "ACC-1-ROJO" },
    { "id": "b2...", "size": null, "color": "VERDE", "stock": 0, "available": false, "sku": "ACC-1-VERDE" }
  ]
}
```

### 2.3 Producto solo-talla (sin color)

```json
{
  "sizes": ["S", "M", "L"],
  "colors": [],
  "variants": [
    { "id": "c1...", "size": "S", "color": null, "stock": 2, "available": true, "sku": "TSH-1-S" },
    { "id": "c2...", "size": "M", "color": null, "stock": 0, "available": false, "sku": "TSH-1-M" },
    { "id": "c3...", "size": "L", "color": null, "stock": 1, "available": true, "sku": "TSH-1-L" }
  ]
}
```

### 2.4 Producto manual (sin proveedor)

```json
{
  "sizes": ["Única"],
  "colors": [],
  "variants": []
}
```

> En productos manuales no hay variantes de proveedor. La UI cae al comportamiento actual (talla) y no muestra color.

---

## 3. Matriz de valores: qué se muestra y de dónde sale

| Valor | Fuente real | ¿Disponible? | Detalle | Carrito | Resumen de compra | Nota |
|-------|-------------|--------------|---------|---------|-------------------|------|
| **Colores** | `SupplierProductVariation.attributes.color` → `Product.colors` | ✅ | ✅ Swatches | ✅ Texto | ✅ Texto | Canonicalizar Venndelo antes |
| **Tallas** | `attributes.size` → `Product.sizes` | ✅ | ✅ Pills | ✅ Texto | ✅ Texto | Ya existe |
| **Combinación color×talla** | `variants[]` | ✅ | ✅ Habilita/deshabilita tallas según color | — | — | Evita combinaciones inexistentes |
| **Stock por variante** | `SupplierProductVariation.quantity` | ✅ | ✅ "Quedan N" de la variante | ✅ Tope de cantidad | — | El stock total deja de usarse para la compra |
| **Disponibilidad por variante** | `SupplierProductVariation.available` | ✅ | ✅ Agotado por combinación | — | — | — |
| **SKU de variante** | `SupplierProductVariation.sku` | ✅ | ✅ En ficha técnica al seleccionar | ⚠️ Opcional | — | Puede ser null |
| **Precio por variante** | — | ❌ | **No se muestra** | — | — | El precio es a nivel producto (ver 3.1) |
| **Imagen por variante** | — | ❌ | **No se muestra** | — | — | Los proveedores no la dan hoy (ver 3.2) |

### 3.1 Por qué NO se muestra precio por variante
- `SupplierProductVariation.originalPrice` es el **precio sugerido del proveedor**, no el precio de venta de UpBuy.
- `Product.price` es la **fuente de verdad** y la controla el administrador (`AGENTS.md`: *"el precio de venta nunca se pisa"*).
- Introducir precio por variante implicaría un nuevo modelo de precios y rompería esa regla. Queda **fuera de alcance** de esta iniciativa.

### 3.2 Por qué NO se muestra imagen por variante
- MasterShop entrega una sola imagen (`urlImageProduct`).
- Venndelo entrega `assets` a nivel producto, sin vínculo a la variación.
- Queda como mejora futura si algún proveedor lo expone.

---

## 4. Flujo de selección del usuario (paso a paso)

### 4.1 Producto con color + talla
1. **Detalle**: el usuario ve el precio, la descripción y dos selectores: **Color** (swatches con nombre) y **Talla** (pills).
2. **Selecciona color** (p. ej. `NEGRO`):
   - Se habilitan solo las tallas con variante disponible para ese color.
   - Las tallas sin variante o con `stock = 0` aparecen deshabilitadas con `aria-disabled` y texto "Agotado".
3. **Selecciona talla** (p. ej. `M`):
   - Se muestra el stock exacto: "Quedan 4 unidades".
   - Se muestra el SKU de la variante en la ficha ("Referencia: MS-12345-NEG-M").
   - El botón "Añadir al carrito" se habilita.
4. **Cantidad**: el tope es el stock de la variante seleccionada (no el stock total).
5. **Añadir**: se guarda `{ productId, size, color, quantity }`. La clave de línea incluye color y talla.
6. **Carrito**: cada línea muestra `Camiseta UPBUY · Talla M · Color NEGRO`, cantidad, precio unitario y subtotal.
7. **Checkout**: el resumen repite color + talla por ítem.
8. **Confirmar**: el pedido envía `size` y `color`; el backend los valida y persiste `shirtColor` + `variantId`.

### 4.2 Producto solo-color
- Se muestra **Color**; no hay selector de talla.
- Al elegir color, stock y disponibilidad se actualizan; el botón se habilita si `available` y `stock > 0`.
- Se guarda `{ productId, color, size: null, quantity }`.

### 4.3 Producto solo-talla
- Sin selector de color.
- Comportamiento actual: se elige talla y se valida stock por talla (usando `variants` si existen; si no, `product.stock`).

### 4.4 Producto manual sin variantes
- Sin formulario de color; talla si `sizes.length > 0`.
- Sin stock por variante; se usa `product.stock`.

### 4.5 Regla de habilitación del botón
```
canAdd =
  available &&
  (!requiresColor || color seleccionado) &&
  (!requiresSize || talla seleccionada) &&
  varianteSeleccionada.available &&
  varianteSeleccionada.stock > 0
```

---

## 5. Especificación del componente de color (`ColorSwatchPicker`)

### 5.1 Requisitos de accesibilidad (prioridad 1 según `Front/AGENTS.md`)
- **No depender solo del color**: cada swatch lleva el **nombre del color** visible o un `aria-label` explícito (`"Color: NEGRO"`).
- Touch target ≥ **44×44 px**.
- Navegación por teclado con `focus-visible` (anillo de foco).
- Estado seleccionado con `aria-pressed` y borde/contraste, no solo color.
- Respeto a `prefers-reduced-motion`.

### 5.2 Presentación
- Swatch circular o rectangular con el color de fondo.
- Si no hay código hex, usar un círculo neutro con borde y el nombre al lado (o debajo).
- Opción recomendada: **swatch + etiqueta de texto**, para no codificar información solo con color.
- Colores desconocidos (p. ej. "BRONCE", "AZUL MARINO"): swatch neutro con borde; nunca inventar un hex.

### 5.3 Props
```ts
type ColorOption = {
  value: string;      // "NEGRO"
  label: string;      // "Negro" (capitalización legible)
  available: boolean; // ¿alguna talla/stock para este color?
};

type ColorSwatchPickerProps = {
  options: ColorOption[];
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
};
```

### 5.4 Ubicación
- Dentro de `ProductPurchasePanel`, **antes** del selector de talla.
- El panel recibe `colors: string[]` y `variants: VariantPublic[]` desde la página de detalle.

### 5.5 Cambios en `ProductPurchasePanel`
- Props nuevas: `colors`, `variants`.
- Derivar `availableSizesForColor` y `selectedVariant` desde `variants`.
- `requiresColor = colors.length > 0`.
- `lineSize`/`lineColor` y `cartKey` con ambos.
- Mensajes: "Selecciona tu color", "Selecciona tu talla".

---

## 6. Especificación de carrito y resumen

### 6.1 `CartItem` (front)
```ts
export type CartItem = {
  productId: string;
  slug: string | null;
  name: string;
  price: number;
  image: string | null;
  size: string | null;
  color: string | null;   // NUEVO
  quantity: number;
  requiresSize: boolean;
  requiresColor: boolean; // NUEVO (opcional, para validar)
  stock: number;
};
```

### 6.2 Clave de línea
```ts
export const cartKey = (item) =>
  `${item.productId}::${item.size ?? ""}::${item.color ?? ""}`;
```
> Esto separa "Negro/M" de "Azul/M" y evita la fusión detectada en la Fase 2.

### 6.3 `sanitize` (localStorage `upbuy.cart.v1`)
- Aceptar `color` y `requiresColor` en la reconstrucción.
- Recomendación: subir la clave a `upbuy.cart.v2` **solo si** se quiere invalidar carritos viejos; si no, `sanitize` tolera `color: null` en items antiguos.

### 6.4 Texto en carrito y checkout
- Carrito (`CartView`): `Talla {size} · Color {color}` (omitir las partes nulas).
- Checkout (`CheckoutClient`): misma línea en el resumen.
- Clave de render: `productId-size-color`.
- Pedido (`pedido/[id]`): `Talla {size} · Color {color}`.

### 6.5 `CreateOrderItem`
```ts
export type CreateOrderItem = {
  productId: string;
  quantity: number;
  size?: string | null;
  color?: string | null;   // NUEVO
};
```

---

## 7. Contrato hacia el backend (resumen para la Fase 5)

`POST /api/orders` recibirá por ítem:
```json
{ "productId": "...", "quantity": 1, "size": "M", "color": "NEGRO" }
```

El backend (`pricing.resolveProduct`) deberá:
1. Cargar `Product` y sus `SupplierProductVariation`.
2. Resolver la variante por `{ size, color }` (con canonicalización).
3. Validar `available` y `stock` de la variante.
4. Persistir en `OrderItem`: `size`, `shirtColor = color`, `variantId = variación.id`, `providerSku = variación.sku`.
5. Rechazar con **400/409** si la combinación no existe o está agotada.

`resolveOrderItem` (MasterShop) ya usará `wanted = { size, color }` y dejará de devolver `ambiguous`.

---

## 8. Criterios de aceptación — verificación

| Criterio | Resultado | Definición |
|----------|-----------|------------|
| Se define el campo exacto a añadir al JSON público | ✅ | `colors: string[]` (listado y detalle) + `variants: VariantPublic[]` (solo detalle) |
| Se define el componente de selección de color | ✅ | `ColorSwatchPicker` con swatch + etiqueta, accesible, ≥44px, `aria-pressed` |
| Se define cómo se muestra el stock por combinación | ✅ | Stock exacto de la variante seleccionada; tallas no disponibles deshabilitadas |
| Se define qué se muestra en carrito y resumen | ✅ | `Talla {size} · Color {color}` en carrito, checkout y pedido |

---

## 9. Conclusión de la Fase 4

1. El contrato se cierra con **`colors` (ligero, listado) + `variants` (completo, detalle)**.
2. Se requiere **`Product.colors`** denormalizado y **canonicalizar Venndelo** para que `size`/`color` sean uniformes.
3. El precio y la imagen **no** se exponen por variante: respetan la regla de negocio y la limitación de los proveedores.
4. La selección envía `{ size, color }`; el carrito separa líneas por color y el resumen lo muestra.
5. La Fase 5 debe implementar la resolución de variante en `pricing.js` y completar el flujo a MasterShop/Venndelo.

### Insumo para la Fase 5

Implementar el pedido concreto con `{ size, color }`: `pricing.resolveProduct` → `OrderItem.shirtColor`/`variantId` → `resolveOrderItem` sin ambigüedad → payload MasterShop con `id_variant`; y definir el `line_items` de Venndelo.
