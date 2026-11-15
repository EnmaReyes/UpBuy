import { apiGet } from "@/services/api/client";
import type {
  WhatsappManualListResponse,
  WhatsappStatus,
} from "@/types/admin";

// Lecturas de WhatsApp (ADM-8). Las mutaciones viven en whatsapp.actions.ts.

export async function getWhatsappStatus(): Promise<WhatsappStatus> {
  return apiGet<WhatsappStatus>("/api/admin/whatsapp/status");
}

export async function listWhatsappManual(
  campaignId: string,
): Promise<WhatsappManualListResponse> {
  return apiGet<WhatsappManualListResponse>(
    `/api/admin/campaigns/${encodeURIComponent(campaignId)}/whatsapp/manual`,
  );
}

export function whatsappManualCsvUrl(campaignId: string): string {
  // Relativa a propósito: pasa por el proxy same-origin del front
  // (next.config.ts) y la cookie de sesión viaja first-party.
  return `/api/admin/campaigns/${encodeURIComponent(campaignId)}/whatsapp/export.csv`;
}
