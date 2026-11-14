"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MailCheck, RotateCcw, Send } from "lucide-react";
import Loader from "@/components/kokonutui/loader";
import HoldButton from "@/components/kokonutui/hold-button";
import InlineAlert, { type InlineAlertTone } from "@/components/kokonutui/inline-alert";
import { StepUpDialog } from "@/components/admin/StepUpDialog";
import { useAdminAction } from "@/components/admin/orders/useAdminAction";
import {
  previewAudience,
  createCampaign,
  sendCampaignBatch,
  sendTestEmail,
  startGmailOauth,
} from "@/services/admin/campaigns.actions";
import { ApiError } from "@/services/api/client";
import {
  CAMPAIGN_SEGMENT_LABELS,
  type AudiencePreview,
  type CampaignSegment,
  type CampaignStatus,
  type GmailStatus,
  type SendBatchResult,
} from "@/types/admin";

// Difusión por email (ADM-7).
//
// Flujo: estado de Gmail → audiencia con conteo → asunto y cuerpo con
// variables → prueba obligatoria al correo del admin → confirmación con
// Hold Button (paso irreversiblemente destructivo) y step-up si la sesión no
// tiene segundo factor reciente. El envío corre por lotes de 25 desde el
// cliente; si el techo diario corta la cadena, se informa y el cron continúa.

const VARIABLES = ["{{nombre}}", "{{ultimoPedido}}", "{{ciudad}}"] as const;

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-card px-3 text-sm text-carbon placeholder:text-coffee focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const LABEL_CLASS =
  "text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase";

type SendProgress = {
  sent: number;
  failed: number;
  errors: SendBatchResult["errors"];
  dailyLimitReached: boolean;
};

type StatusAlert = { tone: InlineAlertTone; title: string; message?: string };

function previewBody(body: string, nombre = "Ana", ultimoPedido = "UPBUY-2026-000011", ciudad = "Medellín") {
  return body
    .replace(/\{\{\s*nombre\s*\}\}/g, nombre)
    .replace(/\{\{\s*ultimoPedido\s*\}\}/g, ultimoPedido)
    .replace(/\{\{\s*ciudad\s*\}\}/g, ciudad);
}

