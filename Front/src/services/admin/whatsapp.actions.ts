import { apiSend } from "@/services/api/client";
import type {
  CampaignSegment,
  SendBatchResult,
  WhatsappAudiencePreview,
} from "@/types/admin";

// Mutaciones de WhatsApp (ADM-8). Van con cookie y `X-Upbuy-CSRF` vía
// `apiSend`; el backend revalida sesión, permiso y step-up.

export type CreatedWhatsappCampaign = {
  campaign: {
    id: string;
    status: string;
    totalRecipients: number;
  };
};

/** Conteo + teléfonos inválidos del segmento elegido. */
export async function previewWhatsappAudience(
  segment: CampaignSegment,
): Promise<WhatsappAudiencePreview> {
  return apiSend<WhatsappAudiencePreview>(
    "/api/admin/campaigns/whatsapp/audience",
    { body: { segment } },
  );
}

/** Prueba de plantilla SOLO al teléfono del propio admin. */
export async function sendWhatsappTest({
  body,
}: {
  body: string;
}): Promise<{ sent: boolean; to: string }> {
  return apiSend<{ sent: boolean; to: string }>(
    "/api/admin/whatsapp/test",
    { body: { body } },
  );
}

/** Crea la campaña de WhatsApp con destinatarios calculados. */
export async function createWhatsappCampaign({
  body,
  segment,
}: {
  body: string;
  segment: CampaignSegment;
}): Promise<CreatedWhatsappCampaign> {
  return apiSend<CreatedWhatsappCampaign>("/api/admin/campaigns", {
    body: { channel: "whatsapp", body, segment },
  });
}

/** Envía UN lote de 20 de la campaña de WhatsApp. Reintentable sin duplicar. */
export async function sendWhatsappBatch(
  id: string,
): Promise<SendBatchResult> {
  return apiSend<SendBatchResult>(
    `/api/admin/campaigns/${encodeURIComponent(id)}/send-whatsapp`,
  );
}

/** Marca un envío manual hecho (uno a uno). Idempotente. */
export async function markWhatsappManualSent({
  campaignId,
  recipientId,
}: {
  campaignId: string;
  recipientId: string;
}): Promise<{ ok: boolean }> {
  return apiSend<{ ok: boolean }>(
    `/api/admin/campaigns/${encodeURIComponent(
      campaignId,
    )}/whatsapp/manual-sent`,
    { body: { recipientId } },
  );
}
