// Utilidades compartidas de Google Identity Services.
//
// El SDK lo carga `GoogleButton` con `next/script` (solo en /login y /registro).
// Aquí viven las dos piezas que también necesita el resto de la app:
//   - el Client ID público (se incrusta en build),
//   - el cierre de la selección automática al salir de la cuenta.
//
// El secreto de Google nunca se referencia en el front: el backend es el único
// que verifica el ID token.

export function getGoogleClientId(): string | null {
  const value = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  return value ? value : null;
}

/**
 * Evita que el siguiente usuario entre con la cuenta de Google anterior.
 * El SDK puede no estar cargado (p. ej. logout desde el panel), así que la
 * llamada es opcional y nunca debe romper el cierre de sesión.
 */
export function disableGoogleAutoSelect(): void {
  if (typeof window === "undefined") return;
  try {
    window.google?.accounts?.id?.disableAutoSelect();
  } catch {
    // SDK no disponible o bloqueado: no hay nada que limpiar.
  }
}
