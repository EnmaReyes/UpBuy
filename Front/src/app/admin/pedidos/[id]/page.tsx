import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getAdminOrder,
  getAdminOrderSyncHistory,
} from "@/services/admin/orders";
import { getAdminMe } from "@/services/admin/me";
import { ApiError } from "@/services/api/client";
import { AdminOrderDetailView } from "@/components/admin/orders/AdminOrderDetailView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Detalle de pedido — Panel UPBUY",
  robots: { index: false, follow: false },
};

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const [order, admin, syncHistory] = await Promise.all([
      getAdminOrder(id),
      getAdminMe(),
      getAdminOrderSyncHistory(id),
    ]);

    return (
      <AdminOrderDetailView
        initialOrder={order}
        permissions={admin.permissions}
        syncHistory={syncHistory}
      />
    );
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.isNotFound || error.status === 400)
    ) {
      notFound();
    }
    throw error;
  }
}
