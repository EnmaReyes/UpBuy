import type { Metadata } from "next";
import { VentasView } from "@/components/admin/sales/VentasView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ventas — Panel UPBUY",
  robots: { index: false, follow: false },
};

// Ventas y contabilidad (ADM-6). La vista es de cliente: el selector de
// periodo y los filtros actualizan la serie sin recargar la página.
export default function AdminSalesPage() {
  return <VentasView />;
}
