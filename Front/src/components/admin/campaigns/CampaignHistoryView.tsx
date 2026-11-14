"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import Loader from "@/components/kokonutui/loader";
import EmptyState from "@/components/kokonutui/empty-state";
import InlineAlert from "@/components/kokonutui/inline-alert";
import { listCampaigns } from "@/services/admin/campaigns";
import { ApiError } from "@/services/api/client";
import { CAMPAIGN_STATUS_LABELS, type CampaignListResponse } from "@/types/admin";

// Historial de campañas de difusión (ADM-7).

const thClass = "px-3 py-2 font-semibold";

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";

export function CampaignHistoryView() {
  const [data, setData] = useState<CampaignListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    listCampaigns()
      .then((result) => {
        if (alive) setData(result);
      })
      .catch((err) => {
        if (alive) {
          setError(
            err instanceof ApiError
              ? err.message
              : "No se pudieron cargar las campañas.",
          );
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  if (loading && !data) {
    return (
      <Loader
        className="py-16 text-carbon"
        subtitle="Historial de difusión"
        title="Cargando campañas"
      />
    );
  }

  if (error) {
    return (
      <InlineAlert
        action={{ label: "Reintentar", onClick: retry }}
        message={error}
        title="No pudimos cargar las campañas"
        tone="danger"
      />
    );
  }

  if (!data || data.campaigns.length === 0) {
    return (
      <EmptyState
        description="Cuando envíes la primera difusión por email aparecerá aquí con su estado, enviados y fallidos."
        title="Sin campañas todavía"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-coffee-deep tabular-nums">
        {data.total} campaña{data.total === 1 ? "" : "s"} en total
      </p>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-left text-sm text-carbon">
          <caption className="sr-only">
            Historial de campañas de difusión por email
          </caption>
          <thead className="border-b border-border bg-muted text-[11px] tracking-[0.12em] text-coffee-deep uppercase">
            <tr>
              <th className={thClass} scope="col">Asunto</th>
              <th className={thClass} scope="col">Audiencia</th>
              <th className={thClass} scope="col">Estado</th>
              <th className={thClass} scope="col">Enviados</th>
              <th className={thClass} scope="col">Fallidos</th>
              <th className={thClass} scope="col">Creada</th>
            </tr>
          </thead>
          <tbody>
            {data.campaigns.map((campaign) => (
              <tr className="border-b border-border/60 last:border-0" key={campaign.id}>
                <td className="px-3 py-3 font-medium">{campaign.subject}</td>
                <td className="px-3 py-3 text-coffee-deep">{campaign.segment}</td>
                <td className="px-3 py-3">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[12px] font-semibold text-coffee-deep">
                    {CAMPAIGN_STATUS_LABELS[campaign.status] ?? campaign.status}
                  </span>
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {campaign.sentCount}/{campaign.totalRecipients}
                </td>
                <td className="px-3 py-3 tabular-nums">{campaign.failedCount}</td>
                <td className="px-3 py-3 text-[13px] text-coffee-deep">
                  {formatDate(campaign.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        className="inline-flex h-11 items-center gap-2 self-start rounded-lg border border-border px-4 text-sm font-semibold text-coffee-deep transition-colors hover:text-carbon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={retry}
        type="button"
      >
        <RotateCcw aria-hidden="true" className="size-4" />
        Actualizar
      </button>
    </div>
  );
}
