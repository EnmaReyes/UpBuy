# Fase 1 — Análisis de la estructura del JSON de productos (GET)

**Fecha:** 2026-11-25
**Alcance:** contrato público de productos (`GET /api/products` y `GET /api/products/:slug`) y trazabilidad de variantes desde Venndelo y MasterShop.
**Estado:** completada.

---

## 1. Endpoints y flujo de lectura

| Método | Ruta | Controller | Servicio | Respuesta |
|--------|------|------------|----------|-----------|
| `GET` | `/api/products` | `list` — `Back/Controllers/catalog.controller.js:6` | `catalog.listPublished` — `Back/Services/catalog/catalogQuery.service.js:73` | `{ products: PublicProduct[], total, limit, offset }` |
| `GET` | `/api/products/:slug` | `detail` — `Back/Controllers/catalog.controller.js:26` | `catalog.getBySlugOrSku` — `catalogQuery.service.js:139` | `PublicProduct` (objeto único) |

- Las rutas se montan en `Back/Rutas/products.js:7-8`.
- El detalle acepta **slug, SKU o id (UUID)**: `getBySlugOrSku` arma `[{ slug }, { sku }]` y agrega `{ id }` si el valor es UUID.
- Solo se devuelven productos `status = active` y `active = true` (público).
- Ambos endpoints usan la misma función `publicShape()` (`catalogQuery.service.js:30-62`), por lo que el contrato del listado y del detalle es **idéntico por producto**.

---

## 2. Contrato del JSON público (campos reales)

