// Carga e inicialización del SDK de JavaScript de Facebook.
//
// Se carga bajo demanda (primer clic en "Continuar con Facebook"), nunca al
// abrir la página: menos peso y menos rastreo antes de que el usuario decida.
// El singleton vive en este módulo para no inyectar el script dos veces.
//
// El backend valida el accessToken contra el Graph API; aquí no se decide nada
// de la sesión de UPBUY. `cookie: false` es deliberado: no se dejan cookies de
// Facebook antes de que el usuario acepte en /preferencias-de-cookies.

/** Versión de Graph API verificada en el panel de Meta (changelog, nov. 2026). */
export const GRAPH_VERSION = "v27.0";

const SCRIPT_SRC = "https://connect.facebook.net/es_LA/sdk.js";
const SDK_TIMEOUT_MS = 15_000;
const LOGIN_TIMEOUT_MS = 90_000;

type FacebookAuthResponse = {
  accessToken: string;
  expiresIn: number;
  signedRequest: string;
  userID: string;
};

export type FacebookLoginResponse = {
  status: "connected" | "not_authorized" | "unknown";
  authResponse?: FacebookAuthResponse | null;
};

type FacebookInitOptions = {
  appId: string;
  cookie?: boolean;
  xfbml?: boolean;
  version: string;
};

export type FacebookSdk = {
  init(options: FacebookInitOptions): void;
  login(
    callback: (response: FacebookLoginResponse) => void,
    options?: { scope?: string },
  ): void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

export type FacebookSdkErrorReason = "load" | "blocked";

export class FacebookSdkError extends Error {
  readonly reason: FacebookSdkErrorReason;

  constructor(reason: FacebookSdkErrorReason, message: string) {
    super(message);
    this.name = "FacebookSdkError";
    this.reason = reason;
  }
}

let sdkPromise: Promise<FacebookSdk> | null = null;
let initialized = false;

export function getFacebookAppId(): string | null {
  const value = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID?.trim();
  return value ? value : null;
}

function initialize(sdk: FacebookSdk, appId: string): void {
  if (initialized) return;
  sdk.init({
    appId,
    cookie: false,
    xfbml: false,
    version: GRAPH_VERSION,
  });
  initialized = true;
}

/** Carga el SDK una sola vez y lo inicializa con la app pública. */
export function loadFacebookSdk(appId: string): Promise<FacebookSdk> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new FacebookSdkError("load", "El SDK de Facebook solo funciona en el navegador"),
    );
  }

  if (window.FB) {
    initialize(window.FB, appId);
    return Promise.resolve(window.FB);
  }

  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    let settled = false;
    const fail = (reason: FacebookSdkErrorReason, message: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      sdkPromise = null;
      reject(new FacebookSdkError(reason, message));
    };

    // Si el script está bloqueado (adblock, CSP, red) `onerror` no siempre
    // dispara; el timeout evita dejar el botón en "Conectando…" para siempre.
    const timeout = window.setTimeout(() => {
      fail("load", "No se pudo cargar el SDK de Facebook");
    }, SDK_TIMEOUT_MS);

    window.fbAsyncInit = () => {
      if (settled) return;
      const sdk = window.FB;
      if (!sdk) {
        fail("load", "El SDK de Facebook no se inicializó");
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      initialize(sdk, appId);
      resolve(sdk);
    };

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => {
      fail("load", "No se pudo cargar el SDK de Facebook");
    };
    document.body.appendChild(script);
  });

  return sdkPromise;
}

/**
 * Abre el diálogo de Facebook y devuelve el accessToken.
 * `null` = el usuario canceló o no autorizó (no es un error).
 */
export async function loginWithFacebookSdk(
  appId: string,
): Promise<string | null> {
  const sdk = await loadFacebookSdk(appId);

  return new Promise<string | null>((resolve, reject) => {
    let settled = false;
    const finish = (token: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(token);
    };

    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        new FacebookSdkError(
          "blocked",
          "El navegador bloqueó o no abrió la ventana de Facebook",
        ),
      );
    }, LOGIN_TIMEOUT_MS);

    try {
      sdk.login(
        (response) => {
          if (
            response.status === "connected" &&
            response.authResponse?.accessToken
          ) {
            finish(response.authResponse.accessToken);
            return;
          }
          // "unknown" / "not_authorized" = cancelación del usuario.
          finish(null);
        },
        { scope: "email,public_profile" },
      );
    } catch {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      reject(
        new FacebookSdkError(
          "blocked",
          "El navegador bloqueó la ventana de Facebook",
        ),
      );
    }
  });
}
