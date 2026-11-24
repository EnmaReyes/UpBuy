"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/services/api/client";
import {
  loginWithFacebook,
  loginWithGoogle,
  type LoginResult,
} from "@/services/auth";
import { getDashboardRoute } from "@/lib/dashboard-route";
import { getGoogleClientId } from "@/lib/google-gis";
import {
  FacebookSdkError,
  getFacebookAppId,
  loginWithFacebookSdk,
} from "@/lib/facebook-sdk";
import { FormMessage } from "./fields";
import { FacebookButton } from "./FacebookButton";
import { GoogleButton } from "./GoogleButton";

// Bloque social compartido por /login y /registro.
//
// Es el único lugar que orquesta ambos proveedores: estados de carga y error,
// guardia contra doble clic, cancelación del usuario, rate limit y el flujo MFA
// de administradores (que devuelve al formulario padre). La sesión real la
// emite el backend en una cookie httpOnly; aquí solo se usa el marcador.

export type SocialMfaState =
  | { mode: "challenge"; challengeId: string }
  | { mode: "enroll"; enrollmentTicket: string; message: string };

type Provider = "google" | "facebook";

type SocialError = {
  text: string;
  link?: { href: string; label: string };
};

type SocialLoginProps = {
  /** El formulario tradicional está enviando: se bloquean ambos botones. */
  disabled?: boolean;
  /** Ruta interna segura de `?next=` (o null). */
  requestedPath: string | null;
  onMfa: (state: SocialMfaState) => void;
  /** Limpia el error del formulario tradicional al empezar. */
  onStart?: () => void;
  onPendingChange?: (pending: boolean) => void;
};

function describeError(provider: Provider, caught: unknown): SocialError & {
  disableProvider?: boolean;
} {
  if (caught instanceof FacebookSdkError) {
    // Mensaje personalizado para el error de requerimiento de HTTPS de Facebook
    if (
      caught.message.includes("requiere HTTPS") ||
      caught.message.includes("next dev --https")
    ) {
      return {
        text:
          "El acceso con Facebook requiere HTTPS. Ejecuta el servidor de desarrollo con: next dev --https",
        disableProvider: true,
      };
    }
    return caught.reason === "blocked"
      ? {
          text: "Tu navegador bloqueó la ventana de Facebook. Permite ventanas emergentes e inténtalo de nuevo.",
        }
      : {
          text: "No se pudo cargar el acceso con Facebook. Revisa tu conexión o el bloqueador de anuncios.",
          disableProvider: true,
        };
  }

  if (caught instanceof ApiError) {
    if (caught.status === 429) {
      return {
        text: "Demasiados intentos. Espera un minuto y vuelve a intentarlo.",
      };
    }

    if (provider === "google") {
      if (caught.status === 401) {
        return {
          text: "No pudimos validar tu cuenta de Google. Inténtalo de nuevo.",
        };
      }
      if (caught.status === 422) {
        return {
          text: "Google no compartió un correo verificado. Usa el registro tradicional o inicia sesión con tu usuario y contraseña.",
          link: { href: "/registro", label: "Ir al registro" },
        };
      }
      if (caught.status === 503) {
        return {
          text: "El acceso con Google no está disponible en este momento.",
          disableProvider: true,
        };
      }
    }

    if (provider === "facebook") {
      if (caught.status === 409) {
        return {
          text: "Ya existe una cuenta con ese correo. Inicia sesión con tu usuario y contraseña.",
          link: { href: "/login", label: "Iniciar sesión" },
        };
      }
      if (caught.status === 422) {
        return {
          text: "Facebook no compartió tu correo. Regístrate o inicia sesión de la forma tradicional.",
          link: { href: "/registro", label: "Ir al registro" },
        };
      }
      if (caught.status === 401) {
        return {
          text: "No pudimos validar tu cuenta de Facebook. Inténtalo de nuevo.",
        };
      }
      if (caught.status === 503) {
        return {
          text: "El acceso con Facebook no está disponible en este momento.",
          disableProvider: true,
        };
      }
    }

    if (caught.kind === "network") {
      return { text: "No se pudo conectar con el servidor. Inténtalo de nuevo." };
    }
  }

  return {
    text:
      provider === "google"
        ? "No se pudo completar el acceso con Google. Inténtalo de nuevo."
        : "No se pudo completar el acceso con Facebook. Inténtalo de nuevo.",
  };
}

