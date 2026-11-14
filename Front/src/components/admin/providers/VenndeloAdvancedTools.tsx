"use client";

import { useState } from "react";
import { CircleAlert, Loader2, Wand2 } from "lucide-react";
import { ApiError } from "@/services/api/client";
import {
  createVenndeloOrder,
  quoteVenndeloOrder,
} from "@/services/admin/providers.actions";
import { ADMIN_VENNDELO_ORDER_STATUS_LABELS } from "@/types/admin";

// Herramientas técnicas de Venndelo (ADM-4).
//
// `POST /orders` y `POST /orders/quotation` reenvían el cuerpo tal cual a la
// API del proveedor (ver Back/docs/VENNDELO_WALLET_Y_PEDIDOS.md). La forma
// exacta de `line_items` está pendiente de confirmar contra su OpenAPI, así
// que el panel no inventa campos: ofrece las plantillas documentadas y valida
// el JSON antes de enviarlo.

const QUOTE_TEMPLATE = `{
  "pickup_info": { "name": "Bodega UpBuy", "phone": "3001234567" },
  "shipping_info": {
    "address": "Calle 1 # 2-3",
    "city": "Medellín",
    "department": "Antioquia",
    "recipient_name": "Cliente",
    "phone": "3001234567"
  },
  "line_items": [{ "external_id": "ID_PRODUCTO_VENNDELO", "quantity": 1 }],
  "payment_method_code": "COD"
}`;

const CREATE_TEMPLATE = `{
  "billing_info": {
    "name": "Cliente",
    "email": "cliente@correo.com",
    "phone": "3001234567"
  },
  "shipping_info": {
    "address": "Calle 1 # 2-3",
    "city": "Medellín",
    "department": "Antioquia"
  },
  "line_items": [{ "external_id": "ID_PRODUCTO_VENNDELO", "quantity": 1 }],
  "payment_method_code": "COD",
  "external_order_id": "UPBUY-2026-000001"
}`;

type Mode = "quote" | "create";

export function VenndeloAdvancedTools() {
  const [mode, setMode] = useState<Mode>("quote");
  const [payload, setPayload] = useState(QUOTE_TEMPLATE);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setPayload(next === "quote" ? QUOTE_TEMPLATE : CREATE_TEMPLATE);
    setResult(null);
    setError(null);
  };

  const submit = async () => {
    setBusy(true);
    setResult(null);
    setError(null);

    let parsed: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(payload);
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("El cuerpo debe ser un objeto JSON.");
      }
      parsed = value as Record<string, unknown>;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `JSON inválido: ${caught.message}`
          : "JSON inválido.",
      );
      setBusy(false);
      return;
    }

    try {
      const response =
        mode === "quote"
          ? await quoteVenndeloOrder(parsed)
          : await createVenndeloOrder(parsed);
      setResult(summarize(response));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Venndelo no respondió. Revisa la conexión y reintenta.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className="cursor-pointer px-4 py-3 font-heading text-base font-semibold text-carbon">
        Herramientas avanzadas · cotizar y crear en Venndelo
      </summary>

      <div className="border-t border-border p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          El backend reenvía el cuerpo tal cual a la API de Venndelo. Usa las
          plantillas y ajusta los identificadores reales. Crear un pedido aquí
          no lo registra en UpBuy: para la operación normal usa{" "}
          <a
            href="/admin/pedidos/nuevo"
            className="font-semibold text-terracotta-deep underline-offset-2 hover:underline"
          >
            Nueva venta
          </a>{" "}
          y luego «Enviar al proveedor».
        </p>

        <div className="mt-3 flex gap-2" role="group" aria-label="Operación de Venndelo">
          <button
            type="button"
            onClick={() => switchMode("quote")}
            aria-pressed={mode === "quote"}
            className={
              mode === "quote"
                ? "inline-flex h-9 items-center rounded-lg bg-carbon px-3 text-xs font-semibold text-cream"
                : "inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-xs font-semibold text-carbon"
            }
          >
            Cotizar
          </button>
          <button
            type="button"
            onClick={() => switchMode("create")}
            aria-pressed={mode === "create"}
            className={
              mode === "create"
                ? "inline-flex h-9 items-center rounded-lg bg-carbon px-3 text-xs font-semibold text-cream"
                : "inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-xs font-semibold text-carbon"
            }
          >
            Crear pedido
          </button>
        </div>

        <label
          htmlFor="venndelo-payload"
          className="mt-3 block text-xs font-semibold text-carbon"
        >
          Cuerpo JSON ({mode === "quote" ? "cotización" : "pedido"})
        </label>
        <textarea
          id="venndelo-payload"
          value={payload}
          onChange={(event) => setPayload(event.target.value)}
          rows={14}
          spellCheck={false}
          className="mt-1 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs text-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Wand2 className="h-4 w-4" aria-hidden="true" />
          )}
          {busy
            ? "Enviando…"
            : mode === "quote"
              ? "Solicitar cotización"
              : "Crear pedido en Venndelo"}
        </button>

        {result ? (
          <pre
            role="status"
            className="mt-3 max-h-64 overflow-auto rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"
          >
            {result}
          </pre>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-sm text-terracotta-deep"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}

// Resumen legible sin volcar el objeto completo y con el estado ya traducido.
function summarize(value: unknown): string {
  if (!value || typeof value !== "object") return String(value);
  const record = value as Record<string, unknown>;
  const lines: string[] = [];

  for (const key of [
    "id",
    "order_id",
    "external_order_id",
    "shipping_cost",
    "total",
    "currency",
    "payment_url",
  ]) {
    if (record[key] !== undefined && record[key] !== null) {
      lines.push(`${key}: ${String(record[key])}`);
    }
  }

  const status = String(record.status || "").toUpperCase();
  if (status) {
    lines.push(
      `estado: ${ADMIN_VENNDELO_ORDER_STATUS_LABELS[status] || "Sin estado"}`,
    );
  }

  return lines.length ? lines.join("\n") : "Operación completada.";
}
