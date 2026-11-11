import { apiSend } from "@/services/api/client";
import type { CreateOrderInput, Order } from "@/types/order";

// Pedidos: solo la mutación que usa el navegador.
// Las lecturas de servidor viven en `./queries` para no arrastrar
// `next/headers` al bundle del cliente.

export async function createOrder(payload: CreateOrderInput): Promise<Order> {
  return apiSend<Order>("/api/orders", { body: payload });
}

/** Cancela un pedido propio. El backend decide si aún es cancelable. */
export async function cancelOrder(id: string): Promise<Order> {
  return apiSend<Order>(
    `/api/orders/${encodeURIComponent(id)}/cancel`,
    { method: "POST" },
  );
}
