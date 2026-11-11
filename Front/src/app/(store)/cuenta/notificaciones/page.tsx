import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { listNotifications } from "@/services/notifications/queries";
import { ApiError } from "@/services/api/client";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { NotificationToolbar } from "@/components/notifications/NotificationToolbar";
import type { NotificationList } from "@/types/notification";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Notificaciones — UPBUY",
  robots: { index: false, follow: false },
};

type NotificationsPageProps = {
  searchParams: Promise<{ pagina?: string }>;
};

const PAGE_SIZE = 20;

export default async function NotificationsPage({
  searchParams,
}: NotificationsPageProps) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.pagina) || 1);

  let result: NotificationList;
  try {
    result = await listNotifications({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) {
      redirect("/login?next=/cuenta/notificaciones");
    }
    return (
      <div
        role="alert"
        className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground"
      >
        No pudimos cargar tus notificaciones. Vuelve a intentarlo en unos
        segundos.
      </div>
    );
  }

  if (result.total === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-coffee-deep">
          <Bell className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="font-heading text-xl font-semibold text-carbon">
          No tienes notificaciones
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Aquí verás los avisos de tus pedidos y de tu cuenta.
        </p>
        <Link
          href="/productos"
          className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-carbon px-6 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
        >
          Ver la colección
        </Link>
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-heading text-lg font-semibold text-carbon">
            Tus notificaciones
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total}{" "}
            {result.total === 1 ? "notificación" : "notificaciones"} ·{" "}
            {result.unread > 0
              ? `${result.unread} sin leer`
              : "Todo al día"}
          </p>
        </div>
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
              href={`/cuenta/notificaciones?pagina=${page - 1}`}
              className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon hover:border-carbon"
            >
              Anterior
            </Link>
          ) : null}
          <span className="text-xs text-muted-foreground [font-variant-numeric:tabular-nums]">
            Página {page} de {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={`/cuenta/notificaciones?pagina=${page + 1}`}
              className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon hover:border-carbon"
            >
              Siguiente
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
