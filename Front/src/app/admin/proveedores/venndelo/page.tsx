import type { Metadata } from "next";
import {
  Boxes,
  ClipboardList,
  History,
  Wallet,
} from "lucide-react";
import {
  getVenndeloStatus,
  getVenndeloWalletBalance,
  listVenndeloOrders,
} from "@/services/admin/providers";
import { listAdminCategories } from "@/services/admin/catalog";
import { getAdminMe } from "@/services/admin/me";
import { formatDateTime } from "@/lib/format";
import {
  ADMIN_VENNDELO_ORDER_STATUS_LABELS,
  type AdminVenndeloOrder,
} from "@/types/admin";
import {
  CatalogSupplierHeader,
  CatalogSupplierMetrics,
  SupplierPageError,
  SupplierTabs,
  TabError,
} from "@/components/admin/providers/CatalogSupplierParts";
import { CatalogSupplierPolicyPanel } from "@/components/admin/providers/CatalogSupplierPolicyPanel";
import {
  CatalogSupplierHistoryTab,
  CatalogSupplierProductsTab,
  type SupplierSearchParams,
} from "@/components/admin/providers/CatalogSupplierSections";
import { VenndeloOrders } from "@/components/admin/providers/VenndeloOrders";
import { VenndeloWallet } from "@/components/admin/providers/VenndeloWallet";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Venndelo Pro — Panel UPBUY",
  robots: { index: false, follow: false },
};

const SLUG = "venndelo" as const;

const TABS = [
  { id: "catalogo", label: "Catálogo", icon: Boxes },
  { id: "pedidos", label: "Pedidos", icon: ClipboardList },
  { id: "wallet", label: "Wallet", icon: Wallet },
  { id: "historial", label: "Historial", icon: History },
] as const;

type TabId = (typeof TABS)[number]["id"];

const VENNDELO_STATUSES = Object.keys(ADMIN_VENNDELO_ORDER_STATUS_LABELS).filter(
  (status) => status !== "ANY",
);

export default async function VenndeloPage({
  searchParams,
}: {
  searchParams: Promise<SupplierSearchParams>;
}) {
  const raw = await searchParams;
  const requestedTab = typeof raw.tab === "string" ? raw.tab : "";
  const tab: TabId = TABS.some((entry) => entry.id === requestedTab)
    ? (requestedTab as TabId)
    : "catalogo";

  let status;
  let categories;
  let canManageProviders;
  try {
    const [statusResult, categoryResult, admin] = await Promise.all([
      getVenndeloStatus(),
      listAdminCategories().catch(() => ({ categories: [] })),
      getAdminMe(),
    ]);
    status = statusResult;
    categories = categoryResult.categories;
    canManageProviders = admin.permissions.includes("providers.manage");
  } catch (error) {
    return <SupplierPageError error={error} name="Venndelo Pro" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <CatalogSupplierHeader
        slug={SLUG}
        name="Venndelo Pro"
        description="Catálogo, pedidos y wallet del proveedor con doble N (VENNDELO_*). No es Vendelo (pedidos)."
        status={status}
        envHint="VENNDELO_CLIENT_ID, VENNDELO_CLIENT_SECRET y VENNDELO_REFRESH_TOKEN"
      />

      <CatalogSupplierMetrics
        status={status}
        name="Venndelo Pro"
        credential={{
          label: "Token",
          value: status.token.cached ? "En caché" : "Sin token",
          hint: status.token.expiresAt
            ? `Vence ${formatDateTime(status.token.expiresAt)}`
            : undefined,
        }}
      />

      <SupplierTabs slug={SLUG} tabs={[...TABS]} active={tab} />

      {tab === "catalogo" ? (
        <div className="flex flex-col gap-6">
          <CatalogSupplierPolicyPanel
            slug={SLUG}
            providerName="Venndelo Pro"
            policy={status.supplier.publishPolicy}
            defaultCategoryId={status.supplier.defaultCategoryId}
            categories={categories}
            canEdit={canManageProviders}
          />
          <CatalogSupplierProductsTab
            slug={SLUG}
            providerName="Venndelo Pro"
            tab={tab}
            searchParams={raw}
          />
        </div>
      ) : null}
      {tab === "pedidos" ? (
        <OrdersTab raw={raw} configured={status.configured} />
      ) : null}
      {tab === "wallet" ? <WalletTab configured={status.configured} /> : null}
      {tab === "historial" ? (
        <CatalogSupplierHistoryTab slug={SLUG} tab={tab} searchParams={raw} />
      ) : null}
    </div>
  );
}

