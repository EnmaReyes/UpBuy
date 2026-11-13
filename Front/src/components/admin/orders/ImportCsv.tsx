"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Download, FileUp, TriangleAlert } from "lucide-react";
import FileUpload from "@/components/kokonutui/file-upload";
import {
  dryRunImportCsv,
  importOrdersCsv,
} from "@/services/admin/orders.actions";
import { ApiError } from "@/services/api/client";
import { formatPrice } from "@/lib/format";
import type {
  AdminImportDryRun,
  AdminImportResult,
  AdminImportRowError,
} from "@/types/admin";
import { useAdminAction } from "./useAdminAction";

// Importacion de ventas desde CSV (ADM-3).
//
// El flujo es deliberadamente de dos pasos:
//   1. Vista previa (dry run): el servidor analiza el archivo y devuelve los
//      errores por fila SIN escribir nada.
//   2. Confirmacion: se importa de verdad.
//
// El componente de subida es el de Kokonut (`@kokonutui/file-upload`), que ya
// vive en `components/kokonutui/`.

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 2000;

const TEMPLATE_HEADER =
  "fecha,nombre,telefono,email,direccion,ciudad,departamento,sku,producto,talla,cantidad,total,costo_proveedor,metodo_pago,estado,guia,transportadora,notas,ref_externa";

const TEMPLATE_ROW =
  "2026-11-01,Ana Pérez,3001234567,ana@correo.com,Calle 1 #2-3,Medellín,Antioquia,UPBUY-001,Camiseta oversize,M,2,120000,60000,efectivo,entregado,GUIA-123,Coordinadora,Cliente de mostrador,VEN-0001";

const messageFor = (error: unknown): string =>
  error instanceof ApiError
    ? error.message
    : "No se pudo procesar el archivo.";

