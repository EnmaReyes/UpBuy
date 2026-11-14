import { apiGet, apiSend } from "@/services/api/client";
import type {
  AudiencePreview,
  CampaignSegment,
  SendBatchResult,
} from "@/types/admin";

// Mutaciones de difusión (ADM-7) desde el cliente. Todas van con cookie y
// `X-Upbuy-CSRF` vía `apiSend`; el backend revalida sesión, permiso y step-up.

export type CreatedCampaign = {
  campaign: {
    id: string;
    status: string;
    totalRecipients: number;
  };
};

/** Conteo + muestra (10) del segmento elegido. */
export async function previewAudience(
  segment: CampaignSegment,
): Promise<AudiencePreview> {
  return apiSend<AudiencePreview>("/api/admin/campaigns/audience", {
    body: { segment },
  });
}

/** Inicia el OAuth de Gmail. La cookie `state` la fija el backend. */
export async function startGmailOauth(): Promise<{ url: string }> {
  return apiGet<{ url: string }>("/api/admin/campaigns/oauth/start");
}

/** Correo de prueba al correo del propio admin. */
export async function sendTestEmail({
  subject,
  body,
}: {
  subject: string;
  body: string;
}): Promise<{ sent: boolean; to: string }> {
  return apiSend<{ sent: boolean; to: string }>(
    "/api/admin/campaigns/test-send",
    { body: { subject, body } },
  );
}

/** Crea la campaña (borrador con destinatarios calculados). */
export async function createCampaign({
  subject,
  body,
  segment,
}: {
  subject: string;
  body: string;
  segment: CampaignSegment;
}): Promise<CreatedCampaign> {
  return apiSend<CreatedCampaign>("/api/admin/campaigns", {
    body: { subject, body, segment },
  });
}

/** Envía UN lote de 25 de la campaña. Reintentable sin duplicar. */
export async function sendCampaignBatch(
  id: string,
): Promise<SendBatchResult> {
  return apiSend<SendBatchResult>(
    `/api/admin/campaigns/${encodeURIComponent(id)}/send`,
  );
}
