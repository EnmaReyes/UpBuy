import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AddressManager } from "@/components/account/AddressManager";
import { listAddresses } from "@/services/account/queries";
import { ApiError } from "@/services/api/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mis direcciones — UPBUY",
  robots: { index: false, follow: false },
};

export default async function DireccionesPage() {
  let addresses;

  try {
    addresses = await listAddresses();
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) {
      redirect("/login?next=/cuenta/direcciones");
    }
    throw error;
  }

  return <AddressManager addresses={addresses} />;
}
