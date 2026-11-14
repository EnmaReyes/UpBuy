import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { listNotifications } from "@/services/notifications/queries";
import { ApiError } from "@/services/api/client";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { NotificationToolbar } from "@/components/notifications/NotificationToolbar";
import { BrowserAlertsToggle } from "@/components/admin/notifications/BrowserAlertsToggle";
import type { NotificationList } from "@/types/notification";

// Bandeja del panel. Los avisos de compra ya enlazan a `/admin/pedidos/:id`
// (creados por `notifyAdminsOfNewOrder`), así que se mantiene una sola bandeja
// dentro del área administrativa en lugar de saltar a `/cuenta/notificaciones`.
// Marcar como leída al abrir y "marcar todas" los resuelven los componentes
// compartidos, que usan `services/notifications`.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Notificaciones — Panel UPBUY",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 20;

type SearchParams = { pagina?: string };

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const requestedPage = Math.max(1, Number(params.pagina) || 1);

  let result: NotificationList;
  try {
    result = await listNotifications({
      limit: PAGE_SIZE,
      offset: (requestedPage - 1) * PAGE_SIZE,
    });
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) {
      redirect("/login?next=/admin/notificaciones");
    }
    return (
      <div
        role="alert"
        className="rounded-xl border border-terracotta/30 bg-terracotta/5 p-6 text-sm text-coffee-deep"
      >
        No pudimos cargar las notificaciones. Vuelve a intentarlo en unos
        segundos.
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-carbon">
          Notificaciones
        </h1>
        <p className="mt-1 text-sm text-coffee-deep">
          Avisos de compras web y de la operación del panel.
        </p>
      </header>

      <BrowserAlertsToggle />

      {result.total === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-coffee-deep">
            <Bell className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="font-heading text-lg font-semibold text-carbon">
            No hay notificaciones
          </h2>
          <p className="max-w-sm text-sm text-coffee-deep">
            Cuando entre una compra web aparecerá aquí y en los avisos en vivo
            del panel.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <p className="text-sm text-coffee-deep">
              {result.total}{" "}
              {result.total === 1 ? "notificación" : "notificaciones"} ·{" "}
              {result.unread > 0
                ? `${result.unread} sin leer`
                : "Todo al día"}
            </p>
            <NotificationToolbar hasUnread={result.unread > 0} />
          </div>

          <ul className="grid gap-3">
            {result.notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
              />
            ))}
          </ul>

          {pageCount > 1 ? (
            <nav
              aria-label="Paginación de notificaciones"
              className="flex items-center justify-center gap-2"
            >
              {page > 1 ? (
                <Link
                  href={`/admin/notificaciones?pagina=${page - 1}`}
                  className="inline-flex h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon hover:border-carbon"
                >
                  Anterior
                </Link>
              ) : null}
              <span className="text-xs text-coffee-deep [font-variant-numeric:tabular-nums]">
                Página {page} de {pageCount}
              </span>
              {page < pageCount ? (
                <Link
                  href={`/admin/notificaciones?pagina=${page + 1}`}
                  className="inline-flex h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon hover:border-carbon"
                >
                  Siguiente
                </Link>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
