// Marcador de sesión del navegador.
//
// La cookie real (`access_token`) es httpOnly: el front no puede leerla. Para
// no sondear `/api/auth/me` en cada visita anónima (una petición y un 401 en
// consola por carga), el inicio de sesión deja esta cookie legible.
//
// No es una credencial: solo indica "probablemente hay sesión". El estado real
// siempre lo decide el backend, y si la cookie se queda huérfana la sonda
// devuelve 401/404 y el marcador se limpia.

const MARKER = "upbuy_session";
const MAX_AGE_SECONDS = 12 * 60 * 60; // igual que la cookie de sesión

const isBrowser = () => typeof document !== "undefined";

export function hasSessionMarker(): boolean {
  if (!isBrowser()) return false;
  return document.cookie.split("; ").some((entry) => entry.startsWith(`${MARKER}=`));
}

export function setSessionMarker(): void {
  if (!isBrowser()) return;
  document.cookie = `${MARKER}=1; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}

export function clearSessionMarker(): void {
  if (!isBrowser()) return;
  document.cookie = `${MARKER}=; path=/; max-age=0; samesite=lax`;
}