export function EmailCampaignView({
  status: initialStatus,
}: {
  status: GmailStatus;
}) {
  const [status, setStatus] = useState<GmailStatus>(initialStatus);
  const [segment, setSegment] = useState<CampaignSegment>("todos");
  const [audience, setAudience] = useState<AudiencePreview | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [testSent, setTestSent] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [progress, setProgress] = useState<SendProgress | null>(null);
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatus | null>(null);

  const action = useAdminAction();
  const [pageError, setPageError] = useState<string | null>(null);

  // Audiencia: conteo + muestra del segmento.
  useEffect(() => {
    let alive = true;
    setAudienceLoading(true);
    previewAudience(segment)
      .then((data) => {
        if (alive) setAudience(data);
      })
      .catch(() => {
        if (alive) setAudience(null);
      })
      .finally(() => {
        if (alive) setAudienceLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [segment]);

  const gmailReady = status.configured && status.connected;
  const quotaText = `${status.sentToday}/${status.dailyLimit} correos hoy`;

  const canSend =
    gmailReady &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    (audience?.count ?? 0) > 0 &&
    testSent;

  const alerts = useMemo<StatusAlert[]>(() => {
    const list: StatusAlert[] = [];
    if (!status.configured) {
      list.push({
        tone: "warning",
        title: "Gmail no configurado",
        message:
          "Faltan GOOGLE_MAIL_CLIENT_ID / GOOGLE_MAIL_CLIENT_SECRET o GMAIL_TOKEN_ENCRYPTION_KEY en el backend. Sin ellos no se puede conectar ni enviar: nada se guarda en claro y no se simula ningún envío.",
      });
    } else if (!status.connected) {
      list.push({
        tone: "info",
        title: "Gmail sin conectar",
        message: `Autoriza la cuenta ${status.from} para poder enviar difusiones.`,
      });
    }
    return list;
  }, [status]);

  const connectGmail = useCallback(async () => {
    setPageError(null);
    try {
      const { url } = await startGmailOauth();
      // Navegación completa: Google devuelve el code a la API y esta fija la
      // cookie `state`. Al volver, el panel muestra Gmail conectado.
      window.location.href = url;
    } catch (error) {
      setPageError(
        error instanceof ApiError ? error.message : "No se pudo iniciar la autorización.",
      );
    }
  }, []);

  const runTestSend = useCallback(async () => {
    setTestSending(true);
    setPageError(null);
    try {
      await sendTestEmail({ subject: subject.trim(), body: body.trim() });
      setTestSent(true);
    } catch (error) {
      setPageError(
        error instanceof ApiError ? error.message : "No se pudo enviar la prueba.",
      );
    } finally {
      setTestSending(false);
    }
  }, [body, subject]);

  const doSend = useCallback(async () => {
    setPageError(null);
    const cleanSubject = subject.trim();
    const cleanBody = body.trim();
    const targetCount = audience?.count ?? 0;

    if (!canSend || !audience) return;

    const created = await createCampaign({
      subject: cleanSubject,
      body: cleanBody,
      segment,
    });

    setCampaignStatus("sending");
    const totals: SendProgress = {
      sent: 0,
      failed: 0,
      errors: [],
      dailyLimitReached: false,
    };
    setProgress({ ...totals });

    // Lote a lote hasta que el backend no tenga pendientes. `remaining`
    // manda: si el techo diario corta, se detiene y queda para el cron.
    let remaining = Math.min(created.campaign.totalRecipients, targetCount + 5);
    let guard = 0;

    while (guard < 200) {
      guard += 1;
      const batch = await sendCampaignBatch(created.campaign.id);
      totals.sent += batch.sent;
      totals.failed += batch.failed;
      totals.errors.push(...batch.errors);
      totals.dailyLimitReached = Boolean(batch.dailyLimitReached);
      setProgress({ ...totals });

      if (batch.done || batch.dailyLimitReached) break;
      remaining = batch.remaining;
      if (remaining <= 0) break;
    }

    setCampaignStatus(totals.sent + totals.failed > 0 ? "sent" : "failed");

    // Refresca el contador de cuota.
    setStatus((current) => ({
      ...current,
      sentToday: current.sentToday + totals.sent,
    }));
  }, [audience, body, canSend, segment, subject]);

  const sendNow = useCallback(() => {
    action
      .run(doSend)
      .catch(() => {
        // El mensaje queda en action.error / pageError.
      });
  }, [action, doSend]);

  const showResult =
    campaignStatus !== null && progress !== null && !action.stepUpOpen;

  if (!status.configured || !status.connected) {
    return (
      <div className="flex flex-col gap-6">
        {alerts.map((alert) => (
          <InlineAlert
            key={alert.title}
            message={alert.message}
            title={alert.title}
            tone={alert.tone}
            action={
              status.configured && !status.connected
                ? { label: "Conectar Gmail", onClick: connectGmail }
                : undefined
            }
          />
        ))}
        {pageError ? (
          <InlineAlert message={pageError} title="No se pudo completar la acción" tone="danger" />
        ) : null}
        <p className="text-sm text-coffee-deep">
          Mientras Gmail no esté listo, el historial y los consentimientos siguen
          funcionando, pero no se envía ningún correo (ni de prueba).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Estado de Gmail */}
      <section aria-label="Estado de Gmail" className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-coffee/10 text-coffee-deep">
              <MailCheck aria-hidden="true" className="size-4" />
            </span>
            <div>
              <p className="font-semibold text-sm text-carbon">
                Gmail conectado · {status.from}
              </p>
              <p className="text-[13px] text-coffee-deep tabular-nums">
                Cuota: {quotaText} · Envío por lotes de 25
              </p>
            </div>
          </div>
          <button
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-coffee-deep transition-colors hover:text-carbon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={connectGmail}
            type="button"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Volver a conectar
          </button>
        </div>
      </section>

      {/* Audiencia */}
      <section aria-label="Audiencia" className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3">
          <div>
            <p className="font-semibold text-sm text-carbon">Audiencia</p>
            <p className="text-[13px] text-coffee-deep">
              Solo usuarios con consentimiento activo y sin baja. Se excluyen
              administradores, correos rebotados y cuentas desactivadas.
            </p>
          </div>
          <div role="group" aria-label="Segmento de audiencia" className="flex flex-wrap gap-2">
            {(Object.keys(CAMPAIGN_SEGMENT_LABELS) as CampaignSegment[]).map((option) => (
              <button
                aria-pressed={segment === option}
                className={
                  segment === option
                    ? "inline-flex min-h-11 items-center rounded-full bg-carbon px-4 text-sm font-semibold text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    : "inline-flex min-h-11 items-center rounded-full bg-muted px-4 text-sm font-semibold text-coffee-deep transition-colors hover:text-carbon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                }
                key={option}
                onClick={() => setSegment(option)}
                type="button"
              >
                {CAMPAIGN_SEGMENT_LABELS[option]}
              </button>
            ))}
          </div>
          <p aria-live="polite" className="text-sm text-coffee-deep tabular-nums">
            {audienceLoading
              ? "Calculando audiencia…"
              : audience
                ? `${audience.count} destinatarios elegibles · muestra: ${audience.sample.map((s) => s.email).join(", ") || "ninguno"}`
                : "No se pudo calcular la audiencia."}
          </p>
        </div>
      </section>

      {/* Composición */}
      <section aria-label="Contenido del correo" className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={LABEL_CLASS} htmlFor="campana-asunto">
              Asunto
            </label>
            <input
              className={`${FIELD_CLASS} h-11`}
              id="campana-asunto"
              maxLength={200}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Novedades de UPBUY"
              value={subject}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL_CLASS} htmlFor="campana-cuerpo">
              Cuerpo
            </label>
            <textarea
              className={`${FIELD_CLASS} min-h-32`}
              id="campana-cuerpo"
              onChange={(event) => setBody(event.target.value)}
              placeholder={"Hola {{nombre}},\n\nTenemos algo para ti…"}
              value={body}
            />
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[12px] text-coffee-deep">Variables disponibles:</span>
              {VARIABLES.map((variable) => (
                <button
                  aria-label={`Insertar ${variable}`}
                  className="rounded-full border border-border bg-muted px-2.5 py-1 font-mono text-[12px] text-coffee-deep transition-colors hover:text-carbon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  key={variable}
                  onClick={() => setBody((current) => `${current}${current ? " " : ""}${variable}`)}
                  type="button"
                >
                  {variable}
                </button>
              ))}
            </div>
          </div>
          {body.trim() ? (
            <div aria-label="Vista previa" className="rounded-lg bg-muted p-3">
              <p className={LABEL_CLASS}>Vista previa</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-carbon">
                {previewBody(body)}
              </p>
              <p className="mt-2 text-[12px] text-coffee-deep">
                El servidor renderiza y escapa cada variable al enviar; la vista
                previa usa valores de ejemplo.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {/* Prueba + envío */}
      <section aria-label="Envío" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-terracotta/40 bg-terracotta/5 px-4 text-sm font-semibold text-terracotta-deep transition-colors hover:bg-terracotta/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            disabled={!gmailReady || !subject.trim() || !body.trim() || testSending}
            onClick={runTestSend}
            type="button"
          >
            {testSending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Send aria-hidden="true" className="size-4" />}
            {testSent ? "Enviar otra prueba" : "Enviar prueba a mi correo"}
          </button>
          <p aria-live="polite" className="text-[13px] text-coffee-deep">
            {testSent
              ? "Prueba enviada a tu correo. Ya puedes lanzar la campaña."
              : "Obligatorio antes de habilitar el envío real."}
          </p>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <p className="text-[13px] text-coffee-deep">
            Vas a escribir a{" "}
            <strong className="text-carbon tabular-nums">
              {audienceLoading ? "…" : audience?.count ?? 0}
            </strong>{" "}
            destinatarios con consentimiento. Los correos salen en lotes de 25; el
            envío no se puede deshacer.
          </p>
          <div>
            <HoldButton
              className="bg-terracotta/10 text-terracotta-deep border-terracotta/30 hover:bg-terracotta/15 data-complete:border-terracotta data-complete:bg-terracotta data-complete:text-cream"
              completeLabel="Enviando campaña"
              disabled={!canSend || action.busy}
              holdingLabel="Sigue presionando…"
              onHoldComplete={sendNow}
              variant="blue"
            >
              Mantén presionado para enviar
            </HoldButton>
          </div>
          {action.error || pageError ? (
            <InlineAlert
              message={action.error ?? pageError ?? undefined}
              title="No se pudo enviar la campaña"
              tone="danger"
            />
          ) : null}
        </div>

        {showResult && progress ? (
          <div aria-live="polite" className="rounded-lg bg-muted p-4">
            <p className="font-semibold text-sm text-carbon">
              {campaignStatus === "sent"
                ? progress.dailyLimitReached
                  ? "Campaña en curso: techo diario alcanzado, el cron continúa el resto."
                  : "Campaña enviada."
                : "La campaña quedó pendiente de envío."}
            </p>
            <p className="mt-1 text-[13px] text-coffee-deep tabular-nums">
              Enviados: {progress.sent} · Fallidos: {progress.failed}
              {progress.dailyLimitReached ? " · Techo diario alcanzado" : ""}
            </p>
            {progress.errors.length ? (
              <ul className="mt-2 flex flex-col gap-1 text-[12px] text-terracotta-deep">
                {progress.errors.slice(0, 5).map((item) => (
                  <li key={item.email}>
                    {item.email}: {item.error}
                  </li>
                ))}
                {progress.errors.length > 5 ? (
                  <li>+{progress.errors.length - 5} más</li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      <StepUpDialog
        actionLabel="Verificar y enviar"
        description="Para enviar esta difusión necesitas tu segundo factor."
        onOpenChange={action.setStepUpOpen}
        onVerified={() => action.retry()}
        open={action.stepUpOpen}
      />

      {action.busy ? (
        <Loader
          subtitle="Lotes de 25 en curso"
          title="Enviando campaña"
          className="text-carbon"
        />
      ) : null}
    </div>
  );
}
