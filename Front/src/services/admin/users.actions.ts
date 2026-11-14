import { apiSend } from "@/services/api/client";
import type { UpdateClientResult } from "@/types/admin";

// Mutaciones de clientes (ADM-9). Van con cookie y `X-Upbuy-CSRF` vía
// `apiSend`; el backend revalida sesión, permiso y step-up (solo `disabled`).
// El backend ignora rol, admin y password: no se pueden tocar desde aquí.

export async function updateAdminClient(
  id: string,
  payload: {
    name?: string | null;
    lastName?: string | null;
    phone?: string | null;
    address?: string | null;
    marketingOptIn?: boolean;
    whatsappOptIn?: boolean;
    disabled?: boolean;
  },
): Promise<UpdateClientResult> {
  return apiSend<UpdateClientResult>(
    `/api/admin/users/${encodeURIComponent(id)}`,
    { method: "PATCH", body: payload },
  );
}
