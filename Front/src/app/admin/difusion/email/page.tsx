import type { Metadata } from "next";
import { getGmailStatus } from "@/services/admin/campaigns";
import { EmailCampaignView } from "@/components/admin/campaigns/EmailCampaignView";
import InlineAlert from "@/components/kokonutui/inline-alert";

// Difusión por email (ADM-7). El estado de Gmail se lee en el servidor; la
// composición y el envío son interactivos (vista cliente).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Difusión por email — Panel UPBUY",
  robots: { index: false, follow: false },
};

export default async function AdminDifusionEmailPage() {
  let status: Awaited<ReturnType<typeof getGmailStatus>> | null = null;

  try {
    status = await getGmailStatus();
  } catch {
    status = null;
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-carbon">
          Difusión por email
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Solo promocional y con consentimiento: marketingOptIn activo, sin baja
          y sin rebotes. Los administradores nunca reciben difusiones.
        </p>
      </header>

      {status ? (
        <EmailCampaignView status={status} />
      ) : (
        <InlineAlert
          message="No se pudo consultar el estado de Gmail. Revisa que la API esté disponible."
          title="El panel de difusión no está disponible"
          tone="danger"
        />
      )}
    </div>
  );
}
