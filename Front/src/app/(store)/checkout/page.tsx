import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { CheckoutClient } from "@/components/checkout/CheckoutClient";
import { getProfile, listAddresses } from "@/services/account/queries";
import { getSession } from "@/services/account/queries";
import { ApiError } from "@/services/api/client";
import { MISSING_FIELD_LABELS, type Profile } from "@/types/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout — UPBUY",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/checkout");

  let profile: Profile;
  try {
    profile = await getProfile();
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) {
      redirect("/login?next=/checkout");
    }
    throw error;
  }

  return (
    <div className="bg-background">
      <section className="bg-carbon pt-28 pb-12 text-cream sm:pt-32">
        <div className="container-page">
          <p className="text-xs font-semibold tracking-[0.25em] text-terracotta uppercase">
            Último paso
          </p>
          <h1 className="mt-4 font-heading text-[clamp(2rem,4.5vw,3.5rem)] leading-tight font-bold tracking-tight">
            Finalizar compra
          </h1>
        </div>
      </section>

      <section className="section-y">
        <div className="container-page">
          {profile.profileComplete ? (
            <CheckoutContent profile={profile} />
          ) : (
            <CompleteProfileNotice profile={profile} />
          )}
        </div>
      </section>
    </div>
  );
}

async function CheckoutContent({ profile }: { profile: Profile }) {
  const addresses = await listAddresses();
  return <CheckoutClient profile={profile} addresses={addresses} />;
}

function CompleteProfileNotice({ profile }: { profile: Profile }) {
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-terracotta/30 bg-terracotta/5 p-8 text-center">
      <CircleAlert
        className="mx-auto h-8 w-8 text-terracotta-deep"
        aria-hidden="true"
      />
      <h2 className="mt-4 font-heading text-xl font-semibold text-carbon">
        Necesitamos tus datos de envío
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-coffee-deep">
        Para crear el pedido falta:{" "}
        {profile.missing.map((field) => MISSING_FIELD_LABELS[field]).join(", ")}.
      </p>
      <Link
        href="/cuenta/perfil"
        className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-carbon px-6 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
      >
        Completar mi perfil
      </Link>
    </div>
  );
}