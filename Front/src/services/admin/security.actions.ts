import { apiSend } from "@/services/api/client";

// Mutaciones de seguridad de la propia cuenta (cliente). Las lecturas viven en
// `security.ts` (solo servidor). Todas envían cookie y `X-Upbuy-CSRF` vía
// `apiSend`; el backend vuelve a validar sesión y step-up.

export type RevokeSessionResult = {
  revoked: boolean;
  /** `true` si se cerró la sesión desde la que se hizo la petición. */
  current: boolean;
};

export async function revokeAdminSession(
  id: string,
): Promise<RevokeSessionResult> {
  return apiSend<RevokeSessionResult>(
    `/api/admin/admins/sessions/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

/** Cierra todas las sesiones, incluida la actual (204 + cookie limpia). */
export async function revokeAllAdminSessions(): Promise<void> {
  await apiSend<void>("/api/admin/admins/sessions/revoke-all", {
    method: "POST",
  });
}

export type RegeneratedBackupCodes = {
  backupCodes: string[];
  count: number;
};

/** Invalida los códigos anteriores y devuelve los nuevos (una sola vez). */
export async function regenerateBackupCodes(): Promise<RegeneratedBackupCodes> {
  return apiSend<RegeneratedBackupCodes>(
    "/api/admin/admins/security/backup-codes",
    { method: "POST" },
  );
}
