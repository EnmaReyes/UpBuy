"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/services/api/client";
import { login } from "@/services/auth";
import { safeInternalPath } from "@/lib/safe-url";
import { AdminMfaForm } from "./AdminMfaForm";
import { Field, FormMessage, SubmitButton, inputClass } from "./fields";

type MfaState =
  | { mode: "challenge"; challengeId: string }
  | { mode: "enroll"; enrollmentTicket: string; message: string };

// Inicio de sesión. El backend responde errores como texto ("Usuario no
// existente", "Contraseña Errada"), así que se muestran tal cual.
//
// Si la cuenta es administrativa, el backend no emite cookie en el primer
// paso: devuelve un reto MFA o el ticket para configurarlo. En ese caso el
// formulario cambia al segundo paso y vuelve aquí con "Volver".
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath =
    safeInternalPath(searchParams?.get("next")) ?? "/cuenta/perfil";

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfa, setMfa] = useState<MfaState | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);

    try {
      const result = await login({
        username: String(form.get("username") ?? "").trim(),
        password: String(form.get("password") ?? ""),
      });

      if (result.kind === "mfa") {
        setMfa({ mode: "challenge", challengeId: result.challengeId });
        setPending(false);
        return;
      }

      if (result.kind === "enroll") {
        setMfa({
          mode: "enroll",
          enrollmentTicket: result.enrollmentTicket,
          message: result.message,
        });
        setPending(false);
        return;
      }

      // La cookie ya está emitida; se refresca para que el servidor la lea.
      router.replace(nextPath);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudo iniciar sesión. Inténtalo de nuevo.",
      );
      setPending(false);
    }
  };

  if (mfa?.mode === "challenge") {
    return (
      <AdminMfaForm
        mode="challenge"
        challengeId={mfa.challengeId}
        nextPath={nextPath}
        onBack={() => setMfa(null)}
      />
    );
  }

  if (mfa?.mode === "enroll") {
    return (
      <AdminMfaForm
        mode="enroll"
        enrollmentTicket={mfa.enrollmentTicket}
        nextPath={nextPath}
        onBack={() => setMfa(null)}
      />
    );
  }

  return (
    <div>
      <h1 className="font-heading text-[clamp(1.75rem,3vw,2.5rem)] leading-tight font-bold tracking-tight text-carbon">
        Inicia sesión
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Entra para ver tus pedidos, tus direcciones y comprar más rápido.
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
        <Field id="login-username" label="Usuario">
          <input
            id="login-username"
            name="username"
            type="text"
            autoComplete="username"
            required
            className={inputClass}
            placeholder="tu-usuario"
          />
        </Field>

        <Field id="login-password" label="Contraseña">
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
            placeholder="••••••••"
          />
        </Field>

        {error ? <FormMessage kind="error">{error}</FormMessage> : null}

        <SubmitButton pending={pending} className="w-full">
          Entrar
        </SubmitButton>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        ¿Todavía no tienes cuenta?{" "}
        <Link
          href="/registro"
          className="font-semibold text-carbon underline underline-offset-4 hover:text-terracotta-deep"
        >
          Crear una cuenta
        </Link>
      </p>
    </div>
  );
}
