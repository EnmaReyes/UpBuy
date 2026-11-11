// Notificaciones del comprador.
//
// Reflejan `GET /api/notifications`: el backend devuelve las filas del modelo
// `Notificacion` + total, no leídas, límite y offset. `to` es una ruta interna
// creada por el backend (p. ej. `/pedido/:id`); puede venir null.

export type Notification = {
  id: string;
  userId: string;
  tipo: string;
  titulo: string;
  texto: string | null;
  to: string | null;
  leida: boolean;
  clave: string | null;
  orderId: string | null;
  channel: string;
  sentAt: string | null;
  payload?: Record<string, unknown>;
  createdAt: string;
};

export type NotificationList = {
  notifications: Notification[];
  total: number;
  unread: number;
  limit: number;
  offset: number;
};
