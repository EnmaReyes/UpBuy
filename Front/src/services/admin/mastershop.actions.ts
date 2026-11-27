import { apiSend } from "@/services/api/client";

// Reintento de un pedido de MasterShop desde el panel. Segun el estado del
// pedido, el backend reintenta la creacion o la cancelacion. No exige step-up:
// no mueve dinero ni cambia el estado local del pedido.

export type MastershopRetryResult = {
  ok?: boolean;
  action?: "create" | "cancel" | "none";
  reason?: string;
  orderId?: string;
  idOrder?: number | null;
  retryable?: boolean;
  skipped?: boolean;
  error?: string;
};

export async function retryMastershopOrder(
  id: string,
): Promise<MastershopRetryResult> {
  return apiSend<MastershopRetryResult>(
    `/api/admin/orders/mastershop/${encodeURIComponent(id)}/retry`,
    { method: "POST" },
  );
}