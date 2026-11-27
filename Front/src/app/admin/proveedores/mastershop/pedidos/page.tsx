import type { Metadata } from "next";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  PackageSearch,
  TriangleAlert,
} from "lucide-react";
import { listMastershopAttentionOrders } from "@/services/admin/mastershop";
import { ApiError } from "@/services/api/client";
import { formatDateTime, formatPrice } from "@/lib/format";
import {
  ADMIN_MASTERSHOP_CANCEL_STATE_LABELS,
  ADMIN_MASTERSHOP_SYNC_STATE_LABELS,
  type AdminMastershopAttentionOrder,
} from "@/types/admin";
import { FulfillmentBadge, PaymentBadge } from "@/components/admin/orders/OrderBadges";
import { MastershopRetryButton } from "@/components/admin/providers/MastershopRetryButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pedidos MasterShop — Panel UPBUY",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 20;

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string =>
  typeof value === "string" ? value : "";

const isIssue = (value: string): value is "sync" | "cancel" =>
  value === "sync" || value === "cancel";

export default async function MastershopOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;

  const issueParam = one(raw.issue);
  const issue = isIssue(issueParam) ? issueParam : "all";
  const q = one(raw.q).trim().slice(0, 120);

  const requestedPage = Math.max(1, Number(one(raw.page)) || 1);

  const load = (page: number) =>
    listMastershopAttentionOrders({
      issue,
      q: q || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });

  let result;
  try {
    result = await load(requestedPage);
  } catch (error) {
    return <MastershopOrdersError error={error} />;
  }

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  if (page !== requestedPage) {
    try {
      result = await load(page);
    } catch (error) {
      return <MastershopOrdersError error={error} />;
    }
  }

  const { counts } = result;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <nav aria-label="Ruta" className="text-xs text-muted-foreground">
            <Link href="/admin/proveedores" className="hover:underline">
              Proveedores
            </Link>{" "}
            /{" "}
            <Link
              href="/admin/proveedores/mastershop"
              className="hover:underline"
            >
              MasterShop
            </Link>{" "}
            / Pedidos
          </nav>
          <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight text-carbon">
            Pedidos MasterShop por resolver
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Pedidos que no pudieron crearse o cancelarse en MasterShop. Revisa el
            motivo y reintenta sin salir del panel. UpBuy sigue siendo la fuente
            de verdad: reintentar nunca revierte el pedido local.
          </p>
        </div>
      </header>

      <section
        aria-label="Resumen de pedidos por resolver"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <CountCard label="Por revisar" value={counts.needsReview} tone="amber" />
        <CountCard label="Falló la creación" value={counts.failed} tone="rose" />
        <CountCard
          label="Cancelación pendiente"
          value={counts.cancelPending}
          tone="amber"
        />
        <CountCard
          label="Cancelación fallida"
          value={counts.cancelFailed}
          tone="rose"
        />
      </section>

      <form
        method="get"
        className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4"
      >
        <div className="min-w-[12rem] flex-1">
          <label
            htmlFor="q"
            className="block text-xs font-semibold text-carbon"
          >
            Buscar
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Número de pedido, cliente o correo"
            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-carbon placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="issue"
            className="block text-xs font-semibold text-carbon"
          >
            Motivo
          </label>
          <select
            id="issue"
            name="issue"
            defaultValue={issue}
            className="mt-1 h-10 rounded-lg border border-border bg-background px-3 text-sm text-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="all">Todos</option>
            <option value="sync">Creación</option>
            <option value="cancel">Cancelación</option>
          </select>
        </div>
        <button
          type="submit"
          className="h-10 rounded-lg bg-carbon px-4 text-sm font-semibold text-cream hover:bg-terracotta-deep"
        >
          Filtrar
        </button>
        <Link
          href="/admin/proveedores/mastershop/pedidos"
          className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-carbon hover:border-carbon"
        >
          Limpiar
        </Link>
      </form>

      {result.orders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-14 text-center">
          <CheckCircle2
            className="h-8 w-8 text-emerald-700"
            aria-hidden="true"
          />
          <h2 className="font-heading text-lg font-semibold text-carbon">
            Nada pendiente por aquí
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            No hay pedidos de MasterShop con estos filtros. Si esperabas ver
            alguno, revisa el rango o limpia la búsqueda.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card lg:block">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="bg-muted/50 text-xs tracking-wide text-coffee-deep uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Pedido
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Cliente
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Motivo
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Estado en MasterShop
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Último intento
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.orders.map((order) => (
                  <tr key={order.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/pedidos/${order.id}`}
                        className="font-semibold text-carbon underline-offset-4 hover:text-terracotta-deep hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(order.createdAt)}
                      </p>
                      <p className="text-xs font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                        {formatPrice(order.total)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-carbon">{clientName(order)}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.phone || order.email || "—"}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <PaymentBadge value={order.paymentState} />
                        <FulfillmentBadge value={order.fulfillmentStatus} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <IssueBadge issue={order.issue} />
                      <p className="mt-1 max-w-[22rem] text-xs break-words text-coffee-deep">
                        {reasonOf(order)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-coffee-deep">
                      <p>
                        {order.issue === "cancel"
                          ? `Cancelación: ${
                              ADMIN_MASTERSHOP_CANCEL_STATE_LABELS[
                                order.msCancelState ?? ""
                              ] ?? order.msCancelState ?? "—"
                            }`
                          : `Creación: ${
                              ADMIN_MASTERSHOP_SYNC_STATE_LABELS[
                                order.msSyncState ?? ""
                              ] ?? order.msSyncState ?? "—"
                            }`}
                      </p>
                      {order.msCancelState ? (
                        <p className="mt-0.5 text-muted-foreground">
                          intentos: {order.msCancelAttempts}
                        </p>
                      ) : null}
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {order.msIdOrder
                          ? `idOrder ${order.msIdOrder}`
                          : "Sin idOrder"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-coffee-deep">
                      {order.lastAttempt ? (
                        <>
                          <p>
                            {order.lastAttempt.action === "cancel"
                              ? "Cancelación"
                              : order.lastAttempt.action === "recover"
                                ? "Recuperación"
                                : "Creación"}{" "}
                            · {order.lastAttempt.ok ? "OK" : "falló"}
                            {order.lastAttempt.httpStatus
                              ? ` · HTTP ${order.lastAttempt.httpStatus}`
                              : ""}
                          </p>
                          <p className="mt-0.5 text-muted-foreground">
                            {formatDateTime(order.lastAttempt.createdAt)}
                          </p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <MastershopRetryButton id={order.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="grid gap-3 lg:hidden">
            {result.orders.map((order) => (
              <li
                key={order.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/admin/pedidos/${order.id}`}
                      className="font-semibold text-carbon underline-offset-4 hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(order.createdAt)}
                    </p>
                  </div>
                  <p className="font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                    {formatPrice(order.total)}
                  </p>
                </div>
                <p className="mt-2 text-sm text-carbon">{clientName(order)}</p>
                <p className="text-xs text-muted-foreground">
                  {order.phone || order.email || "—"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <IssueBadge issue={order.issue} />
                  <PaymentBadge value={order.paymentState} />
                  <FulfillmentBadge value={order.fulfillmentStatus} />
                </div>
                <p className="mt-2 text-xs break-words text-coffee-deep">
                  {reasonOf(order)}
                </p>
                <div className="mt-3 border-t border-border pt-3">
                  <MastershopRetryButton id={order.id} />
                </div>
              </li>
            ))}
          </ul>

          <Pagination page={page} totalPages={totalPages} issue={issue} q={q} />
        </>
      )}

      <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Un pedido cancelado en UpBuy que ya existía en MasterShop se reintenta
        como cancelación. Uno que nunca llegó al proveedor no se recrea: no hay
        nada que despachar.
      </p>
    </div>
  );
}

