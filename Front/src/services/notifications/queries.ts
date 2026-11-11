import { serverFetch } from "@/services/api/server";
import type { NotificationList } from "@/types/notification";

// Lectura de notificaciones en el servidor (reenvía la cookie de sesión).

export async function listNotifications(
  params: { limit?: number; offset?: number } = {},
): Promise<NotificationList> {
  return serverFetch<NotificationList>("/api/notifications", {
    query: params,
  });
}
