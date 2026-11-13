import { apiSend, apiSessionProbe, ApiError } from "@/services/api/client";
import {
  clearSessionMarker,
  hasSessionMarker,
  setSessionMarker,
} from "@/lib/session-marker";
import type { AuthUser, Credentials, RegisterInput } from "@/types/auth";

// Autenticación (client): registro, login, MFA de administradores y logout.
// La sesión vive en una cookie httpOnly, así que no hay nada que guardar en
// el navegador más allá del marcador (ver lib/session-marker.ts).

export type AdminEnrollment = {
  secret: string;
  otpauthUrl: string;
  backupCodes: string[];
  issuer: string;
  account: string;
};

export type LoginResult =
  | { kind: "authenticated"; user: AuthUser }
  | { kind: "mfa"; challengeId: string; expiresAt: string | null }
  | { kind: "enroll"; enrollmentTicket: string; message: string };

type LoginResponse =
  | AuthUser
  | { mfaRequired: true; challengeId: string; expiresAt?: string };

/**
 * Inicia sesión. Un administrador con MFA no recibe la cookie todavía: la API
 * responde `202` con un reto (segundo paso) o `403 ADMIN_MFA_SETUP_REQUIRED`
 * con un ticket de enrolamiento. En ambos casos se devuelve el estado para que
 * el formulario continúe el flujo.
 */
export async function login({
  username,
  password,
}: Credentials): Promise<LoginResult> {
  try {
    const result = await apiSend<LoginResponse>("/api/auth/login", {
      body: { username, password },
    });

    if (
      result &&
      typeof result === "object" &&
      "mfaRequired" in result &&
      result.mfaRequired === true
    ) {
      return {
        kind: "mfa",
        challengeId: result.challengeId,
        expiresAt: result.expiresAt ?? null,
      };
    }

    setSessionMarker();
    return { kind: "authenticated", user: result as AuthUser };
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.code === "ADMIN_MFA_SETUP_REQUIRED"
    ) {
      const ticket = error.details?.enrollmentTicket;
      if (typeof ticket === "string" && ticket.trim()) {
        return {
          kind: "enroll",
          enrollmentTicket: ticket,
          message: error.message,
        };
      }
    }
    throw error;
  }
}

/** Segundo paso del login administrativo: TOTP o código de respaldo. */
export async function verifyAdminMfa({
  challengeId,
  code,
}: {
  challengeId: string;
  code: string;
}): Promise<AuthUser> {
  const user = await apiSend<AuthUser>("/api/auth/admin/mfa", {
    body: { challengeId, code },
  });
  setSessionMarker();
  return user;
}

/** Genera el secreto TOTP y los códigos de respaldo (se muestran una vez). */
export async function setupAdminMfa(
  enrollmentTicket: string,
): Promise<AdminEnrollment> {
  return apiSend<AdminEnrollment>("/api/auth/admin/mfa/setup", {
    body: { enrollmentTicket },
  });
}

/** Activa el MFA tras validar el primer código y emite la cookie. */
export async function enrollAdminMfa({
  enrollmentTicket,
  code,
}: {
  enrollmentTicket: string;
  code: string;
}): Promise<AuthUser> {
  const user = await apiSend<AuthUser>("/api/auth/admin/mfa/enroll", {
    body: { enrollmentTicket, code },
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