function clientName(order: AdminMastershopAttentionOrder): string {
  return order.recipientName || order.email || order.phone || "—";
}

function reasonOf(order: AdminMastershopAttentionOrder): string {
  const raw = order.issue === "cancel" ? order.msCancelError : order.msSyncError;
  if (!raw) return "Sin detalle registrado.";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const parts = [parsed.motivo, parsed.detalle]
      .filter((value) => typeof value === "string" && value.trim())
      .map((value) => String(value));
    const failed = Array.isArray(parsed.itemsSinResolver)
      ? parsed.itemsSinResolver.length
      : 0;
    if (failed > 0) parts.push(`${failed} ítem(s) sin mapear`);
    const errors = Array.isArray(parsed.errors) ? parsed.errors : [];
    if (errors.length > 0) parts.push(`${errors.length} error(es) de payload`);
    return parts.length ? parts.join(" — ") : raw;
  } catch {
    return raw;
  }
}

function CountCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "rose";
}) {
  const toneClass =
    value === 0
      ? "border-border bg-card text-carbon"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-xs font-semibold tracking-wide uppercase">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold [font-variant-numeric:tabular-nums]">
        {value}
      </p>
    </div>
  );
}

function IssueBadge({ issue }: { issue: "sync" | "cancel" }) {
  return (
    <span
      className={
        issue === "cancel"
          ? "inline-flex items-center rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-rose-900"
          : "inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-amber-900"
      }
    >
      {issue === "cancel" ? "Cancelación" : "Creación"}
    </span>
  );
}

function Pagination({
  page,
  totalPages,
  issue,
  q,
}: {
  page: number;
  totalPages: number;
  issue: string;
  q: string;
}) {
  if (totalPages <= 1) return null;

  const href = (target: number) => {
    const params = new URLSearchParams();
    if (issue !== "all") params.set("issue", issue);
    if (q) params.set("q", q);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query
      ? `/admin/proveedores/mastershop/pedidos?${query}`
      : "/admin/proveedores/mastershop/pedidos";
  };

  return (
    <nav
      aria-label="Paginación de pedidos MasterShop"
      className="flex items-center justify-between gap-3"
    >
      {page > 1 ? (
        <Link
          href={href(page - 1)}
          rel="prev"
          className="inline-flex h-10 items-center gap-1 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon hover:border-carbon"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="text-xs text-muted-foreground">
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link
          href={href(page + 1)}
          rel="next"
          className="inline-flex h-10 items-center gap-1 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon hover:border-carbon"
        >
          Siguiente
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function MastershopOrdersError({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError
      ? error.message
      : "No se pudieron cargar los pedidos de MasterShop.";

  return (
    <div
      role="alert"
      className="rounded-xl border border-terracotta/30 bg-terracotta/5 p-6"
    >
      <h1 className="flex items-center gap-2 font-heading text-lg font-semibold text-carbon">
        <PackageSearch className="h-5 w-5" aria-hidden="true" />
        No pudimos cargar los pedidos
      </h1>
      <p className="mt-1 text-sm text-coffee-deep">{message}</p>
      <Link
        href="/admin/proveedores/mastershop/pedidos"
        className="mt-4 inline-flex h-10 items-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream hover:bg-terracotta-deep"
      >
        Reintentar
      </Link>
    </div>
  );
}