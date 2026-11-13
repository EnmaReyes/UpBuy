export function safeHttpUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : null;
}

/**
 * Ruta interna segura para un enlace. Rechaza URLs absolutas y protocolos
 * (`javascript:`). Desde ADM-1 el panel `/admin` sí existe en este front, así
 * que se permite como destino.
 */
export function safeInternalPath(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}
