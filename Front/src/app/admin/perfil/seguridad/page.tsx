import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getAdminMe } from "@/services/admin/me";
import {
  getAdminSessions,
  getSecurityOverview,
} from "@/services/admin/security";
import { ApiError } from "@/services/api/client";
import { formatDateTime } from "@/lib/format";
import { BackupCodesCard } from "@/components/admin/security/BackupCodesCard";
import { ActiveSessionsCard } from "@/components/admin/security/ActiveSessionsCard";
import type {
  AdminProfile,
  AdminSecurityOverview,
  AdminSessionInfo,
} from "@/types/admin";

// Seguridad de la cuenta administrativa (ADM-S2 / ADM-S3).
//
// Reúne las tres piezas del contrato: estado del MFA, códigos de respaldo y
// sesiones activas. La página es de lectura; las mutaciones viven en los
// componentes cliente y siempre las revalida el backend.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Seguridad — Panel UPBUY",
  robots: { index: false, follow: false },
};

export default async function AdminSecurityPage() {
  let admin: AdminProfile;
  let overview: AdminSecurityOverview;
  let sessions: AdminSessionInfo[];

  try {
    [admin, overview, sessions] = await Promise.all([
      getAdminMe(),
      getSecurityOverview(),
      getAdminSessions(),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect("/login?next=/admin/perfil/seguridad");
    }
    throw error;
  }

  const { mfa, backupCodes, policy } = overview;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link
          href="/admin/perfil"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-coffee-deep underline underline-offset-4 hover:text-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Volver al perfil
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-carbon">
          Seguridad
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verificación en dos pasos, códigos de respaldo y sesiones abiertas de
          tu cuenta administrativa.
        </p>
      </header>

      <section
        aria-labelledby="mfa-title"
        className="rounded-xl border border-border bg-card p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-terracotta/10 text-terracotta-deep">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="mfa-title"
                className="font-heading text-base font-semibold text-carbon"
              >
                Verificación en dos pasos
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Código temporal (TOTP) de tu aplicación de autenticación. Es
                obligatorio para todas las cuentas del panel.
              </p>
            </div>
          </div>

          <span
            className={
              mfa.enabled
                ? "rounded-full border border-carbon/15 bg-carbon px-3 py-1 text-[11px] font-semibold tracking-wide text-cream uppercase"
                : "rounded-full border border-terracotta/40 bg-terracotta/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-terracotta-deep uppercase"
            }
          >
            {mfa.enabled ? "Activo" : "Pendiente"}
          </span>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
              Activado
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-carbon">
              {mfa.enrolledAt ? formatDateTime(mfa.enrolledAt) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
              Última verificación
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-carbon">
              {admin.session?.mfaAt
                ? formatDateTime(admin.session.mfaAt)
                : "En este inicio de sesión"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
              Inactividad máxima
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-carbon tabular-nums">
              {policy.idleMinutes} minutos
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
              Duración máxima
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-carbon tabular-nums">
              {policy.maxHours} horas
            </dd>
          </div>
        </dl>

        <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          El segundo factor no se puede desactivar desde el panel. Las acciones
          sensibles piden un código reciente: la ventana es de{" "}
          {policy.stepUpMinutes} minutos.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <BackupCodesCard
          mfaEnabled={mfa.enabled}
          total={backupCodes.total}
          remaining={backupCodes.remaining}
        />
        <ActiveSessionsCard sessions={sessions} />
      </div>
    </div>
  );
}
