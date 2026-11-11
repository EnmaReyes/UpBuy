import { apiSend, apiSessionProbe } from "@/services/api/client";
import {
  clearSessionMarker,
  hasSessionMarker,
  setSessionMarker,
} from "@/lib/session-marker";
import type { AuthUser, Credentials, RegisterInput } from "@/types/auth";

// Autenticación (client): registro, login y logout.
// La sesión vive en una cookie httpOnly, así que no hay nada que guardar en
// el navegador más allá del marcador (ver lib/session-marker.ts).

export async function login({ username, password }: Credentials): Promise<AuthUser> {
  const user = await apiSend<AuthUser>("/api/auth/login", {
    body: { username, password },
  });
  setSessionMarker();
  return user;
}

/** El backend responde con un texto: "Usuario creado con éxito". */
export async function register({
  username,
  email,
  password,
}: RegisterInput): Promise<string> {
  return apiSend<string>("/api/auth/register", {
    body: { username, email, password },
  });
}

export async function logout(): Promise<void> {
  try {
    await apiSend<void>("/api/auth/logout");
  } finally {
    // Aunque falle la llamada, el marcador se limpia: la cookie real se
    // reconcilia en la siguiente sonda.
    clearSessionMarker();
  }
}

/** Sesión actual en el navegador. `null` si no hay o el backend no responde. */
export async function getSessionClient(): Promise<AuthUser | null> {
  // Sin marcador no hay nada que sondear: son las visitas anónimas.
  if (!hasSessionMarker()) return null;

  const { status, data } = await apiSessionProbe<AuthUser>("/api/auth/me");

  if (data) return data;

  // 401/404 = la sesión ya no vale (caducada o de un usuario que ya no existe).
  if (status === 401 || status === 404) {
    clearSessionMarker();
    if (status === 404) {
      void apiSend<void>("/api/auth/logout").catch(() => {});
    }
  }

  return null;
}