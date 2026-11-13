// Cliente HTTP centralizado.
//
// - La base URL vive en `NEXT_PUBLIC_API_URL` (pública, sin secretos).
// - Los errores se normalizan a `ApiError` para distinguir "no existe" (404),
//   "sin sesión" (401) o "la API no responde" (red/5xx) sin adivinar.
// - `apiFetch` es para lecturas públicas (catálogo). `apiSend` es para
//   peticiones con sesión: envía cookies (`credentials: "include"`).
// - El backend responde errores como texto JSON (p. ej. `"Usuario Existente"`),
//   así que el cuerpo se inspecciona antes de tipar el error.

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

export type ApiErrorKind = "network" | "http" | "parse";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  /** Código del backend cuando lo envía (p. ej. `PROFILE_INCOMPLETE`). */
  readonly code: string | null;

  constructor(
    message: string,
    {
      kind,
      status = null,
      code = null,
    }: { kind: ApiErrorKind; status?: number | null; code?: string | null },
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }

  get isNotFound(): boolean {
    return this.kind === "http" && this.status === 404;
  }

  get isUnauthorized(): boolean {
    return this.kind === "http" && this.status === 401;
  }
}

export type Query = Record<
  string,
  string | number | boolean | undefined | null
>;

type FetchOptions = {
  query?: Query;
  /** Revalidación ISR en segundos. `0` = sin caché. */
  revalidate?: number;
  headers?: Record<string, string>;
};

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

// El backend responde `"texto"` o `{ message, code }` según la ruta.
async function readError(
  response: Response,
): Promise<{ message: string; code: string | null }> {
  const fallback = `El servidor respondió ${response.status}`;

  try {
    const payload: unknown = await response.json();

    if (typeof payload === "string" && payload.trim()) {
      return { message: payload, code: null };
    }

    if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      const message =
        typeof record.message === "string" ? record.message : fallback;
      const code = typeof record.code === "string" ? record.code : null;
      return { message, code };
    }

    return { message: fallback, code: null };
  } catch {
    return { message: fallback, code: null };
  }
}

/** Lectura pública (catálogo). No envía cookies. */
export async function apiFetch<T>(
  path: string,
  { query, revalidate = 60, headers }: FetchOptions = {},
): Promise<T> {
  const url = buildUrl(path, query);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", ...headers },
      next: { revalidate },
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor", {
      kind: "network",
    });
  }

  if (!response.ok) {
    const { message, code } = await readError(response);
    throw new ApiError(message, { kind: "http", status: response.status, code });
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError("La respuesta del servidor no es válida", {
      kind: "parse",
    });
  }
}

type SendOptions = {
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
};

/** Petición con sesión: envía y recibe la cookie `access_token`. */
export async function apiSend<T>(
  path: string,
  { method = "POST", body }: SendOptions = {},
): Promise<T> {
  const url = buildUrl(path);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        // CSRF: el backend exige esta cabecera en toda mutacion con cookie de
        // sesion. Al no ser una cabecera "simple", el navegador hace preflight
        // y CORS solo lo autoriza para el origen del frontend.
        "X-Upbuy-CSRF": "1",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor", {
      kind: "network",
    });
  }

  if (!response.ok) {
    const { message, code } = await readError(response);
    throw new ApiError(message, { kind: "http", status: response.status, code });
  }

  if (response.status === 204) return undefined as T;

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError("La respuesta del servidor no es válida", {
      kind: "parse",
    });
  }
}

/**
 * Lectura con sesión que nunca lanza: devuelve `null` si no hay sesión o si el
 * backend no responde. Pensada para widgets optimistas (p. ej. el botón de
 * cuenta del navbar), donde un fallo no debe romper la página.
 */
export async function apiGetOptional<T>(path: string): Promise<T | null> {
  const { data } = await apiSessionProbe<T>(path);
  return data;
}

/**
 * Igual que `apiGetOptional` pero informa el estado HTTP. Se usa para detectar
 * una sesión que apunta a un usuario que ya no existe (404) y limpiarla.
 */
export async function apiSessionProbe<T>(
  path: string,
): Promise<{ status: number; data: T | null }> {
  try {
    const response = await fetch(buildUrl(path), {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) return { status: response.status, data: null };
    return { status: response.status, data: (await response.json()) as T };
  } catch {
    return { status: 0, data: null };
  }
}
