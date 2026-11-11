import { cookies } from "next/headers";
import { apiFetch, type Query } from "./client";

// Helpers para Server Components: reenvían la cookie de la petición entrante
// al backend, porque el navegador no las adjunta en el fetch del servidor.
//
// Al leer `cookies()` el render pasa a ser dinámico: solo se usa en rutas que
// dependen de la sesión (cuenta), nunca en el catálogo público.

export async function getCookieHeader(): Promise<string> {
  const store = await cookies();
  return store.toString();
}

export async function serverFetch<T>(
  path: string,
  options: { query?: Query; revalidate?: number } = {},
): Promise<T> {
  return apiFetch<T>(path, {
    ...options,
    revalidate: options.revalidate ?? 0,
    headers: { Cookie: await getCookieHeader() },
  });
}

/** POST/PUT/DELETE desde el servidor reenviando la cookie de sesión. */
export async function serverSend<T>(
  path: string,
  { method = "POST", body }: { method?: "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${apiUrl()}${path}`, {
    method,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Cookie: await getCookieHeader(),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `El servidor respondió ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function apiUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}
