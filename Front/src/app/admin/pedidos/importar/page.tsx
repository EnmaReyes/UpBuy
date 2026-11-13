import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getAdminMe } from "@/services/admin/me";
import { ImportCsv } from "@/components/admin/orders/ImportCsv";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Importar pedidos — Panel UPBUY",
  robots: { index: false, follow: false },
};

// Importacion de ventas desde CSV (ADM-3).
//
// Dos pasos: vista previa (el servidor analiza sin escribir) y confirmacion.
export default async function ImportOrdersPage() {
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
          Importar pedidos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sube un CSV con las ventas que no vienen de la tienda. Primero se
          analiza el archivo; nada se guarda hasta que confirmes.
        </p>
      </header>

      <ImportCsv canWrite={admin.permissions.includes("orders.write")} />
    </div>
  );
}
