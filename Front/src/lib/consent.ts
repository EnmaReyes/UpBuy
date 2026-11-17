// Consentimiento de cookies de UPBUY.
//
// Se guarda en localStorage (no en una cookie) para no enviar la decisión al
// servidor en cada petición. La clave es estable y versionada; si cambia la
// versión del aviso, la decisión anterior deja de ser válida y se vuelve a
// preguntar.

export const CONSENT_STORAGE_KEY = "upbuy.consent.v1";
export const CONSENT_VERSION = 1;
export const CONSENT_OPEN_EVENT = "upbuy:consent-open";
export const CONSENT_UPDATED_EVENT = "upbuy:consent-updated";

export type ConsentCategory =
  | "necessary"
  | "preferences"
  | "analytics"
  | "marketing";

export type ConsentCategories = {
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
};

export type ConsentSource = "accept-all" | "reject-all" | "save";

export type ConsentRecord = {
  version: typeof CONSENT_VERSION;
  updatedAt: string;
  source: ConsentSource;
  categories: ConsentCategories;
};

export const DEFAULT_DENIED: ConsentCategories = {
  necessary: true,
  preferences: false,
  analytics: false,
  marketing: false,
};

export const ALL_GRANTED: ConsentCategories = {
  necessary: true,
  preferences: true,
  analytics: true,
  marketing: true,
};

const isBrowser = () => typeof window !== "undefined";

function normalizeCategories(value: unknown): ConsentCategories {
  const raw = (value ?? {}) as Partial<Record<ConsentCategory, unknown>>;

  return {
    necessary: true,
    preferences: Boolean(raw.preferences),
    analytics: Boolean(raw.analytics),
    marketing: Boolean(raw.marketing),
  };
}

/** Devuelve la decisión guardada o `null` si no existe o no es válida. */
export function readConsent(): ConsentRecord | null {
  if (!isBrowser()) return null;

  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    if (parsed.version !== CONSENT_VERSION) return null;

    const updatedAt =
      typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString();
    const source: ConsentSource =
      parsed.source === "accept-all" ||
      parsed.source === "reject-all" ||
      parsed.source === "save"
        ? parsed.source
        : "save";

    return {
      version: CONSENT_VERSION,
      updatedAt,
      source,
      categories: normalizeCategories(parsed.categories),
    };
  } catch {
    return null;
  }
}

/** Guarda la decisión y avisa a los componentes suscritos. */
export function writeConsent(
  categories: ConsentCategories,
  source: ConsentSource,
): ConsentRecord {
  const record: ConsentRecord = {
    version: CONSENT_VERSION,
    updatedAt: new Date().toISOString(),
    source,
    categories: normalizeCategories(categories),
  };

  if (isBrowser()) {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
      window.dispatchEvent(new Event(CONSENT_UPDATED_EVENT));
    } catch {
      // Si el navegador bloquea el almacenamiento, la decisión vale para esta
      // visita; el aviso volverá a aparecer cuando el usuario recargue.
    }
  }

  return record;
}

export function hasConsentDecision(): boolean {
  return readConsent() !== null;
}

/** Abre el aviso/panel de consentimiento desde cualquier parte del sitio. */
export function openConsentPreferences(): void {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}
