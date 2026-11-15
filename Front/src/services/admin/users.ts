import { serverFetch } from "@/services/api/server";
import type {
  AdminClientDetail,
  AdminClientListResult,
  AdminClientOrdersResult,
} from "@/types/admin";

// Lecturas de clientes (ADM-9) desde el servidor. Reenvían la cookie y no se
// cachean: el operador necesita el estado real en cada carga.

export type AdminClientListQuery = {
  q?: string;
  segment?: string;
  consent?: string;
  registeredFrom?: string;
  registeredTo?: string;
  limit?: number;
  offset?: number;
};

export async function listAdminClients(
  query: AdminClientListQuery = {},
): Promise<AdminClientListResult> {
  return serverFetch<AdminClientListResult>("/api/admin/users", { query });
}

export async function getAdminClient(id: string): Promise<AdminClientDetail> {
  return serverFetch<AdminClientDetail>(
    `/api/admin/users/${encodeURIComponent(id)}`,
  );
}

export async function getAdminClientOrders(
  id: string,
  query: { limit?: number; offset?: number } = {},
): Promise<AdminClientOrdersResult> {
  return serverFetch<AdminClientOrdersResult>(
    `/api/admin/users/${encodeURIComponent(id)}/orders`,
    { query },
  );
}

/** URL del CSV de clientes (descarga con cookie del panel). */
export function adminClientsCsvUrl(): string {
  // Relativa a propósito: pasa por el proxy same-origin del front
  // (next.config.ts) y la cookie de sesión viaja first-party.
  return "/api/admin/users/export.csv";
}
