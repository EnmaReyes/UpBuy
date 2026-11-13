import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { getAdminMe } from "@/services/admin/me";
import { getProfile } from "@/services/account/queries";
import { ApiError } from "@/services/api/client";
import { ProfileForm } from "@/components/account/ProfileForm";
import { ADMIN_ROLE_LABELS, type AdminProfile } from "@/types/admin";
import type { Profile } from "@/types/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mi perfil — Panel UPBUY",
  robots: { index: false, follow: false },
};

export default async function AdminProfilePage() {
  let admin: AdminProfile;
  let profile: Profile;

  try {
    [admin, profile] = await Promise.all([getAdminMe(), getProfile()]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect("/login?next=/admin/perfil");
    }
    throw error;
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-carbon">
          Mi perfil
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tus datos de contacto y de la cuenta administrativa.
        </p>
      </header>

      <section
        aria-label="Identidad de la cuenta"
        className="rounded-xl border border-border bg-card p-4"
      >
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold tracking-[0.12em] text-coffee-deep uppercase">
              Usuario
            </dt>
            <dd className="mt-1 text-sm font-medium text-carbon">
              {admin.username || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.12em] text-coffee-deep uppercase">
              Correo
            </dt>
            <dd className="mt-1 truncate text-sm font-medium text-carbon">
              {admin.email}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.12em] text-coffee-deep uppercase">
              Rol
            </dt>
            <dd className="mt-1 text-sm font-medium text-carbon">
              {ADMIN_ROLE_LABELS[admin.role] ?? admin.role}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.12em] text-coffee-deep uppercase">
              Segundo factor
            </dt>
            <dd className="mt-1 text-sm font-medium text-carbon">
              {admin.mfaEnabled ? "Activo" : "Pendiente"}
            </dd>
          </div>
        </dl>

        <p className="mt-4 flex items-start gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          El usuario, el correo y el rol solo los puede cambiar un
          superadministrador. Aquí son de solo lectura.
        </p>
      </section>

      <ProfileForm profile={profile} />
    </div>
  );
}
