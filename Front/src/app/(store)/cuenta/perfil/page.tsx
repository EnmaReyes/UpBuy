import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/account/ProfileForm";
import { getProfile } from "@/services/account/queries";
import { ApiError } from "@/services/api/client";
import type { Profile } from "@/types/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mi perfil — UPBUY",
  robots: { index: false, follow: false },
};

export default async function PerfilPage() {
  let profile: Profile;

  try {
    profile = await getProfile();
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) {
      redirect("/login?next=/cuenta/perfil");
    }
    throw error;
  }

  return <ProfileForm profile={profile} />;
}
