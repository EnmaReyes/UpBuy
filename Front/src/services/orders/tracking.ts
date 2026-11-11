import { apiFetch } from "@/services/api/client";
import type { PublicTracking } from "@/types/tracking";

// Lectura pública: no envía cookies. Basta con el UUID del pedido y el
// teléfono o el correo del comprador. El backend responde 404 genérico si
// no coinciden, para no revelar si el pedido existe.

export async function getPublicTracking(
  id: string,
  credentials: { phone?: string; email?: string },
): Promise<PublicTracking> {
  return apiFetch<PublicTracking>(
    `/api/orders/${encodeURIComponent(id)}/tracking`,
    {
      query: { phone: credentials.phone, email: credentials.email },
      revalidate: 0,
    },
  );
}
