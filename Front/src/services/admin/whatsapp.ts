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
  const base =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
  return `${base.replace(/\/+$/, "")}/api/admin/campaigns/${encodeURIComponent(
    campaignId,
  )}/whatsapp/export.csv`;
}
