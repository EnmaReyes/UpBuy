import type { Metadata } from "next";
import Link from "next/link";
import { CampaignHistoryView } from "@/components/admin/campaigns/CampaignHistoryView";

// Historial de difusión (ADM-7): campañas con estado, enviados y fallidos.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Difusión — Panel UPBUY",
  robots: { index: false, follow: false },
};

export default function AdminDifusionPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-carbon">
          Difusión
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Historial de campañas por email. El envío se hace desde la pestaña de
          email, con consentimiento y baja visibles.{" "}
          <Link
            className="font-semibold text-terracotta underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            href="/admin/difusion/whatsapp"
          >
            Ir a WhatsApp
          </Link>{" "}
          ·{" "}
          <Link
            className="font-semibold text-terracotta underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            href="/admin/difusion/email"
          >
            Ir a Email
          </Link>
        </p>
      </header>
      <CampaignHistoryView />
    </div>
  );
}
