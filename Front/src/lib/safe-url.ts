export function safeHttpUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : null;
}

/**
 * Ruta interna segura para un enlace. Rechaza URLs absolutas, protocolos
 * (`javascript:`) y el panel de administración, que no existe en este front.
 */
export function safeInternalPath(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/admin")) return null;
  return value;
}
