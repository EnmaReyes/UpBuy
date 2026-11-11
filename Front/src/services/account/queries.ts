import { serverFetch } from "@/services/api/server";
import { ApiError } from "@/services/api/client";
import type { Address, AuthUser, Profile } from "@/types/auth";

// Lecturas de sesión, perfil y direcciones en el servidor.
//
// Reenvían la cookie de la petición entrante. Si no hay sesión, `getSession`
// devuelve `null` en vez de lanzar: "no autenticado" es un estado normal.

export async function getSession(): Promise<AuthUser | null> {
  try {
    return await serverFetch<AuthUser>("/api/auth/me");
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) return null;
    return null;
  }
}

export async function getProfile(): Promise<Profile> {
  return serverFetch<Profile>("/api/users/me");
}

export async function listAddresses(): Promise<Address[]> {
  const data = await serverFetch<{ addresses: Address[] }>(
    "/api/users/me/addresses",
  );
  return data.addresses ?? [];
}
