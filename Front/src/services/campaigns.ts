// Baja pública de difusión (ADM-7).
//
// El correo de campañas enlaza a `${FRONT}/baja?token=<JWT firmado>`. Esta
// función confirma la baja contra el endpoint público del backend. La
// respuesta es una página HTML (contrato del backend), así que solo nos
// interesa el código HTTP: 200 baja aplicada (idempotente), otro código no.

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

export type UnsubscribeResult = {
  ok: boolean;
  status: number;
  message: string;
};

export async function confirmUnsubscribe(
  token: string,
): Promise<UnsubscribeResult> {
  if (!token) {
    return {
      ok: false,
      status: 400,
      message: "Falta el enlace de baja: ábrelo desde tu correo.",
    };
  }

  try {
    const response = await fetch(
      `${API_URL}/api/public/campaigns/unsubscribe?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );

    if (response.ok) {
      return { ok: true, status: response.status, message: "" };
    }

    const fallback =
      response.status === 400
        ? "El enlace de baja no es válido o ya expiró."
        : response.status === 404
          ? "No encontramos esta cuenta."
          : "No se pudo procesar la baja. Intenta de nuevo más tarde.";

    return { ok: false, status: response.status, message: fallback };
  } catch {
    return {
      ok: false,
      status: 0,
      message: "No se pudo conectar con el servidor. Intenta de nuevo más tarde.",
    };
  }
}
