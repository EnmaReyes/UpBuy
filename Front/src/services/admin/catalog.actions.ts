import { apiGet, apiSend } from "@/services/api/client";
import type {
  AdminCategory,
  AdminHomeSectionKey,
  AdminProduct,
  AdminProductBulkAction,
  AdminProductBulkResult,
  AdminProductCreatePayload,
  AdminSupplierTrayResult,
  AdminSupplierTraySettings,
} from "@/types/admin";

// Mutaciones de curaduria del catalogo. Todas pasan por `apiSend`, que anade
// la cookie de sesion y la cabecera CSRF; el backend revalida permiso y
// step-up en cada llamada.

export type UpdateAdminProductPayload = {
  name?: string;
  description?: string | null;
  price?: number;
  compareAtPrice?: number | null;
  descuentoPorcentaje?: number | null;
  destacadas?: boolean;
  categoryIds?: string[];
  promotionVideos?: string[];
};

export async function updateAdminProduct(
  id: string,
  payload: UpdateAdminProductPayload,
): Promise<AdminProduct> {
  return apiSend<AdminProduct>(`/api/admin/products/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function createAdminProduct(
  payload: AdminProductCreatePayload,
): Promise<AdminProduct> {
  return apiSend<AdminProduct>("/api/admin/products", {
    method: "POST",
    body: payload,
  });
}

/** Busca articulos originales de los proveedores para el alta asistida. */
export async function searchSupplierProducts(query: {
  q?: string;
  provider?: string;
  page?: number;
}): Promise<AdminSupplierTrayResult> {
  return apiGet<AdminSupplierTrayResult>("/api/admin/products/supplier-products", {
    query: {
      q: query.q || undefined,
      provider: query.provider || undefined,
      page: query.page ?? 1,
      limit: 12,
    },
  });
}

export async function setAdminProductVisibility(
  id: string,
  visible: boolean,
): Promise<AdminProduct> {
  return apiSend<AdminProduct>(
    `/api/admin/products/${encodeURIComponent(id)}/visibility`,
    { body: { visible } },
  );
}

export async function bulkAdminProducts(
  ids: string[],
  action: AdminProductBulkAction,
  payload: Record<string, unknown> = {},
): Promise<AdminProductBulkResult> {
  return apiSend<AdminProductBulkResult>("/api/admin/products/bulk", {
    body: { ids, action, payload },
  });
}

export async function setAdminProductImages(
  id: string,
  urls: string[],
): Promise<AdminProduct> {
  return apiSend<AdminProduct>(
    `/api/admin/products/${encodeURIComponent(id)}/images`,
    {
      method: "PUT",
      body: { images: urls.map((url) => ({ url })) },
    },
  );
}

export async function restoreAdminProductImages(
  id: string,
): Promise<AdminProduct> {
  return apiSend<AdminProduct>(
    `/api/admin/products/${encodeURIComponent(id)}/images/restore`,
    { body: {} },
  );
}

/**
 * Reemplaza el orden completo de una seccion de la portada. El backend valida
 * el permiso `catalog.write` y devuelve la seccion con los ids aplicados.
 */
export async function saveAdminHomeSection(
  section: AdminHomeSectionKey,
  productIds: string[],
): Promise<{ section: AdminHomeSectionKey; productIds: string[] }> {
  return apiSend(`/api/admin/products/home-sections/${section}`, {
    method: "PUT",
    body: { productIds },
  });
}

/** Crea una categoria interna. Pensado para el alta rapida desde la ficha. */
export async function createAdminCategory(payload: {
  name: string;
  description?: string;
  sortOrder?: number;
}): Promise<AdminCategory> {
  return apiSend<AdminCategory>("/api/admin/categories", { body: payload });
}

export async function publishSupplierTrayProducts(
  slug: string,
  productIds: string[],
  options: { visibility?: "draft" | "visible"; markup?: number } = {},
): Promise<AdminProductBulkResult> {
  return apiSend<AdminProductBulkResult>(
    `/api/admin/suppliers/${encodeURIComponent(slug)}/products/publish-bulk`,
    {
      body: {
        productIds,
        visibility: options.visibility ?? "draft",
        ...(options.markup === undefined ? {} : { markup: options.markup }),
      },
    },
  );
}

export async function updateSupplierCatalogSettings(
  slug: string,
  payload: Partial<
    Pick<AdminSupplierTraySettings, "publishPolicy" | "defaultCategoryId">
  >,
): Promise<AdminSupplierTraySettings> {
  return apiSend<AdminSupplierTraySettings>(
    `/api/admin/suppliers/${encodeURIComponent(slug)}/settings`,
    { method: "PATCH", body: payload },
  );
}
