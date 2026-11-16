import { serverFetch } from "@/services/api/server";
import type {
  AdminCatalogFilters,
  AdminCatalogSupplierStatus,
  AdminCategoryList,
  AdminHomeSections,
  AdminProduct,
  AdminProductListResult,
  AdminSupplierTrayFilters,
  AdminSupplierTrayResult,
  AdminSupplierTraySettings,
} from "@/types/admin";

// Lecturas server-side del catalogo UPBUY. Reenvian la cookie del admin y no
// se cachean: el operador necesita ver el estado real de la curaduria.

export async function listAdminProducts(
  filters: AdminCatalogFilters,
  pagination: { limit: number; offset: number },
): Promise<AdminProductListResult> {
  return serverFetch<AdminProductListResult>("/api/admin/products", {
    query: {
      q: filters.q || undefined,
      status: filters.status || undefined,
      visibility: filters.visibility || undefined,
      stock: filters.stock || undefined,
      hasCategory: filters.hasCategory || undefined,
      published: filters.published || undefined,
      provider: filters.provider || undefined,
      limit: pagination.limit,
      offset: pagination.offset,
    },
  });
}

export async function getAdminProduct(id: string): Promise<AdminProduct> {
  return serverFetch<AdminProduct>(
    `/api/admin/products/${encodeURIComponent(id)}`,
  );
}

export async function listAdminCategories(): Promise<AdminCategoryList> {
  return serverFetch<AdminCategoryList>("/api/admin/categories");
}

/** Curaduria de las tres secciones de la portada y el ranking de ventas. */
export async function getAdminHomeSections(): Promise<AdminHomeSections> {
  return serverFetch<AdminHomeSections>("/api/admin/products/home-sections");
}

/** Productos importados de cualquier proveedor que aun no estan publicados. */
export async function listUnpublishedCatalog(
  filters: AdminSupplierTrayFilters,
  pagination: { page: number; limit: number },
): Promise<AdminSupplierTrayResult> {
  return serverFetch<AdminSupplierTrayResult>(
    "/api/admin/products/unpublished",
    {
      query: {
        q: filters.q || undefined,
        availability: filters.availability || undefined,
        provider: filters.provider || undefined,
        page: pagination.page,
        limit: pagination.limit,
      },
    },
  );
}

/** Politica de publicacion y categoria por defecto del proveedor. */
export async function getSupplierCatalogSettings(
  slug: string,
): Promise<AdminSupplierTraySettings> {
  const status = await serverFetch<AdminCatalogSupplierStatus>(
    `/api/admin/suppliers/${encodeURIComponent(slug)}/status`,
  );

  return {
    slug: status.supplier?.slug ?? slug,
    publishPolicy: status.supplier?.publishPolicy ?? "manual",
    defaultCategoryId: status.supplier?.defaultCategoryId ?? null,
  };
}
