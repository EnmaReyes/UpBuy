import { redirect } from "next/navigation";
import { getSession } from "@/services/account/queries";
import { AccountNav } from "@/components/account/AccountNav";
import { LogoutButton } from "@/components/account/LogoutButton";

// Área privada. El middleware ya exige la cookie, pero aquí se valida de
// verdad contra el backend: una cookie caducada cae igual al login.
export const dynamic = "force-dynamic";

export default async function CuentaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/cuenta/perfil");
  }

  const displayName =
    [session.name, session.lastName].filter(Boolean).join(" ") ||
    session.username ||
    session.email;

  return (
    <div className="bg-background pt-16">
      <section className="bg-carbon pt-16 pb-12 text-cream">
        <div className="container-page">
          <p className="text-xs font-semibold tracking-[0.25em] text-terracotta uppercase">
            Mi cuenta
          </p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="font-heading text-[clamp(1.75rem,3.5vw,2.75rem)] leading-tight font-bold tracking-tight">
                Hola, {displayName}
              </h1>
              <p className="mt-2 text-sm text-cream/70">{session.email}</p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </section>

      <div className="container-page section-y">
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
          <aside className="min-w-0 lg:col-span-3">
            <AccountNav />
          </aside>
          <div className="min-w-0 lg:col-span-9">{children}</div>
        </div>
      </div>
    </div>
  );
}
