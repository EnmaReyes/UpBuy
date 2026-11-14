import { apiGet } from "@/services/api/client";
import type {
  CampaignListResponse,
  GmailStatus,
} from "@/types/admin";

// Lecturas de difusión (ADM-7) desde el cliente del panel. El backend
// revalida sesión y permisos (`campaigns.read` / `campaigns.send`) en cada
// petición. Las mutaciones viven en `campaigns.actions.ts`.

export async function getGmailStatus(): Promise<GmailStatus> {
  return apiGet<GmailStatus>("/api/admin/campaigns/status");
}

export async function listCampaigns(
  limit = 50,
  offset = 0,
): Promise<CampaignListResponse> {
  return apiGet<CampaignListResponse>("/api/admin/campaigns", {
    query: { limit, offset },
  });
}
