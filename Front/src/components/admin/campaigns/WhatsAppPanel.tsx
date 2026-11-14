"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  MessageCircle,
  RotateCcw,
  Send,
} from "lucide-react";
import HoldButton from "@/components/kokonutui/hold-button";
import InlineAlert, { type InlineAlertTone } from "@/components/kokonutui/inline-alert";
import { StepUpDialog } from "@/components/admin/StepUpDialog";
import { useAdminAction } from "@/components/admin/orders/useAdminAction";import {
  markWhatsappManualSent,
  createWhatsappCampaign,
  previewWhatsappAudience,
  sendWhatsappBatch,
  sendWhatsappTest,
} from "@/services/admin/whatsapp.actions";
import {
  listWhatsappManual,
  whatsappManualCsvUrl,
} from "@/services/admin/whatsapp";
import { ApiError } from "@/services/api/client";
import {
  CAMPAIGN_SEGMENT_LABELS,
  type CampaignSegment,
  type SendBatchResult,
  type WhatsappAudiencePreview,
  type WhatsappManualListResponse,
  type WhatsappStatus,
} from "@/types/admin";

// Difusión por WhatsApp (ADM-8).
//
// Con WhatsApp Cloud API configurado: audiencia → mensaje con variables →
// prueba al teléfono del admin → envío por lotes de 20 con Hold Button.
// Sin configuración: MODO MANUAL — enlaces wa.me uno a uno, copiar mensaje,
// CSV y marcar enviado. Nunca se simula un envío automático.

const VARIABLES = ["{{nombre}}", "{{ultimoPedido}}", "{{ciudad}}"] as const;

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-card px-3 text-sm text-carbon placeholder:text-coffee focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const LABEL_CLASS =
  "text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase";

const BUTTON_CLASS =
  "inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-coffee-deep transition-colors hover:text-carbon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

type SendProgress = {
  sent: number;
  failed: number;
  errors: SendBatchResult["errors"];
  dailyLimitReached: boolean;
};

type StatusAlert = { tone: InlineAlertTone; title: string; message?: string };

function previewMessage(
  body: string,
  nombre = "Ana",
  ultimoPedido = "UPBUY-2026-000011",
  ciudad = "Medellín",
) {
  return body
    .replace(/\{\{\s*nombre\s*\}\}/g, nombre)
    .replace(/\{\{\s*ultimoPedido\s*\}\}/g, ultimoPedido)
    .replace(/\{\{\s*ciudad\s*\}\}/g, ciudad);
}

