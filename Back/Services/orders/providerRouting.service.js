// Enrutamiento de un pedido web al proveedor que debe cumplirlo.
//
// Regla conservadora (Fase 6):
//   - Todos los items deben ser del MISMO proveedor integrado.
//   - `mastershop` -> outbox de MasterShop.
//   - `venndelo`   -> outbox de Venndelo.
//   - Pedido mixto, item manual o proveedor sin integracion de pedidos ->
//     no se envia automaticamente: queda para revision. Nunca se crea un
//     pedido parcial ni se elige un proveedor "por mayoria".
//
// La fuente del proveedor es la relacion real del catalogo:
//   order_items.supplierProductId -> supplier_products.supplierId -> suppliers.slug
// con respaldo en product_snapshot y en el producto publicado.
const {
  Product,
  Supplier,
  SupplierProduct,
} = require("../../DataBase/models/index.js");
const { SUPPLIER_SLUG } = require("../../DataBase/models/enums.js");

const SUPPORTED = new Set([SUPPLIER_SLUG.MASTERSHOP, SUPPLIER_SLUG.VENNDELO]);

const slugOf = (value) => {
  const slug = String(value || "").trim().toLowerCase();
  return slug || null;
};

const resolveSupplierProductSlug = async (supplierProductId, cache) => {
  const id = String(supplierProductId || "").trim();
  if (!id) return null;
  if (cache.supplierProductSlug.has(id)) {
    return cache.supplierProductSlug.get(id);
  }

  const supplierProduct = await SupplierProduct.findByPk(id, {
    attributes: ["id", "supplierId"],
  });
  let slug = null;

  if (supplierProduct?.supplierId) {
    if (cache.supplierSlug.has(supplierProduct.supplierId)) {
      slug = cache.supplierSlug.get(supplierProduct.supplierId);
    } else {
      const supplier = await Supplier.findByPk(supplierProduct.supplierId, {
        attributes: ["id", "slug"],
      });
      slug = slugOf(supplier?.slug);
      cache.supplierSlug.set(supplierProduct.supplierId, slug);
    }
  }

  cache.supplierProductSlug.set(id, slug);
  return slug;
};

const resolveItemProviderSlug = async (item, cache) => {
  if (!item) return null;

  // 1. Columna explicita de la linea (la llena pricing.js).
  let slug = await resolveSupplierProductSlug(item.supplierProductId, cache);
  if (slug) return slug;

  // 2. Snapshot congelado del producto.
  slug = await resolveSupplierProductSlug(
    item.productSnapshot?.supplierProductId,
    cache,
  );
  if (slug) return slug;

  // 3. Producto publicado vivo.
  if (item.productId) {
    if (cache.productSlug.has(item.productId)) {
      slug = cache.productSlug.get(item.productId);
    } else {
      const product = await Product.findByPk(item.productId, {
        attributes: ["id", "supplierProductId", "supplierId", "provider"],
      });
      if (product) {
        slug = await resolveSupplierProductSlug(
          product.supplierProductId,
          cache,
        );
        if (!slug && product.supplierId) {
          if (cache.supplierSlug.has(product.supplierId)) {
            slug = cache.supplierSlug.get(product.supplierId);
          } else {
            const supplier = await Supplier.findByPk(product.supplierId, {
              attributes: ["id", "slug"],
            });
            slug = slugOf(supplier?.slug);
            cache.supplierSlug.set(product.supplierId, slug);
          }
        }
        if (!slug) slug = slugOf(product.provider);
      }
      cache.productSlug.set(item.productId, slug);
    }
    if (slug) return slug;
  }

  // 4. Ultimo respaldo: el provider del snapshot.
  return slugOf(item.productSnapshot?.provider);
};

// Devuelve { ok, provider, reason, providers?, itemId? }.
const resolveOrderProvider = async (items) => {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    return { ok: false, reason: "sin_items" };
  }

  const cache = {
    supplierProductSlug: new Map(),
    supplierSlug: new Map(),
    productSlug: new Map(),
  };

  const providers = new Set();
  for (const item of list) {
    const slug = await resolveItemProviderSlug(item, cache);
    if (!slug) {
      return { ok: false, reason: "item_sin_proveedor", itemId: item.id || null };
    }
    providers.add(slug);
  }

  if (providers.size > 1) {
    return {
      ok: false,
      reason: "pedido_mixto",
      providers: [...providers],
    };
  }

  const [provider] = [...providers];
  if (!SUPPORTED.has(provider)) {
    return { ok: false, reason: "proveedor_no_soportado", provider };
  }

  return { ok: true, provider, reason: "resuelto" };
};

module.exports = {
  SUPPORTED_PROVIDERS: SUPPORTED,
  resolveItemProviderSlug,
  resolveOrderProvider,
};