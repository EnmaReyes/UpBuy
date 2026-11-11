import { apiGetOptional, apiSend } from "@/services/api/client";
import type { Notification } from "@/types/notification";

// Mutaciones y contador de notificaciones (client, con sesión).

/** Contador de no leídas. Devuelve 0 si no hay sesión o el backend falla. */
export async function getUnreadCount(): Promise<number> {
  const data = await apiGetOptional<{ count: number }>(
    "/api/notifications/unread-count",
  );
  return data?.count ?? 0;
}

export async function markNotificationRead(id: string): Promise<Notification> {
  const item = await apiSend<Notification>(
    `/api/notifications/${encodeURIComponent(id)}/read`,
    { method: "PATCH" },
  );
  emitChanged();
  return item;
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiSend<string>("/api/notifications/read-all", { method: "PATCH" });
  emitChanged();
}

export async function deleteNotification(id: string): Promise<void> {
  await apiSend<void>(`/api/notifications/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  emitChanged();
}

export async function deleteAllNotifications(): Promise<void> {
  await apiSend<void>("/api/notifications", { method: "DELETE" });
  emitChanged();
}

/**
 * Avisa al navbar para que vuelva a pedir el contador. La bandeja y la
 * campana son árboles distintos: `router.refresh()` actualiza la página pero
 * no el contador del navbar.
 */
function emitChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("upbuy:notifications-changed"));
}