export function WhatsAppPanel({ status }: { status: WhatsappStatus }) {
  const [segment, setSegment] = useState<CampaignSegment>("todos");
  const [audience, setAudience] = useState<WhatsappAudiencePreview | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [body, setBody] = useState("");
  const [testSent, setTestSent] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [progress, setProgress] = useState<SendProgress | null>(null);
  const [manual, setManual] = useState<WhatsappManualListResponse | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const action = useAdminAction();

  // Audiencia: conteo + inválidos del segmento.
  useEffect(() => {
    let alive = true;
    setAudienceLoading(true);
    previewWhatsappAudience(segment)
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

  const configured = status.configured;
  const quotaText = `${status.sentToday}/${status.dailyLimit} mensajes hoy`;

  const canSend =
    configured &&
    body.trim().length > 0 &&
    (audience?.count ?? 0) > 0 &&
    testSent;

  const alerts = useMemo<StatusAlert[]>(() => {
    if (!configured) {
      return [
        {
          tone: "warning",
          title: "WhatsApp no configurado",
          message:
            "Faltan WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN o la plantilla marketing aprobada por Meta en el backend. Mientras tanto, abajo tienes el modo manual: envíos uno a uno con tu propio WhatsApp. No se simula ningún envío.",
        },
      ];
    }
    if (!status.templateMarketing) {
      return [
        {
          tone: "warning",
          title: "Falta la plantilla de difusión",
          message:
            "La difusión por WhatsApp solo funciona con una plantilla MARKETING aprobada en Meta Business (WHATSAPP_TEMPLATE_MARKETING).",
        },
      ];
    }
    return [];
  }, [configured, status.templateMarketing]);

  // Mensaje renderizado para la vista previa tipo burbuja.
  const bubbleText = previewMessage(body || "Hola {{nombre}}…");

  const runTestSend = useCallback(async () => {
    setTestSending(true);
    setPageError(null);
    try {
      await sendWhatsappTest({ body: body.trim() });
      setTestSent(true);
    } catch (error) {
      setPageError(
        error instanceof ApiError ? error.message : "No se pudo enviar la prueba.",
      );
    } finally {
      setTestSending(false);
    }
  }, [body]);

  const doSend = useCallback(async () => {
    setPageError(null);
    const cleanBody = body.trim();
    const targetCount = audience?.count ?? 0;

    if (!canSend || !audience) return;

    const created = await createWhatsappCampaign({
      body: cleanBody,
      segment,
    });

    const totals: SendProgress = {
      sent: 0,
      failed: 0,
      errors: [],
      dailyLimitReached: false,
    };
    setProgress({ ...totals });

    // Lote a lote (20) hasta que el backend no tenga pendientes.
    let guard = 0;
    while (guard < 200) {
      guard += 1;
      const batch = await sendWhatsappBatch(created.campaign.id);
      totals.sent += batch.sent;
      totals.failed += batch.failed;
      totals.errors.push(...batch.errors);
      totals.dailyLimitReached = Boolean(batch.dailyLimitReached);
      setProgress({ ...totals });

      if (batch.done || batch.dailyLimitReached) break;
      if (batch.remaining <= 0) break;
    }
  }, [audience, body, canSend, segment]);

  const sendNow = useCallback(() => {
    action
      .run(doSend)
      .catch(() => {
        // El mensaje queda en action.error / pageError.
      });
  }, [action, doSend]);

  // -------------------------------------------------------------------------
  // Modo manual (sin configuración)
  // -------------------------------------------------------------------------

  const loadManual = useCallback(async () => {
    setPageError(null);
    const cleanBody = body.trim();
    if (!cleanBody) {
      setPageError("Escribe el mensaje antes de preparar el modo manual.");
      return;
    }
    try {
      const created = await createWhatsappCampaign({
        body: cleanBody,
        segment,
      });
      const data = await listWhatsappManual(created.campaign.id);
      setManual(data);
    } catch (error) {
      setPageError(
        error instanceof ApiError ? error.message : "No se pudo preparar el modo manual.",
      );
    }
  }, [body, segment]);

  const copyMessage = useCallback(async (row: { recipientId: string; message: string }) => {
    try {
      await navigator.clipboard.writeText(row.message);
      setCopiedId(row.recipientId);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Sin permiso de portapapeles: el usuario puede copiar a mano.
    }
  }, []);

  const markSent = useCallback(
    async (recipientId: string) => {
      if (!manual) return;
      try {
        await markWhatsappManualSent({
          campaignId: manual.campaignId,
          recipientId,
        });
        setManual((current) =>
          current
            ? {
                ...current,
                rows: current.rows.map((row) =>
                  row.recipientId === recipientId
                    ? { ...row, status: "sent", error: null }
                    : row,
                ),
              }
            : current,
        );
      } catch (error) {
        setPageError(
          error instanceof ApiError ? error.message : "No se pudo marcar el envío.",
        );
      }
    },
    [manual],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6">
      {pageError ? (
        <InlineAlert message={pageError} title="No se pudo completar la acción" tone="danger" />
      ) : null}

      {/* Estado de configuración */}
      <section aria-label="Estado de WhatsApp" className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-coffee/10 text-coffee-deep">
              <MessageCircle aria-hidden="true" className="size-4" />
            </span>
            <div>
              <p className="font-semibold text-sm text-carbon">
                {configured
                  ? `WhatsApp Cloud API activo · plantilla ${status.templateMarketing}`
                  : "WhatsApp Cloud API sin configurar · modo manual"}
              </p>
              <p className="text-[13px] text-coffee-deep tabular-nums">
                Cuota: {quotaText}
                {configured ? ` · Envío por lotes de 20 · API ${status.apiVersion}` : ""}
              </p>
            </div>
          </div>
        </div>
      </section>

      {alerts.map((alert) => (
        <InlineAlert
          key={alert.title}
          message={alert.message}
          title={alert.title}
          tone={alert.tone}
        />
      ))}

      {/* Audiencia */}
      <section aria-label="Audiencia" className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3">
          <div>
            <p className="font-semibold text-sm text-carbon">Audiencia</p>
            <p className="text-[13px] text-coffee-deep">
              Consentimiento explícito de WhatsApp (whatsappOptIn), sin baja de
              WhatsApp y teléfono colombiano válido. El consentimiento de email
              no se hereda entre canales.
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
                ? `${audience.count} elegibles · ${audience.invalidCount} excluidos por teléfono inválido`
                : "No se pudo calcular la audiencia."}
          </p>
          {audience && audience.invalidCount > 0 ? (
            <InlineAlert
              title={`${audience.invalidCount} usuarios sin teléfono válido`}
              message="Se excluyen de la difusión: su teléfono no es un celular colombiano normalizable. Corrigen su perfil en la gestión de usuarios."
              tone="info"
            />
          ) : null}
        </div>
      </section>

      {/* Composición */}
      <section aria-label="Contenido del mensaje" className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className={LABEL_CLASS} htmlFor="whatsapp-mensaje">
              Mensaje (máx. 1024 caracteres)
            </label>
            <textarea
              className={`${FIELD_CLASS} min-h-40 py-2`}
              id="whatsapp-mensaje"
              maxLength={1024}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Hola {{nombre}}, nueva colección UPBUY con {{ultimoPedido}}…"
              rows={8}
              value={body}
            />
            <div className="flex flex-wrap gap-2">
              {VARIABLES.map((variable) => (
                <button
                  className="inline-flex min-h-8 items-center rounded-full bg-muted px-3 text-xs font-semibold text-coffee-deep transition-colors hover:text-carbon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  key={variable}
                  onClick={() => setBody((current) => `${current}${current ? " " : ""}${variable}`)}
                  type="button"
                >
                  {variable}
                </button>
              ))}
            </div>
            <p className="text-xs text-coffee-deep">
              Se envía como único parámetro de la plantilla aprobada por Meta.
            </p>
          </div>

          {/* Vista previa tipo burbuja */}
          <div className="flex flex-col gap-2">
            <span className={LABEL_CLASS}>Vista previa</span>
            <div className="max-w-sm self-end rounded-2xl rounded-br-sm bg-[#DCF7C5] px-4 py-3 text-sm text-[#0B0B0B]">
              {bubbleText}
            </div>
            <p className="text-xs text-coffee-deep">
              La burbuja es una muestra con datos ficticios: el mensaje real se
              renderiza por destinatario en el servidor.
            </p>
          </div>
        </div>
      </section>

      {configured ? (
        <>
          {/* Prueba */}
          <section aria-label="Prueba" className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-coffee-deep">
                La prueba llega <strong>solo al teléfono de tu cuenta de admin</strong>. Envía
                primero la prueba.
              </p>
              <button
                className={BUTTON_CLASS}
                disabled={testSending || !body.trim()}
                onClick={runTestSend}
                type="button"
              >
                {testSending ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Send aria-hidden="true" className="size-4" />
                )}
                Enviar prueba
              </button>
            </div>
            {testSent ? (
              <InlineAlert
                message="Revisa tu WhatsApp: si llegó bien, ya puedes lanzar la difusión."
                title="Prueba enviada"
                tone="success"
              />
            ) : null}
          </section>

          {/* Envío */}
          <section aria-label="Envío de la difusión" className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-coffee-deep">
                Envío por lotes de 20. Reintenta sin duplicar: cada lote reclama
                destinatarios pendientes con consentimiento vigente.
              </p>
              <HoldButton
                disabled={!canSend}
                holdingLabel="Mantén presionado…"
                onHoldComplete={sendNow}
              >
                <span className="inline-flex items-center gap-2">
                  <Send aria-hidden="true" className="size-4" />
                  Enviar difusión
                </span>
              </HoldButton>
            </div>

            {action.busy ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-coffee-deep">
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                Enviando lotes…
              </p>
            ) : null}

            {progress ? (
              <div aria-live="polite" className="mt-3 grid gap-2 text-sm">
                <p className="tabular-nums text-coffee-deep">
                  Enviados: {progress.sent} · Fallidos: {progress.failed}
                  {progress.dailyLimitReached ? " · Techo diario alcanzado (el cron continúa)" : ""}
                </p>
                {progress.errors.length > 0 ? (
                  <InlineAlert
                    title={`${progress.errors.length} envíos fallidos`}
                    message={progress.errors
                      .slice(0, 5)
                      .map((error) => `${error.phone ?? error.email ?? error.userId}: ${error.error}`)
                      .join(" · ")}
                    tone="danger"
                  />
                ) : null}
              </div>
            ) : null}
          </section>
        </>
      ) : (
        /* Modo manual */
        <section aria-label="Modo manual" className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-col gap-3">
            <div>
              <p className="font-semibold text-sm text-carbon">Modo manual (uno a uno)</p>
              <p className="text-[13px] text-coffee-deep">
                Sin la Cloud API no hay envío automatizado: aquí se listan los
                mensajes con enlace «Abrir WhatsApp» para enviarlos desde tu
                propio WhatsApp. Tú los marcas como enviados.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={BUTTON_CLASS} onClick={loadManual} type="button">
                <RotateCcw aria-hidden="true" className="size-4" />
                Preparar lista manual
              </button>
              {manual ? (
                <a
                  className={BUTTON_CLASS}
                  download={`campana-whatsapp-${manual.campaignId}.csv`}
                  href={whatsappManualCsvUrl(manual.campaignId)}
                >
                  <Download aria-hidden="true" className="size-4" />
                  Exportar CSV
                </a>
              ) : null}
            </div>

            {manual ? (
              <ul className="grid gap-3" role="list">
                {manual.rows.map((row) => (
                  <li
                    className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[1fr_auto]"
                    key={row.recipientId}
                  >
                    <div className="grid gap-1">
                      <p className="text-sm font-semibold text-carbon">
                        {row.name || "Cliente"} · {row.phone ?? "sin teléfono"}
                      </p>
                      <p className="text-[13px] text-coffee-deep">{row.message}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {row.status === "sent" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#DCF7C5] px-3 text-xs font-semibold text-[#2F5D0A]">
                          <Check aria-hidden="true" className="size-3.5" />
                          Enviado
                        </span>
                      ) : null}
                      {row.waMeLink ? (
                        <a
                          className={BUTTON_CLASS}
                          href={row.waMeLink}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          <ExternalLink aria-hidden="true" className="size-4" />
                          Abrir WhatsApp
                        </a>
                      ) : (
                        <span className="text-xs text-coffee-deep">Teléfono inválido</span>
                      )}
                      <button
                        className={BUTTON_CLASS}
                        onClick={() => copyMessage(row)}
                        type="button"
                      >
                        {copiedId === row.recipientId ? (
                          <Check aria-hidden="true" className="size-4" />
                        ) : (
                          <Copy aria-hidden="true" className="size-4" />
                        )}
                        Copiar mensaje
                      </button>
                      {row.status !== "sent" ? (
                        <button
                          className={BUTTON_CLASS}
                          onClick={() => markSent(row.recipientId)}
                          type="button"
                        >
                          <Check aria-hidden="true" className="size-4" />
                          Marcar enviado
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      )}

      <StepUpDialog
        actionLabel="Verificar y enviar"
        description="Para enviar esta difusión necesitas tu segundo factor."
        onOpenChange={action.setStepUpOpen}
        onVerified={() => action.retry()}
        open={action.stepUpOpen}
      />
    </div>
  );
}
