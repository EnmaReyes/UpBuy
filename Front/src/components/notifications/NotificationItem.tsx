"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Trash2, UserRound, Bell, Check } from "lucide-react";
import {
  deleteNotification,
  markNotificationRead,
} from "@/services/notifications";
import { ApiError } from "@/services/api/client";
import { safeInternalPath } from "@/lib/safe-url";
import { formatDateTime } from "@/lib/format";
import type { Notification } from "@/types/notification";

// Un aviso de la bandeja. Marcar/eliminar se hace contra el backend y luego
// se refresca el Server Component para actualizar contadores y estilos.
export function NotificationItem({
  notification,
}: {
  notification: Notification;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"read" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const href = safeInternalPath(notification.to);
  const Icon =
    notification.tipo === "pedido"
      ? Package
      : notification.tipo === "cuenta"
        ? UserRound
        : Bell;

  const onRead = async () => {
    setPending("read");
    setError(null);
    try {
      await markNotificationRead(notification.id);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudo marcar la notificación.",
      );
    } finally {
      setPending(null);
    }
  };

  const onDelete = async () => {
    setPending("delete");
    setError(null);
    try {
      await deleteNotification(notification.id);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudo eliminar la notificación.",
      );
    } finally {
      setPending(null);
    }
  };

  // Al abrir el detalle marcamos como leída sin esperar la navegación. El
  // backend ya devuelve el aviso actualizado; el navbar se refresca con el
  // evento que emite el servicio.
  const onOpen = () => {
    if (notification.leida) return;
    void markNotificationRead(notification.id).catch(() => {});
  };

  return (
    <li
      className={[
        "rounded-xl border p-4 transition-colors",
        notification.leida
          ? "border-border bg-card"
          : "border-terracotta/25 bg-terracotta/[0.04]",
      ].join(" ")}
    >
      <div className="flex gap-3">
        <span
          aria-hidden="true"
          className={[
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            notification.leida
              ? "bg-muted text-coffee-deep"
              : "bg-terracotta/10 text-terracotta-deep",
          ].join(" ")}
        >
          <Icon className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm font-semibold text-carbon">
              {notification.titulo}
            </p>
            {!notification.leida ? (
              <span className="rounded-full bg-terracotta px-2 py-0.5 text-[10px] font-bold tracking-wide text-cream uppercase">
                Nueva
              </span>
            ) : null}
          </div>

          {notification.texto ? (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {notification.texto}
            </p>
          ) : null}

          <p className="mt-2 text-xs text-muted-foreground [font-variant-numeric:tabular-nums]">
            {formatDateTime(notification.createdAt)}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {href ? (
              <Link
                href={href}
                onClick={onOpen}
                className="inline-flex h-8 items-center rounded-full bg-carbon px-3 text-[11px] font-semibold text-cream transition-colors hover:bg-terracotta-deep"
              >
                Ver detalle
              </Link>
            ) : null}

            {!notification.leida ? (
              <button
                type="button"
                onClick={onRead}
                disabled={pending !== null}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 text-[11px] font-semibold text-carbon transition-colors hover:border-carbon disabled:opacity-60"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                {pending === "read" ? "Marcando…" : "Marcar leída"}
              </button>
            ) : null}

            <button
              type="button"
              onClick={onDelete}
              disabled={pending !== null}
              className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-terracotta-deep disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {pending === "delete" ? "Eliminando…" : "Eliminar"}
            </button>
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-2 rounded-lg border border-terracotta/30 bg-card p-2 text-xs leading-relaxed text-terracotta-deep"
            >
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}