export function SocialLogin({
  disabled = false,
  requestedPath,
  onMfa,
  onStart,
  onPendingChange,
}: SocialLoginProps) {
  const router = useRouter();
  const googleClientId = getGoogleClientId();
  const facebookAppId = getFacebookAppId();

  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<SocialError | null>(null);
  const [unavailable, setUnavailable] = useState<Record<Provider, boolean>>({
    google: false,
    facebook: false,
  });

  const mountedRef = useRef(true);
  const pendingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const begin = (provider: Provider): boolean => {
    if (pendingRef.current) return false;
    pendingRef.current = true;
    setPending(provider);
    setError(null);
    onStart?.();
    onPendingChange?.(true);
    return true;
  };

  const end = () => {
    pendingRef.current = false;
    if (!mountedRef.current) return;
    setPending(null);
    onPendingChange?.(false);
  };

  // La cookie ya está emitida. Se respeta ?next= o se decide por rol, igual que
  // el login tradicional. Los administradores caen en AdminMfaForm antes.
  const handleResult = (result: LoginResult) => {
    if (!mountedRef.current) return;

    if (result.kind === "mfa") {
      onMfa({ mode: "challenge", challengeId: result.challengeId });
      return;
    }
    if (result.kind === "enroll") {
      onMfa({
        mode: "enroll",
        enrollmentTicket: result.enrollmentTicket,
        message: result.message,
      });
      return;
    }

    router.replace(requestedPath ?? getDashboardRoute(result.user));
    router.refresh();
  };

  const showError = (provider: Provider, caught: unknown) => {
    const mapped = describeError(provider, caught);
    if (!mountedRef.current) return;
    if (mapped.disableProvider) {
      setUnavailable((current) => ({ ...current, [provider]: true }));
    }
    setError({ text: mapped.text, link: mapped.link });
  };

  const handleGoogleCredential = (credential: string) => {
    if (!credential.trim()) {
      setError({
        text: "No se pudo completar el acceso con Google. Inténtalo de nuevo.",
      });
      return;
    }

    if (!begin("google")) return;

    void (async () => {
      try {
        handleResult(await loginWithGoogle(credential));
      } catch (caught) {
        showError("google", caught);
      } finally {
        end();
      }
    })();
  };

  const handleFacebookClick = () => {
    if (!facebookAppId || pendingRef.current) return;
    if (!begin("facebook")) return;

    void (async () => {
      try {
        const accessToken = await loginWithFacebookSdk(facebookAppId);
        if (!mountedRef.current) return;
        // Cancelación del usuario: se limpia la carga sin error rojo.
        if (!accessToken) return;

        handleResult(await loginWithFacebook(accessToken));
      } catch (caught) {
        showError("facebook", caught);
      } finally {
        end();
      }
    })();
  };

  const showGoogle = Boolean(googleClientId) && !unavailable.google;
  const showFacebook = Boolean(facebookAppId) && !unavailable.facebook;

  // Sin variables públicas no se rompe nada: el formulario tradicional sigue.
  if (!showGoogle && !showFacebook) return null;

  const busy = pending !== null;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs tracking-[0.2em] text-coffee-deep uppercase">
          O continúa con
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {showGoogle && googleClientId ? (
          <GoogleButton
            clientId={googleClientId}
            disabled={disabled || busy}
            onCredential={handleGoogleCredential}
          />
        ) : null}

        {showFacebook ? (
          <FacebookButton
            pending={pending === "facebook"}
            disabled={disabled || (busy && pending !== "facebook")}
            onClick={handleFacebookClick}
          />
        ) : null}
      </div>

      {error ? (
        <div className="mt-4">
          <FormMessage kind="error">
            {error.text}
            {error.link ? (
              <>
                {" "}
                <Link
                  href={error.link.href}
                  className="font-semibold underline underline-offset-4 hover:text-carbon focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                >
                  {error.link.label}
                </Link>
              </>
            ) : null}
          </FormMessage>
        </div>
      ) : null}

      <p className="mt-4 text-xs leading-relaxed text-coffee-deep">
        Al continuar aceptas nuestra{" "}
        <Link
          href="/politica-de-privacidad"
          className="font-semibold text-carbon underline underline-offset-4 transition-colors hover:text-terracotta-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
        >
          política de privacidad
        </Link>{" "}
        y los{" "}
        <Link
          href="/terminos-y-condiciones"
          className="font-semibold text-carbon underline underline-offset-4 transition-colors hover:text-terracotta-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
        >
          términos y condiciones
        </Link>
        .
      </p>
    </div>
  );
}
