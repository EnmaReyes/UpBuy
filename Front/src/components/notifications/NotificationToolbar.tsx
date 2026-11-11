"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Trash2 } from "lucide-react";
import {
  deleteAllNotifications,
  markAllNotificationsRead,
} from "@/services/notifications";
import { ApiError } from "@/services/api/client";

// Acciones globales de la bandeja. El borrado pide confirmación en línea
// (dos pasos), sin `window.confirm`.
export function NotificationToolbar({ hasUnread }: { hasUnread: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<"read" | "delete" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onMarkAll = async () => {
    setPending("read");
    setError(null);
    try {
      await markAllNotificationsRead();
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudieron marcar las notificaciones.",
      );
    } finally {
      setPending(null);
    }
  };

  const onDeleteAll = async () => {
    setPending("delete");
    setError(null);
    try {
      await deleteAllNotifications();
      setConfirmingDelete(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudieron eliminar las notificaciones.",
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {hasUnread ? (
          <button
            type="button"
            onClick={onMarkAll}
            disabled={pending !== null}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-xs font-semibold text-carbon transition-colors hover:border-carbon disabled:opacity-60"
          >
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
            {pending === "read" ? "Marcando…" : "Marcar todas como leídas"}
          </button>
        ) : null}

        {confirmingDelete ? (
          <>
            <span className="text-xs text-muted-foreground">
              ¿Eliminar todas?
            </span>
            <button
              type="button"
              onClick={onDeleteAll}
              disabled={pending !== null}
              className="inline-flex h-9 items-center rounded-full bg-terracotta px-4 text-xs font-semibold text-cream transition-colors hover:bg-terracotta-deep disabled:opacity-60"
            >
              {pending === "delete" ? "Eliminando…" : "Sí, eliminar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={pending !== null}
              className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-xs font-semibold text-carbon transition-colors hover:border-carbon disabled:opacity-60"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-terracotta-deep"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Eliminar todas
          </button>
        )}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-xs leading-relaxed text-terracotta-deep"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
