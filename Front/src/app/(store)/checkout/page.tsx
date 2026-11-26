import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckoutClient } from "@/components/checkout/CheckoutClient";
import {
  getProfile,
  getSession,
  listAddresses,
} from "@/services/account/queries";
import { ApiError } from "@/services/api/client";
import type { Profile } from "@/types/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout — UPBUY",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  // El login es solo para quien NO tiene sesión. Un usuario autenticado nunca
  // se manda a /login, aunque le falten datos: eso rompería su sesión actual.
  const session = await getSession();
  if (!session) redirect("/login?next=/checkout");

  let profile: Profile;
  try {
    profile = await getProfile();
  } catch (error) {
    // Sesión caducada justo entre las dos llamadas: sí corresponde re-login.
    if (error instanceof ApiError && error.isUnauthorized) {
      redirect("/login?next=/checkout");
    }
    throw error;
  }

  // Con sesión válida pero perfil incompleto se va al área de cuenta para
  // completar los formularios de datos (dirección incluida), no al login.
  if (!profile.profileComplete) {
    redirect("/cuenta/perfil?next=/checkout");
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
          <CheckoutContent profile={profile} />
        </div>
      </section>
    </div>
  );
}

async function CheckoutContent({ profile }: { profile: Profile }) {
  const addresses = await listAddresses();
  return <CheckoutClient profile={profile} addresses={addresses} />;
}