async function OrdersTab({
  raw,
  configured,
}: {
  raw: SupplierSearchParams;
  configured: boolean;
}) {
  const one = (value: string | string[] | undefined): string =>
    typeof value === "string" ? value : "";
  const requestedStatus = one(raw.status).toUpperCase();
  const status = VENNDELO_STATUSES.includes(requestedStatus)
    ? requestedStatus
    : "";
  const createdMin = dateOnly(one(raw.created_min));
  const createdMax = dateOnly(one(raw.created_max));

  let orders: AdminVenndeloOrder[] = [];
  let loadError: unknown = null;

  if (configured) {
    try {
      orders = await listVenndeloOrders({
        status: status || undefined,
        created_min: createdMin || undefined,
        created_max: createdMax || undefined,
        page_size: 50,
      });
      if (!Array.isArray(orders)) {
        orders = [];
      }
    } catch (error) {
      loadError = error;
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Pedidos en Venndelo">
      {!configured ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Venndelo Pro no tiene credenciales. Los pedidos no se pueden consultar
          hasta configurarlas en el backend.
        </p>
      ) : (
        <>
          <form
            method="get"
            aria-label="Filtros de pedidos de Venndelo"
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="tab" value="pedidos" />
            <div>
              <label
                htmlFor="orders-status"
                className="block text-xs font-semibold text-carbon"
              >
                Estado
              </label>
              <select
                id="orders-status"
                name="status"
                defaultValue={status}
                className="mt-1 h-10 rounded-lg border border-border bg-background px-3 text-sm text-carbon"
              >
                <option value="">Todos</option>
                {VENNDELO_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {ADMIN_VENNDELO_ORDER_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="orders-from"
                className="block text-xs font-semibold text-carbon"
              >
                Desde
              </label>
              <input
                id="orders-from"
                name="created_min"
                type="date"
                defaultValue={createdMin}
                className="mt-1 h-10 rounded-lg border border-border bg-background px-3 text-sm text-carbon"
              />
            </div>
            <div>
              <label
                htmlFor="orders-to"
                className="block text-xs font-semibold text-carbon"
              >
                Hasta
              </label>
              <input
                id="orders-to"
                name="created_max"
                type="date"
                defaultValue={createdMax}
                className="mt-1 h-10 rounded-lg border border-border bg-background px-3 text-sm text-carbon"
              />
            </div>
            <button
              type="submit"
              className="h-10 rounded-lg bg-carbon px-4 text-sm font-semibold text-cream hover:bg-terracotta-deep"
            >
              Filtrar
            </button>
          </form>

          {loadError ? (
            <TabError error={loadError} title="No pudimos cargar los pedidos" />
          ) : (
            <VenndeloOrders orders={orders} />
          )}
        </>
      )}
    </section>
  );
}

async function WalletTab({ configured }: { configured: boolean }) {
  if (!configured) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        La wallet de Venndelo Pro requiere credenciales configuradas. Sin ellas
        no se consulta saldo ni se generan recargas.
      </p>
    );
  }

  try {
    const balance = await getVenndeloWalletBalance();
    return <VenndeloWallet balance={balance} />;
  } catch (error) {
    return <TabError error={error} title="No pudimos consultar la wallet" />;
  }
}

const dateOnly = (value: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
