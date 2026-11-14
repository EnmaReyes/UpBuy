"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, RefreshCw } from "lucide-react";
import { StepUpDialog } from "@/components/admin/StepUpDialog";
import { useAdminAction } from "@/components/admin/orders/useAdminAction";
import { regenerateBackupCodes } from "@/services/admin/security.actions";

// Códigos de respaldo del MFA (ADM-S2).
//
// Solo se muestran en claro justo después de generarlos: la base guarda el
// hash. Regenerarlos invalida los anteriores y exige step-up, así que el panel
// reutiliza el diálogo de verificación y reintenta la acción.

type BackupCodesCardProps = {
  mfaEnabled: boolean;
  total: number;
  remaining: number;
};

export function BackupCodesCard({
  mfaEnabled,
  total,
  remaining,
}: BackupCodesCardProps) {
  const router = useRouter();
  const { busy, error, stepUpOpen, setStepUpOpen, run, retry } =
    useAdminAction();
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null);

  const onRegenerate = () => {
    setFreshCodes(null);
    void run(async () => {
      const result = await regenerateBackupCodes();
      setFreshCodes(result.backupCodes);
      router.refresh();
    }).catch(() => {});
  };

  const used = Math.max(0, total - remaining);

  return (
    <section
      aria-labelledby="backup-codes-title"
      className="rounded-xl border border-border bg-card p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-terracotta/10 text-terracotta-deep">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2
              id="backup-codes-title"
              className="font-heading text-base font-semibold text-carbon"
            >
              Códigos de respaldo
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Sirven una sola vez si pierdes el teléfono. Guarda los nuevos
              antes de cerrar esta página.
            </p>
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <dt className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
            Disponibles
          </dt>
          <dd className="mt-0.5 font-heading text-xl font-semibold text-carbon tabular-nums">
            {remaining}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <dt className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
            Usados
          </dt>
          <dd className="mt-0.5 font-heading text-xl font-semibold text-carbon tabular-nums">
            {used}
          </dd>
        </div>
      </dl>

      {remaining === 0 && total > 0 ? (
        <p
          role="status"
          className="mt-3 rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-xs leading-relaxed text-terracotta-deep"
        >
          No te quedan códigos de respaldo. Genera un juego nuevo para no
          quedarte sin acceso si pierdes el dispositivo.
        </p>
      ) : null}

      {freshCodes ? (
        <div className="mt-4 rounded-lg border border-carbon/15 bg-muted/40 p-3">
          <p className="text-xs font-semibold text-carbon">
            Tus códigos nuevos (se muestran una sola vez)
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-xs text-carbon sm:grid-cols-3">
            {freshCodes.map((code) => (
              <li
                key={code}
                className="rounded border border-border bg-background px-2 py-1 text-center tracking-wider"
              >
                {code}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-coffee-deep">
            Los códigos anteriores ya no funcionan.
          </p>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-sm text-terracotta-deep"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onRegenerate}
        disabled={busy || !mfaEnabled}
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw
          className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"}
          aria-hidden="true"
        />
        {busy ? "Generando…" : "Regenerar códigos"}
      </button>

      {!mfaEnabled ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Activa la verificación en dos pasos antes de generar códigos.
        </p>
      ) : null}

      <StepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        actionLabel="Regenerar códigos de respaldo"
        onVerified={retry}
      />
    </section>
  );
}
