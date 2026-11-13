import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getAdminMe } from "@/services/admin/me";
import { ApiError } from "@/services/api/client";
import { AdminShell } from "@/components/admin/AdminShell";

// Área administrativa. El proxy solo comprueba que exista cookie; aquí se
// valida de verdad contra la API: rol, cuenta activa, sesión revocable y MFA.
// Un comprador con sesión válida vuelve a la tienda sin ver un 403.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Panel — UPBUY",
  robots: { index: false, follow: false },
};

const LOGIN_CODES = new Set([
  "ADMIN_SESSION_REQUIRED",
  "ADMIN_SESSION_REVOKED",
  "MFA_REQUIRED",
  "ADMIN_MFA_SETUP_REQUIRED",
  "SESSION_STALE",
]);

const DISABLED_CODES = new Set(["ACCOUNT_DISABLED"]);

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let admin;

  try {
    admin = await getAdminMe();
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401 || LOGIN_CODES.has(error.code ?? "")) {
        redirect("/login?next=/admin");
      }
      if (DISABLED_CODES.has(error.code ?? "")) {
        redirect("/login?next=/admin");
      }
      if (error.code === "ADMIN_REQUIRED") {
        redirect("/");
      }
      if (error.code === "ADMIN_IP_NOT_ALLOWED") {
        return <IpBlocked message={error.message} />;
      }
    }
    throw error;
  }

  return <AdminShell admin={admin}>{children}</AdminShell>;
}

function IpBlocked({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-terracotta/10 text-terracotta-deep">
          <ShieldAlert className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-heading text-xl font-semibold text-carbon">
          Acceso restringido
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Conéctate desde una red autorizada o pide a un superadministrador que
          revise la lista de IPs permitidas.
        </p>
      </div>
    </div>
  );
}
