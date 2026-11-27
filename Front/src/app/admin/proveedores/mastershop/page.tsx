import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Boxes, History } from "lucide-react";
import { getCatalogSupplierStatus } from "@/services/admin/providers";
import { listAdminCategories } from "@/services/admin/catalog";
import { getAdminMe } from "@/services/admin/me";
import {
  CatalogSupplierMetrics,
  CatalogSupplierHeader,
  SupplierPageError,
  SupplierTabs,
} from "@/components/admin/providers/CatalogSupplierParts";
import { CatalogSupplierPolicyPanel } from "@/components/admin/providers/CatalogSupplierPolicyPanel";
import {
  CatalogSupplierHistoryTab,
  CatalogSupplierProductsTab,
  type SupplierSearchParams,
} from "@/components/admin/providers/CatalogSupplierSections";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "MasterShop — Panel UPBUY",
  robots: { index: false, follow: false },
};

const SLUG = "mastershop" as const;
const PAGE_TABS = [
  { id: "catalogo", label: "Catálogo", icon: Boxes },
  { id: "historial", label: "Historial", icon: History },
] as const;

export default async function MasterShopPage({
  searchParams,
}: {
  searchParams: Promise<SupplierSearchParams>;
}) {
  const raw = await searchParams;
  const requestedTab = typeof raw.tab === "string" ? raw.tab : "";
  const tab = PAGE_TABS.some((entry) => entry.id === requestedTab)
    ? requestedTab
    : "catalogo";

  let status;
  let categories;
  let canManageProviders;
  let canReadOrders;
  try {
    const [statusResult, categoryResult, admin] = await Promise.all([
      getCatalogSupplierStatus(SLUG),
      listAdminCategories().catch(() => ({ categories: [] })),
      getAdminMe(),
    ]);
    status = statusResult;
    categories = categoryResult.categories;
    canManageProviders = admin.permissions.includes("providers.manage");
    canReadOrders = admin.permissions.includes("orders.read");
  } catch (error) {
    return <SupplierPageError error={error} name="MasterShop" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <CatalogSupplierHeader
        slug={SLUG}
        name="MasterShop"
        description="Catálogo y pedidos del proveedor con llave estática (MASTERSHOP_API_KEY). Los webhooks de estado/tracking aún no están integrados."
        status={status}
        envHint="MASTERSHOP_API_URL y MASTERSHOP_API_KEY"
      />

      {canReadOrders ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div>
            <p className="font-heading text-sm font-semibold text-carbon">
              Pedidos en MasterShop
            </p>
            <p className="text-xs text-muted-foreground">
              Revisa y reintenta los pedidos que quedaron en revisión o con la
              cancelación pendiente.
            </p>
          </div>
          <Link
            href="/admin/proveedores/mastershop/pedidos"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-carbon px-4 text-sm font-semibold text-cream hover:bg-terracotta-deep"
          >
            Ver pedidos por resolver
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      ) : null}

      <CatalogSupplierMetrics
        status={status}
        name="MasterShop"
        credential={{
          label: "Llave API",
          value: status.configured ? "Configurada" : "Sin configurar",
          hint: status.configured
            ? "Definida en el entorno del backend"
            : "Falta MASTERSHOP_API_KEY",
        }}
      />

      <SupplierTabs slug={SLUG} tabs={[...PAGE_TABS]} active={tab} />

      {tab === "catalogo" ? (
        <div className="flex flex-col gap-6">
          <CatalogSupplierPolicyPanel
            slug={SLUG}
            providerName="MasterShop"
            policy={status.supplier.publishPolicy}
            defaultCategoryId={status.supplier.defaultCategoryId}
            categories={categories}
            canEdit={canManageProviders}
          />
          <CatalogSupplierProductsTab
            slug={SLUG}
            providerName="MasterShop"
            tab={tab}
            searchParams={raw}
          />
        </div>
      ) : null}
      {tab === "historial" ? (
        <CatalogSupplierHistoryTab slug={SLUG} tab={tab} searchParams={raw} />
      ) : null}
    </div>
  );
}