export function ImportCsv({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const { busy, error: actionError, run } = useAdminAction();

  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState<AdminImportDryRun | null>(null);
  const [result, setResult] = useState<AdminImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readFile = async (file: File) => {
    setError(null);
    setResult(null);
    setDryRun(null);

    if (file.size > MAX_BYTES) {
      setCsv(null);
      setFileName(null);
      setError(
        `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es 2 MB.`,
      );
      return;
    }

    const text = await file.text();
    setCsv(text);
    setFileName(file.name);

    // Primera pasada: vista previa. El backend NO escribe nada.
    try {
      const analysis = await dryRunImportCsv(text);
      setDryRun(analysis);
      if (analysis.summary.totalRows > MAX_ROWS) {
        setError(
          `El archivo tiene ${analysis.summary.totalRows} filas y el máximo es ${MAX_ROWS}.`,
        );
      }
    } catch (caught) {
      setCsv(null);
      setFileName(null);
      setError(messageFor(caught));
    }
  };

  const confirm = async () => {
    if (!csv) return;
    setError(null);

    await run(async () => {
      const imported = await importOrdersCsv(csv);
      setResult(imported);
      setDryRun(null);
    }).catch((caught) => {
      setError(messageFor(caught));
    });
  };

  const downloadTemplate = () => {
    const blob = new Blob([`${TEMPLATE_HEADER}\n${TEMPLATE_ROW}\n`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "plantilla-pedidos.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const canConfirm =
    canWrite &&
    !busy &&
    csv !== null &&
    (dryRun?.summary.valid ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Subir archivo de pedidos"
        className="rounded-xl border border-border bg-card p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-base font-semibold text-carbon">
              Archivo de pedidos
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              CSV de hasta 2 MB y {MAX_ROWS} filas. La vista previa no escribe
              nada.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Descargar plantilla
          </button>
        </div>

        <div className="mt-4">
          <FileUpload
            multiple={false}
            maxFiles={1}
            maxFileSize={MAX_BYTES}
            acceptedFileTypes={[".csv", "text/csv"]}
            onUploadSuccess={(file) => void readFile(file)}
            onUploadError={(uploadError) => setError(uploadError.message)}
            validateFile={(file) => {
              if (!/\.csv$/i.test(file.name)) {
                return {
                  message: "El archivo debe ser un CSV (.csv)",
                  code: "INVALID_FILE_TYPE",
                };
              }
              if (file.size > MAX_BYTES) {
                return {
                  message: "El archivo supera los 2 MB",
                  code: "FILE_TOO_LARGE",
                };
              }
              return null;
            }}
          />
        </div>

        {fileName ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <FileUp className="h-4 w-4" aria-hidden="true" />
            {fileName}
          </p>
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

        {actionError ? (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-sm text-terracotta-deep"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {actionError}
          </p>
        ) : null}
      </section>

      {dryRun ? (
        <section
          aria-label="Vista previa de la importación"
          className="rounded-xl border border-border bg-card p-4"
        >
          <h2 className="font-heading text-base font-semibold text-carbon">
            Vista previa
          </h2>

          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
                Filas
              </dt>
              <dd className="mt-1 font-heading text-xl font-bold text-carbon [font-variant-numeric:tabular-nums]">
                {dryRun.summary.totalRows}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
                Se importarán
              </dt>
              <dd className="mt-1 font-heading text-xl font-bold text-carbon [font-variant-numeric:tabular-nums]">
                {dryRun.summary.valid}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
                Con errores
              </dt>
              <dd className="mt-1 font-heading text-xl font-bold text-carbon [font-variant-numeric:tabular-nums]">
                {dryRun.summary.invalid}
              </dd>
            </div>
          </dl>

          {dryRun.errors.length > 0 ? (
            <div className="mt-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-carbon">
                <TriangleAlert
                  className="h-4 w-4 text-terracotta-deep"
                  aria-hidden="true"
                />
                Filas con error ({dryRun.errors.length})
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Las filas con error se saltan; las demás sí se importan.
              </p>
              <ErrorTable rows={dryRun.errors} />
            </div>
          ) : null}

          {dryRun.warnings.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-carbon">
                Avisos ({dryRun.warnings.length})
              </h3>
              <ErrorTable rows={dryRun.warnings} tone="warning" />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void confirm()}
            disabled={!canConfirm}
            className="mt-5 inline-flex h-11 items-center rounded-lg bg-carbon px-5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy
              ? "Importando…"
              : `Importar ${dryRun.summary.valid} pedido(s)`}
          </button>
        </section>
      ) : null}

      {result ? (
        <section
          aria-label="Resultado de la importación"
          className="rounded-xl border border-border bg-card p-4"
        >
          <h2 className="font-heading text-base font-semibold text-carbon">
            Importación terminada
          </h2>

          <dl className="mt-3 grid gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
                Creados
              </dt>
              <dd className="mt-1 font-heading text-xl font-bold text-carbon [font-variant-numeric:tabular-nums]">
                {result.summary.created}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
                Duplicados
              </dt>
              <dd className="mt-1 font-heading text-xl font-bold text-carbon [font-variant-numeric:tabular-nums]">
                {result.summary.duplicates}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
                Con error
              </dt>
              <dd className="mt-1 font-heading text-xl font-bold text-carbon [font-variant-numeric:tabular-nums]">
                {result.summary.invalid + result.summary.failed}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
                Filas
              </dt>
              <dd className="mt-1 font-heading text-xl font-bold text-carbon [font-variant-numeric:tabular-nums]">
                {result.summary.totalRows}
              </dd>
            </div>
          </dl>

          {result.created.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-1">
              {result.created.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/admin/pedidos/${row.id}`)}
                    className="font-semibold text-carbon underline-offset-4 hover:text-terracotta-deep hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {row.orderNumber}
                  </button>
                  <span className="text-muted-foreground [font-variant-numeric:tabular-nums]">
                    {formatPrice(row.total)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {result.duplicates.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-carbon">
                Filas ya existentes ({result.duplicates.length})
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Ya había pedidos con esa referencia externa: no se duplicaron.
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {result.duplicates.map((row) => (
                  <li
                    key={`${row.row}-${row.orderId}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">
                      Fila {row.row} · {row.externalRef ?? "sin referencia"}
                    </span>
                    <span className="font-medium text-carbon">
                      {row.orderNumber}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.errors.length > 0 ? (
            <div className="mt-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-carbon">
                <TriangleAlert
                  className="h-4 w-4 text-terracotta-deep"
                  aria-hidden="true"
                />
                Filas con error ({result.errors.length})
              </h3>
              <ErrorTable rows={result.errors} />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => router.push("/admin/pedidos")}
            className="mt-5 inline-flex h-11 items-center rounded-lg border border-border bg-background px-5 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Ver todos los pedidos
          </button>
        </section>
      ) : null}
    </div>
  );
}

function ErrorTable({
  rows,
  tone = "error",
}: {
  rows: AdminImportRowError[];
  tone?: "error" | "warning";
}) {
  if (rows.length === 0) return null;

  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[28rem] text-left text-sm">
        <caption className="sr-only">
          {tone === "error"
            ? "Filas del archivo con error"
            : "Avisos sobre las filas del archivo"}
        </caption>
        <thead className="bg-muted/50 text-xs tracking-wide text-coffee-deep uppercase">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              Fila
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Campo
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Detalle
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, index) => (
            <tr key={`${row.row}-${row.field}-${index}`}>
              <td className="px-3 py-2 [font-variant-numeric:tabular-nums]">
                {row.row}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{row.field}</td>
              <td
                className={
                  tone === "error" ? "px-3 py-2 text-terracotta-deep" : "px-3 py-2"
                }
              >
                {row.message}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