### 2.1 Ejemplo de `GET /api/products/:slug`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "sku": "MS-12345",
  "slug": "camiseta-negra-12345",
  "name": "Camiseta negra UPBUY",
  "description": "Camiseta 100% algodón.",
  "images": [
    "https://cdn.proveedor.com/img/camiseta-negra-1.jpg",
    "https://cdn.proveedor.com/img/camiseta-negra-2.jpg"
  ],
  "promotionVideos": [],
  "price": 45000,
  "priceBase": 50000,
  "compareAtPrice": 60000,
  "discountPercent": 10,
  "currency": "COP",
  "stock": 12,
  "available": true,
  "sizes": ["S", "M", "L", "XL"],
  "combo": false,
  "featured": false,
  "categories": [
    { "id": "c1...", "name": "Camisetas", "slug": "camisetas" }
  ],
  "createdAt": "2026-11-01T10:00:00.000Z"
}
```

> Los valores son ilustrativos; los nombres y tipos de campo son exactos según `publicShape()`.

### 2.2 Lista de campos que **sí** vienen

| Campo | Tipo | Origen | Nota |
|-------|------|--------|------|
| `id` | UUID | `Product.id` | Clave interna |
| `sku` | string | `Product.sku` | SKU propio de UpBuy |
| `slug` | string \| null | `Product.slug` | URL pública |
| `name` | string | `Product.name` | |
| `description` | string \| null | `Product.description` | |
| `images` | string[] | `Product.images` (JSONB) | Cache denormalizada de `product_images` |
| `promotionVideos` | string[] | `Product.promotionVideos` | |
| `price` | number | `aplicarDescuento(Product.price, descuentoPorcentaje)` | Precio **final** con descuento |
| `priceBase` | number | mismo cálculo | Precio antes del descuento |
| `compareAtPrice` | number \| null | `Product.compareAtPrice` | Precio tachado |
| `discountPercent` | number | `aplicarDescuento(...)` | 0–100 |
| `currency` | string | `Product.currency` ("COP") | |
| `stock` | number | `Product.stock` | **Total del producto**, no por variante |
| `available` | boolean | `active && stock > 0` | |
| `sizes` | string[] | `Product.sizes` (JSONB) | Derivado de variaciones, **solo tallas** |
| `combo` | boolean | `Product.combo` | |
| `featured` | boolean | `Product.destacadas` | |
| `categories` | `{id,name,slug}[]` | relación `categories` | |
| `createdAt` | string (ISO) | `Product.createdAt` | |

### 2.3 Campos internos del modelo que **no** se exponen

`publicShape()` omite deliberadamente: `cost`, `markup`, `provider`, `providerSku`, `manualOverrides`, `status`, `active`, `uid`, `supplierId`, `supplierProductId`, `publishedAt`, `updatedAt`, `descuentoPorcentaje`, `destacadas` (se mapea a `featured`), `sizes` crudo (se mapea).

---

## 3. Campos que **faltan** para representar variantes

El JSON público **no incluye ningún campo de variante más allá de `sizes`**. Faltan, como mínimo:

| Campo faltante | Para qué sirve | Fuente disponible en backend |
|----------------|----------------|------------------------------|
| `colors: string[]` | Mostrar selector de color en el detalle | `SupplierProductVariation.attributes.color` |
| `variants[]` | Representar combinación color×talla con stock/precio/SKU | `supplier_product_variations` |
| `variant.id` / `externalId` | Enviar `id_variant` exacto a MasterShop | `SupplierProductVariation.externalId` |
| `variant.stock` / `quantity` | Mostrar disponibilidad real por combinación | `SupplierProductVariation.quantity` |
| `variant.sku` | Trazabilidad y soporte | `SupplierProductVariation.sku` |
| `variant.price` | Precio por variante (si difiere) | `SupplierProductVariation.originalPrice` |
| `variant.available` | Deshabilitar combinaciones agotadas | `SupplierProductVariation.available` |
| `variant.image` (opcional) | Imagen por color | `SupplierProductAsset` (por producto, no por variante hoy) |

**Confirmación clave:** el campo `color` **no existe** hoy en el JSON público. El único atributo de variante expuesto es `sizes`, y viene **sin color asociado**.

---

## 4. De dónde salen las `sizes` y las variaciones

### 4.1 Persistencia

1. El proveedor se importa con `catalogImport.service.js`.
2. `syncVariations()` guarda cada variación en `supplier_product_variations` con `attributes` (JSONB), `quantity`, `originalPrice`, `sku`, `externalId`, `available`, `rawData` (`catalogImport.service.js:48-104`).
3. Al publicar/sincronizar, `catalogSync.service.js` escribe `Product.sizes` = `helpers.productSizes(variations)` (`líneas 148 y 394`).
4. `Product.stock` = `supplierProduct.totalQuantity` (suma de unidades de variaciones).

> Conclusión: el backend **sí tiene** talla y color por variación en `supplier_product_variations.attributes`, pero `publicShape()` no los lee ni los expone.

### 4.2 Derivación de `sizes` por proveedor

| Proveedor | Función usada | Regla | Riesgo |
|-----------|---------------|-------|--------|
| **MasterShop** | `sizesOf()` en `mastershop.attributes.js:123` | Solo `variation.attributes.size`, ignora `isDefault` y `isEnabled === false` | Correcto: el color **no** se confunde con talla |
| **Venndelo** | `productSizes()` en `productIdentity.service.js:78` | `attrs.size ?? attrs.talla ?? Object.values(attrs)[0]` | ⚠️ **Riesgo**: las claves de Venndelo son los `code` crudos (p. ej. `TALLA`, `COLOR`) sin canonicalizar; la comparación es *case-sensitive*, así que `TALLA` no coincide con `size`/`talla` y el fallback `Object.values(attrs)[0]` puede tomar el **color** como si fuera talla |

> ⚠️ Este hallazgo de Venndelo debe confirmarse con un JSON real de la API. Si los `code` vienen en mayúsculas (`TALLA`, `COLOR`), el `sizes` público puede contener colores. Es independiente de la Fase 2, pero afecta la calidad del dato.

---

## 5. Tabla de mapeo: atributo proveedor → normalizado → persistido → expuesto

### Venndelo

| Campo crudo | Normalizado | Persistido | ¿Expuesto en JSON público? |
|-------------|-------------|------------|----------------------------|
| `variations[].option[{code,value}]` | `attributes: { [code]: value }` — **código crudo**, sin canonicalizar | `supplier_product_variations.attributes` | ❌ No |
| `variations[].quantity` | `quantity` | `quantity` | ❌ No (solo `Product.stock` agregado) |
| `variations[].price` | `originalPrice` | `originalPrice` | ❌ No (solo `Product.price` comercial) |
| `variations[].compare_at_price` | `compareAtPrice` | `compareAtPrice` | ❌ No |
| `variations[].supplier_price` | `supplierPrice` | `supplierPrice` | ❌ No (interno) |
| `variations[].sku` | `sku` | `sku` | ❌ No (salvo `providerSku` interno) |
| `variations[].id` | `externalId` | `externalId` | ❌ No |
| `options[{code,label}]` (nivel producto) | `options` | No se persiste como columna; queda en `SupplierProduct.rawData` | ❌ No |
| `assets[]` | `assets[]` | `supplier_product_assets` + `Product.images` | ✅ Parcial (`images`) |
| `processing_time` | `processingTime` | `processingTime` | ❌ No |

> Nota: Venndelo **no** mapea a claves canónicas `size`/`color`; usa el `code` tal cual. MasterShop sí canonicaliza.

### MasterShop

| Campo crudo | Normalizado | Persistido | ¿Expuesto en JSON público? |
|-------------|-------------|------------|----------------------------|
| `variation[].options[{propertyName,nameValue}]` | `attributes: { size, color }` (canónico; claves desconocidas → minúsculas estables) | `supplier_product_variations.attributes` | ❌ No |
| `variation[].stock` | `quantity` | `quantity` | ❌ No (solo `Product.stock` agregado) |
| `variation[].price` | `originalPrice` / `supplierPrice` | ambos | ❌ No |
| `variation[].idVariant` | `externalId` | `externalId` | ❌ No (**es el `id_variant` del pedido**) |
| `variation[].sku` | `sku` | `sku` | ❌ No |
| `variation[].weight` / `weightUnit` | `weight` / `weightUnit` | solo en `rawData` (no columnas) | ❌ No |
| `variation[].isEnable` | `isEnabled` + `available` | solo `available` | ❌ No |
| `variation[].options` (Default Variant) | Se **descarta** (`isDefault`) | — | — |
| `product.urlImageProduct` | `assets[0]` | `supplier_product_assets` + `Product.images` | ✅ Parcial (`images`) |
| `product.stockTotal` | `totalQuantity` | `totalQuantity` | ❌ No (solo agregado) |

### Reglas de descarte / conservación

- **Se conserva:** todo `attributes` de la variación (talla, color y claves desconocidas), `quantity`, `price`, `sku`, `externalId`, `rawData`.
- **Se descarta:** la "Default Variant" de MasterShop (`isDefault = true`); variaciones con `isEnable = 0` (quedan con `available = false`); en Venndelo, `options` de nivel producto solo sobrevive en `rawData`.
- **Se agrega:** `Product.stock` y `Product.sizes` (denormalizados para lectura rápida).

---

## 6. Criterios de aceptación — verificación

| Criterio | Resultado | Evidencia |
|----------|-----------|-----------|
| Se identifica que `color` NO está en el JSON público | ✅ Cumplido | `publicShape()` (`catalogQuery.service.js:37-61`) no incluye `color`/`colors`/`variants` |
| Se confirma que `sizes` sí viene, pero sin color asociado | ✅ Cumplido | `publicShape()` línea 52: `sizes: toArray(json.sizes)`; `Product.sizes` es solo un arreglo de strings |
| Se documenta de dónde vienen las variaciones en Venndelo y MasterShop | ✅ Cumplido | Sección 4 y 5 de este documento |

---

## 7. Conclusión de la Fase 1

1. El contrato público de productos está concentrado en **`publicShape()`** y expone 18 campos; **ninguno representa color ni variantes**.
2. La información de variantes **existe** en `supplier_product_variations.attributes` (talla y color), pero **no fluye** al JSON público, al carrito ni al checkout.
3. MasterShop canonicaliza atributos a `size`/`color`; Venndelo conserva el `code` crudo, con un riesgo de confundir color con talla en `productSizes()`.
4. `Product.stock` y `Product.sizes` son agregados del producto; **no hay stock ni SKU por variante** en la respuesta pública.

### Insumo para la Fase 2

La Fase 2 debe comparar este contrato con:
- `Front/src/types/catalog.ts` (`PublicProduct`)
- `Front/src/components/products/ProductPurchasePanel.tsx`
- `Front/src/context/cart-context.tsx`
- `Front/src/components/checkout/CheckoutClient.tsx`
- `Front/src/app/(store)/pedido/[id]/page.tsx`

El gap esperado: agregar `colors`/`variants` al JSON público y propagar `color` hasta el pedido.

---

## 8. Preguntas abiertas (por confirmar antes de implementar)

1. ¿La API real de Venndelo envía los `code` de opción en mayúsculas (`TALLA`, `COLOR`) o en minúsculas (`size`, `color`)? Esto define si `productSizes()` está tomando colores como tallas.
2. ¿MasterShop expone imagen por variación? Hoy solo se mapea `urlImageProduct` (una imagen por producto).
3. ¿Se debe exponer `variants[]` completo o solo `colors: string[]` + stock agregado por talla en la Fase 4?
