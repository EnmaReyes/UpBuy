import { apiGet, apiSend } from "@/services/api/client";
import type {
  AdminCatalogSearch,
  AdminImportDryRun,
  AdminImportResult,
  AdminManualOrderPayload,
  AdminOrder,
  AdminOrderPreview,
} from "@/types/admin";

// Mutaciones del panel de pedidos (client). Todas envían la cookie de sesión y
// la cabecera CSRF que exige `apiSend`.

export type AdminStatusPayload = {
  status: string;
  note?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  pushToProvider?: boolean;
};

export type AdminSyncResult = {
  orderId?: string;
  ok?: boolean;
  unchanged?: boolean;
  skipped?: string;
  error?: string;
};

export type AdminPushResult = {
  pushed?: boolean;
  status?: string;
  reason?: string;
  outOfSync?: boolean;
};

export type AdminPaymentPayload = {
  status?: string;
  paymentMethodType?: string;
  statusMessage?: string;
  failureCode?: string;
  note?: string;
};

export async function changeAdminOrderStatus(
  id: string,
  payload: AdminStatusPayload,
): Promise<AdminOrder> {
  return apiSend<AdminOrder>(
    `/api/admin/orders/${encodeURIComponent(id)}/status`,
    { method: "PATCH", body: payload },
  );
}

export async function updateAdminOrderTracking(
  id: string,
  payload: { trackingCarrier?: string | null; trackingNumber?: string | null },
): Promise<AdminOrder> {
  return apiSend<AdminOrder>(
    `/api/admin/orders/${encodeURIComponent(id)}/tracking`,
    { method: "PATCH", body: payload },
  );
}

export async function syncAdminOrder(id: string): Promise<AdminSyncResult> {
  return apiSend<AdminSyncResult>(
    `/api/admin/orders/${encodeURIComponent(id)}/sync`,
    { method: "POST" },
  );
}

export async function pushAdminOrder(id: string): Promise<AdminPushResult> {
  return apiSend<AdminPushResult>(
    `/api/admin/orders/${encodeURIComponent(id)}/push`,
    { method: "POST" },
  );
}

export async function registerAdminOrderPayment(
  id: string,
  payload: AdminPaymentPayload,
): Promise<AdminOrder> {
  return apiSend<AdminOrder>(
    `/api/admin/orders/${encodeURIComponent(id)}/payments`,
    { method: "POST", body: { status: "aprobado", ...payload } },
  );
}

export async function changeAdminOrderPayment(
  id: string,
  paymentId: string,
  payload: AdminPaymentPayload,
): Promise<AdminOrder> {
  return apiSend<AdminOrder>(
    `/api/admin/orders/${encodeURIComponent(id)}/payments/${encodeURIComponent(paymentId)}`,
    { method: "PATCH", body: payload },
  );
}

// ---------------------------------------------------------------------------
// Ventas manuales e importación CSV (ADM-3)
// ---------------------------------------------------------------------------

/** Busca productos del catálogo para armar una venta manual. */
export async function searchAdminCatalog(
  q: string,
): Promise<AdminCatalogSearch> {
  return apiGet<AdminCatalogSearch>("/api/admin/products", {
    query: { q, limit: 20 },
  });
}

/** El backend calcula el total: el navegador nunca lo inventa. */
export async function previewManualOrder(
  payload: {
    items: AdminManualOrderPayload["items"];
    discount?: number;
    deliveryType: "envio" | "pickup";
  },
): Promise<AdminOrderPreview> {
  return apiSend<AdminOrderPreview>("/api/admin/orders/manual/preview", {
    body: payload,
  });
}

/** Registra una venta manual (presencial, WhatsApp, etc.). */
export async function createManualOrder(
  payload: AdminManualOrderPayload,
): Promise<AdminOrder> {
  return apiSend<AdminOrder>("/api/admin/orders/manual", { body: payload });
}

/** Analiza el archivo CSV sin escribir nada (vista previa). */
export async function dryRunImportCsv(csv: string): Promise<AdminImportDryRun> {
  return apiSend<AdminImportDryRun>("/api/admin/orders/import?dryRun=1", {
    text: csv,
    contentType: "text/csv; charset=utf-8",
  });
}

/** Importa el archivo CSV de verdad. */
export async function importOrdersCsv(csv: string): Promise<AdminImportResult> {
  return apiSend<AdminImportResult>("/api/admin/orders/import", {
    text: csv,
    contentType: "text/csv; charset=utf-8",
  });
}
