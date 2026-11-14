// Preferencia de las notificaciones del navegador para los avisos de compra
// del panel. Está apagada por defecto y solo se activa con un gesto explícito.

export const BROWSER_ALERTS_STORAGE_KEY = "upbuy.admin.browser-alerts";

export function browserAlertsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function browserAlertsEnabled(): boolean {
  if (!browserAlertsSupported()) return false;
  try {
    return window.localStorage.getItem(BROWSER_ALERTS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setBrowserAlertsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) {
      window.localStorage.setItem(BROWSER_ALERTS_STORAGE_KEY, "1");
    } else {
      window.localStorage.removeItem(BROWSER_ALERTS_STORAGE_KEY);
    }
  } catch {
    // Modo privado o almacenamiento bloqueado: la preferencia no persiste.
  }
}
