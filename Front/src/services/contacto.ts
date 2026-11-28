import { apiSend } from "@/services/api/client";

export type ContactoPayload = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

export type ContactoResponse = {
  message: string;
  id: string;
};

/**
 * Envía un mensaje desde el formulario público de contacto.
 * No requiere sesión: la cookie se envía si existe pero el backend no la exige.
 */
export async function enviarMensajeContacto(
  payload: ContactoPayload,
): Promise<ContactoResponse> {
  return apiSend<ContactoResponse>("/api/contacto", {
    method: "POST",
    body: payload,
  });
}
