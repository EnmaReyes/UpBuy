import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getAdminMe } from "@/services/admin/me";
import { ManualOrderForm } from "@/components/admin/orders/ManualOrderForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nueva venta — Panel UPBUY",
  robots: { index: false, follow: false },
};

// Registro de una venta manual (presencial, WhatsApp o teléfono).
//
// El total lo calcula el backend: el formulario pide la previsualización al
// servidor y ese es el número que se registra.
export default async function NewManualOrderPage() {
  const admin = await getAdminMe();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link
          href="/admin/pedidos"
          className="inline-flex items-center gap-1 text-xs font-semibold text-coffee-deep transition-colors hover:text-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Volver a pedidos
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-carbon">
          Nueva venta
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Registra una venta que no viene de la tienda. Los precios se toman
          del catálogo.
        </p>
      </header>

      <ManualOrderForm canWrite={admin.permissions.includes("orders.write")} />
    </div>
  );
}
