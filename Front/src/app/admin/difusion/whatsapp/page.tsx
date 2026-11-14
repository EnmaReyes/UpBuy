import type { Metadata } from "next";
import Link from "next/link";
import { getWhatsappStatus } from "@/services/admin/whatsapp";
import { WhatsAppPanel } from "@/components/admin/campaigns/WhatsAppPanel";
import InlineAlert from "@/components/kokonutui/inline-alert";

// Difusión por WhatsApp (ADM-8). El estado de la Cloud API se lee en el
// servidor; el envío (automático o manual) es interactivo (vista cliente).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Difusión por WhatsApp — Panel UPBUY",
  robots: { index: false, follow: false },
};

export default async function AdminDifusionWhatsappPage() {
  let status: Awaited<ReturnType<typeof getWhatsappStatus>> | null = null;

  try {
    status = await getWhatsappStatus();
  } catch {
    status = null;
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-carbon">
          Difusión por WhatsApp
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Solo con plantilla aprobada por Meta y consentimiento propio
          (whatsappOptIn). Sin configuración, el modo manual usa tu propio
          WhatsApp uno a uno.{" "}
          <Link
            className="font-semibold text-terracotta underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            href="/admin/difusion"
          >
            Ver difusión por email
          </Link>
        </p>
      </header>

      {status ? (
        <WhatsAppPanel status={status} />
      ) : (
        <InlineAlert
          message="No se pudo consultar el estado de WhatsApp. Revisa que la API esté disponible."
          title="El panel de WhatsApp no está disponible"
          tone="danger"
        />
      )}
    </div>
  );
}
