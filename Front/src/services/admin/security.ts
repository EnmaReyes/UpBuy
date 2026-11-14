import { serverFetch } from "@/services/api/server";
import type { AdminSecurityOverview, AdminSessionInfo } from "@/types/admin";

// Seguridad de la propia cuenta administrativa (ADM-S2 / ADM-S3).
//
// Este módulo es SOLO para Server Components: usa `next/headers` para reenviar
// la cookie. Las mutaciones viven en `security.actions.ts`, que se importa
// desde componentes cliente.

export async function getSecurityOverview(): Promise<AdminSecurityOverview> {
  return serverFetch<AdminSecurityOverview>("/api/admin/admins/security");
}

export async function getAdminSessions(): Promise<AdminSessionInfo[]> {
  const data = await serverFetch<{ sessions: AdminSessionInfo[] }>(
    "/api/admin/admins/sessions",
  );
  return data.sessions;
}
